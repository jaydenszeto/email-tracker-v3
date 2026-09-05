console.log("🚀 Email Tracker: Extension loaded!");

const DEFAULT_API_URL = "https://jaydenszeto.me/email-tracker";
const LEGACY_API_URLS = ["https://email-tracker-v3.onrender.com"];

let API_URL = DEFAULT_API_URL;
let AUTO_TRACK_ENABLED = true;
let API_KEY = null;

const SELF_OPEN_SUPPRESSION_SECONDS = 45;
// Per-email timestamp of the last suppress call we sent (throttle).
const selfOpenSuppressionCache = new Map();
// Latest list of tracked emails from the server, refreshed by the inbox
// indicator loop. Used so self-view reports never wait on a fetch.
let trackedEmailsCache = [];
let trackedEmailsCacheAt = 0;
const TRACKED_CACHE_TTL_MS = 30 * 1000;

function normalizeApiUrl(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  if (!trimmed || LEGACY_API_URLS.includes(trimmed)) {
    return DEFAULT_API_URL;
  }
  return trimmed;
}

chrome.storage.sync.get(["apiUrl", "autoTrack", "apiKey"], (result) => {
  API_URL = normalizeApiUrl(result.apiUrl);
  if (result.autoTrack !== undefined) AUTO_TRACK_ENABLED = result.autoTrack;
  if (result.apiKey) API_KEY = result.apiKey;

  console.log("⚙️ Email Tracker: Settings loaded:", {
    API_URL,
    AUTO_TRACK_ENABLED,
    hasApiKey: !!API_KEY,
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiUrl) {
    API_URL = normalizeApiUrl(changes.apiUrl.newValue);
    console.log("🔄 Email Tracker: Server URL updated to:", API_URL);
  }
  if (changes.autoTrack) {
    AUTO_TRACK_ENABLED = changes.autoTrack.newValue;
    console.log("🔄 Email Tracker: Auto-track changed to:", AUTO_TRACK_ENABLED);
  }
  if (changes.apiKey) {
    API_KEY = changes.apiKey.newValue;
    selfOpenSuppressionCache.clear();
    trackedEmailsCache = [];
    trackedEmailsCacheAt = 0;
    console.log("🔄 Email Tracker: API key updated");
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTrackedSubject(subject) {
  return String(subject || "")
    .replace(/^\s*((re|fw|fwd):\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function apiHeaders(extra = {}) {
  return { "X-API-Key": API_KEY, ...extra };
}

const COMPOSE_EDITOR_SELECTORS = [
  'div[aria-label="Message Body"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[g_editable="true"]',
];

function findEditor(root) {
  for (const selector of COMPOSE_EDITOR_SELECTORS) {
    const editor = root.querySelector(selector);
    if (editor) {
      return editor;
    }
  }
  return null;
}

function isSendButton(button) {
  const label = `${button.getAttribute("aria-label") || ""} ${
    button.getAttribute("data-tooltip") || ""
  }`.trim();
  // "Send ‪(⌘Enter)‬" — but not "More send options" / "Send later".
  return /^send\b/i.test(label) && !/later|options|schedule/i.test(label);
}

function findSendButton(composeWindow) {
  const buttons = composeWindow.querySelectorAll(
    'div[role="button"], button, td[role="button"]'
  );
  for (const button of buttons) {
    if (isSendButton(button)) {
      return button;
    }
  }
  return composeWindow.querySelector("div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3");
}

// Verified against Gmail (Sep 2026): a pop-out compose is a role="dialog";
// an inline reply has no dialog/form at all — the editor sits ~13 levels
// below the element that also holds the Send button. So: dialog if present,
// otherwise the nearest ancestor that contains a Send button.
function findComposeContainer(editor) {
  const dialog = editor.closest('div[role="dialog"]');
  if (dialog) {
    return dialog;
  }

  let node = editor.parentElement;
  while (node && node !== document.body) {
    if (findSendButton(node)) {
      return node;
    }
    node = node.parentElement;
  }

  return editor.closest("form");
}

function getEmailSubject(composeWindow) {
  const selectors = [
    'input[name="subjectbox"]',
    'input[placeholder*="Subject"]',
    'input[aria-label*="Subject"]',
  ];

  for (const selector of selectors) {
    const subjectInput = composeWindow.querySelector(selector);
    const subject = subjectInput?.value?.trim();
    if (subject) {
      return subject;
    }
  }

  // Inline replies keep the thread subject in a hidden field, or show it as
  // the thread header. A pop-out compose with an empty subject box really
  // has no subject yet — don't borrow a heading from elsewhere on the page.
  const hiddenSubject = composeWindow.querySelector('input[name="subject"]');
  if (hiddenSubject?.value?.trim()) {
    return hiddenSubject.value.trim();
  }
  if (!composeWindow.matches('div[role="dialog"]')) {
    const threadSubject = getCurrentThreadSubject();
    if (threadSubject) {
      return threadSubject;
    }
  }

  return "No Subject";
}

function getRecipientEmail(composeWindow) {
  // Gmail's To row is `div[name="to"]` (aria-label "To"); recipient chips
  // inside it carry the address in `email` / `data-hovercard-id`. Avoid the
  // loose `[aria-label*="To"]` match — it also hits "Toggle confidential mode".
  const candidates = [
    ...composeWindow.querySelectorAll(
      'div[name="to"], div[aria-label="To"], textarea[name="to"], input[aria-label="To recipients"]'
    ),
  ];

  for (const toField of candidates) {
    const emailSpan = toField.querySelector("span[email]");
    if (emailSpan) {
      return emailSpan.getAttribute("email");
    }

    for (const card of toField.querySelectorAll("[data-hovercard-id]")) {
      const email = card.getAttribute("data-hovercard-id");
      if (email && email.includes("@")) {
        return email;
      }
    }

    const text = toField.value || toField.textContent || "";
    const emailMatch = text.trim().match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      return emailMatch[0];
    }
  }

  // Newer Gmail: recipient chips carry the address in their own attributes.
  const chip = composeWindow.querySelector(
    'div[role="option"][data-hovercard-id], span[email], div[data-hovercard-id*="@"]'
  );
  if (chip) {
    return chip.getAttribute("email") || chip.getAttribute("data-hovercard-id");
  }

  // Inline reply: Gmail collapses the To row to a display name with no
  // address in the DOM. The reply goes to the sender of the latest message
  // in the open thread, whose header does carry the address.
  if (!composeWindow.matches('div[role="dialog"]')) {
    const senders = document.querySelectorAll("span.gD[email], h3 span[email]");
    const last = senders[senders.length - 1];
    if (last) {
      return last.getAttribute("email");
    }
  }

  return null;
}

function trackingIdFromUrl(url) {
  const match = String(url || "").match(/\/track\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Server calls
// ---------------------------------------------------------------------------

async function createTrackingPixel(subject, recipient) {
  if (!API_KEY) {
    showErrorIndicator("No API key - configure in extension");
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        subject,
        recipient: recipient || "Unknown",
        source: "gmail-extension",
        deferCountingUntilSent: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      showErrorIndicator(
        response.status === 401 ? "Invalid API key" : `Server error: ${response.status}`
      );
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Email Tracker: Error creating tracking pixel:", error);
    return null;
  }
}

async function suppressSelfOpenById(emailId, reason = "owner-open") {
  if (!API_KEY || !emailId) {
    return false;
  }

  const lastSuppressedAt = selfOpenSuppressionCache.get(emailId) || 0;
  const minInterval = (SELF_OPEN_SUPPRESSION_SECONDS * 1000) / 2;
  if (Date.now() - lastSuppressedAt < minInterval) {
    return true;
  }

  selfOpenSuppressionCache.set(emailId, Date.now());

  try {
    const response = await fetch(`${API_URL}/api/emails/${emailId}/suppress-self-open`, {
      method: "POST",
      keepalive: true,
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ seconds: SELF_OPEN_SUPPRESSION_SECONDS, reason }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return true;
  } catch (error) {
    selfOpenSuppressionCache.delete(emailId);
    console.error("❌ Email Tracker: Error suppressing self-open:", error);
    return false;
  }
}

// Reports "the owner is looking at this email right now". The server arms a
// suppression window AND deletes any open counted in the seconds around the
// report, which covers the race where Gmail's proxy fetched the pixel before
// this request arrived.
async function reportSelfViewById(emailId, reason = "thread-view") {
  if (!API_KEY || !emailId) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails/${emailId}/report-self-view`, {
      method: "POST",
      keepalive: true,
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reason }),
    });

    if (response.ok) {
      selfOpenSuppressionCache.set(emailId, Date.now());
    }
    return response.ok;
  } catch (error) {
    console.error("❌ Email Tracker: Error reporting self-view:", error);
    return false;
  }
}

async function markEmailAsSent(emailId, details = {}) {
  if (!API_KEY || !emailId) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails/${emailId}/mark-sent`, {
      method: "POST",
      keepalive: true,
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(details),
    });

    if (!response.ok) {
      console.error("❌ Email Tracker: Failed to mark email as sent:", response.status);
      return;
    }

    // The subject/recipient may have changed at send time; refresh so inbox
    // indicators and self-view matching use the final values.
    trackedEmailsCacheAt = 0;
    console.log("📤 Email Tracker: Marked as sent:", details.subject);
  } catch (error) {
    console.error("❌ Email Tracker: Error marking email as sent:", error);
  }
}

async function fetchTrackedEmails(force = false) {
  if (!API_KEY) {
    return [];
  }

  if (!force && Date.now() - trackedEmailsCacheAt < TRACKED_CACHE_TTL_MS) {
    return trackedEmailsCache;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails`, { headers: apiHeaders() });

    if (response.ok) {
      trackedEmailsCache = await response.json();
      trackedEmailsCacheAt = Date.now();
      return trackedEmailsCache;
    }
  } catch (error) {
    console.error("❌ Email Tracker: Error fetching tracked emails:", error);
  }

  return trackedEmailsCache;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function injectTrackingPixel(composeWindow, trackingUrl) {
  const editor = findEditor(composeWindow);

  if (!editor) {
    console.error("❌ Email Tracker: Could not find email editor");
    return false;
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = `<img src="${trackingUrl}" width="1" height="1" style="display:none !important; visibility:hidden !important; opacity:0 !important; position:absolute !important;" alt="" border="0" />`;
  const pixelElement = tempDiv.firstChild;

  try {
    editor.appendChild(pixelElement);
  } catch (error) {
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      range.insertNode(pixelElement);
    } catch (fallbackError) {
      console.error("❌ Email Tracker: Pixel injection failed:", fallbackError);
      return false;
    }
  }

  composeWindow.setAttribute("data-tracker-injected", "true");
  composeWindow.setAttribute("data-tracking-url", trackingUrl);
  return true;
}

function ensureToastAnimations() {
  if (document.getElementById("email-tracker-toast-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "email-tracker-toast-style";
  style.textContent = `
    @keyframes email-tracker-slide-in {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes email-tracker-fade-out {
      to { opacity: 0; transform: translateY(20px); }
    }
    @keyframes email-tracker-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.2); }
    }
  `;
  document.head.appendChild(style);
}

function showTrackingIndicator(trackingUrl) {
  ensureToastAnimations();
  document.querySelector(".email-tracker-indicator")?.remove();

  const indicator = document.createElement("div");
  indicator.className = "email-tracker-indicator";
  indicator.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:10px;height:10px;background:#22c55e;border-radius:50%;animation:email-tracker-pulse 2s infinite;"></div>
      <div>
        <div style="font-weight:600;font-size:13px;">📊 Email Tracking Active</div>
        <div style="font-size:10px;opacity:0.8;margin-top:2px;">Pixel added successfully</div>
      </div>
    </div>
  `;
  indicator.style.cssText = `
    position:fixed;bottom:30px;right:30px;background:rgba(0,0,0,0.95);
    border:2px solid #22c55e;color:#22c55e;padding:16px 20px;border-radius:10px;
    font-family:'IBM Plex Mono',monospace;font-size:12px;z-index:999999;
    box-shadow:0 8px 30px rgba(34,197,94,0.4);backdrop-filter:blur(10px);
    animation:email-tracker-slide-in 0.3s ease-out;cursor:pointer;
  `;
  indicator.title = trackingUrl;
  indicator.onclick = () => {
    navigator.clipboard?.writeText(trackingUrl).catch(() => {});
    indicator.querySelector("div div div:last-child").textContent =
      "Tracking URL copied";
  };

  document.body.appendChild(indicator);
  setTimeout(() => {
    indicator.style.animation = "email-tracker-fade-out 0.5s ease-out";
    setTimeout(() => indicator.remove(), 500);
  }, 8000);
}

function showErrorIndicator(message) {
  ensureToastAnimations();

  const indicator = document.createElement("div");
  indicator.innerHTML = `
    <div style="font-weight:600;margin-bottom:4px;">⚠️ Tracking Failed</div>
    <div style="font-size:10px;opacity:0.8;">${message}</div>
  `;
  indicator.style.cssText = `
    position:fixed;bottom:30px;right:30px;background:rgba(239,68,68,0.95);
    border:2px solid rgba(239,68,68,1);color:white;padding:16px 20px;
    border-radius:10px;font-family:'IBM Plex Mono',monospace;font-size:12px;
    z-index:999999;box-shadow:0 8px 30px rgba(239,68,68,0.4);
    animation:email-tracker-slide-in 0.3s ease-out;
  `;

  document.body.appendChild(indicator);
  setTimeout(() => indicator.remove(), 5000);
}

// ---------------------------------------------------------------------------
// Compose: send detection
// ---------------------------------------------------------------------------

// Gmail confirms a send with a snackbar ("Message sent" + Undo / View
// message). Closing or discarding a draft shows nothing of the sort, so this
// is the signal that separates "sent" from "closed" when the compose surface
// disappears.
function sentToastVisible() {
  if (document.querySelector("#link_undo, span[id='link_undo']")) {
    return true;
  }
  const alerts = document.querySelectorAll('[role="alert"], .bAq, .vh');
  for (const el of alerts) {
    if (/message sent|sending/i.test(el.textContent || "")) {
      return true;
    }
  }
  return false;
}

function setupSendButtonListener(composeWindow) {
  if (composeWindow.getAttribute("data-tracker-send-listener") === "true") {
    return;
  }
  composeWindow.setAttribute("data-tracker-send-listener", "true");

  let marked = false;
  let lastDetails = null;
  const captureDetails = () => {
    lastDetails = {
      subject: getEmailSubject(composeWindow),
      recipient: getRecipientEmail(composeWindow) || undefined,
    };
    return lastDetails;
  };

  const markTrackedEmailAsSent = (via) => {
    if (marked) {
      return;
    }
    const emailId = composeWindow.getAttribute("data-email-id");
    if (!emailId) {
      return;
    }
    marked = true;

    // Use the freshest subject/recipient we managed to read while the
    // compose DOM still existed (it is torn down right after Gmail sends).
    const details = {
      ...(document.body.contains(composeWindow) ? captureDetails() : lastDetails || {}),
      via,
    };

    // Gmail immediately renders the sent message through its image proxy in
    // the sender's own thread. Arm suppression before that fetch lands.
    suppressSelfOpenById(emailId, "send-action");
    setTimeout(() => markEmailAsSent(emailId, details), 1000);
    console.log("📨 Email Tracker: send detected via", via, details.subject);
  };

  // Delegated, capture-phase click: Gmail re-renders the Send button when the
  // compose state changes, so a listener bound to one button element can be
  // orphaned. Matching at click time on the container survives that.
  composeWindow.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.('div[role="button"], button, td[role="button"]');
      if (button && composeWindow.contains(button) && isSendButton(button)) {
        markTrackedEmailAsSent("click");
      }
    },
    true
  );

  // Keyboard send (Cmd/Ctrl+Enter) never clicks the Send button.
  composeWindow.addEventListener(
    "keydown",
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        markTrackedEmailAsSent("shortcut");
      }
    },
    true
  );

  // Keep a recent snapshot of subject/recipient so a send we only notice
  // *after* the compose DOM is gone still reports the final values.
  composeWindow.addEventListener("focusout", captureDetails, true);
  composeWindow.addEventListener("input", captureDetails, true);

  // Outcome-based fallback: when the compose surface disappears, look for
  // Gmail's "Message sent" confirmation for a few seconds. Present → sent.
  // Absent → the draft was closed/discarded and stays untracked-until-sent.
  const observer = new MutationObserver(() => {
    if (marked) {
      observer.disconnect();
      return;
    }
    if (document.body.contains(composeWindow)) {
      return;
    }
    observer.disconnect();

    const deadline = Date.now() + 8000;
    const poll = () => {
      if (marked) return;
      if (sentToastVisible()) {
        markTrackedEmailAsSent("sent-toast");
        return;
      }
      if (Date.now() < deadline) {
        setTimeout(poll, 250);
      } else {
        console.log("📝 Email Tracker: compose closed without a send confirmation (draft kept)");
      }
    };
    poll();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Compose: pixel injection
// ---------------------------------------------------------------------------

// A compose surface can already carry a pixel: Gmail re-creates the compose
// DOM when a window is popped out/minimised, and a draft reopened later keeps
// the pixel in its body. Re-attach to that tracked email instead of adding a
// second pixel (which would double count and evade send-time suppression).
async function adoptExistingPixel(composeWindow) {
  const editor = findEditor(composeWindow);
  if (!editor) {
    return false;
  }

  const images = editor.querySelectorAll('img[src*="/track/"]');
  for (const img of images) {
    // Quoted replies include the *previous* message's pixel; that one belongs
    // to a different tracked email and must be left alone.
    if (img.closest("blockquote, .gmail_quote, .gmail_quote_container")) {
      continue;
    }

    const trackingId = trackingIdFromUrl(img.getAttribute("src"));
    if (!trackingId) {
      continue;
    }

    const emails = await fetchTrackedEmails();
    const email = emails.find((e) => e.trackingId === trackingId);
    if (!email) {
      continue;
    }

    composeWindow.setAttribute("data-tracker-injected", "true");
    composeWindow.setAttribute("data-tracking-url", email.trackingUrl);
    composeWindow.setAttribute("data-email-id", email.id);
    setupSendButtonListener(composeWindow);
    console.log("♻️ Email Tracker: Re-attached to existing pixel:", email.subject);
    return true;
  }

  return false;
}

async function injectTrackingOnBodyFocus(composeWindow) {
  if (!AUTO_TRACK_ENABLED) {
    return;
  }

  if (composeWindow.getAttribute("data-tracker-injected") === "true") {
    return;
  }

  if (composeWindow.getAttribute("data-tracker-processing") === "true") {
    return;
  }

  composeWindow.setAttribute("data-tracker-processing", "true");

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (await adoptExistingPixel(composeWindow)) {
      return;
    }

    // Create the pixel as soon as the body is touched, even if the recipient
    // and subject aren't filled in yet — people often write the body first
    // and never click back into it. The final subject/recipient are sent
    // with the mark-sent call.
    const recipient = getRecipientEmail(composeWindow);
    const subject = getEmailSubject(composeWindow);
    const trackingData = await createTrackingPixel(subject, recipient);
    if (!trackingData) {
      return;
    }

    if (injectTrackingPixel(composeWindow, trackingData.trackingUrl)) {
      composeWindow.setAttribute("data-email-id", trackingData.id);
      showTrackingIndicator(trackingData.trackingUrl);
      trackedEmailsCacheAt = 0;

      chrome.runtime.sendMessage({
        type: "TRACKING_ADDED",
        subject,
        recipient,
        trackingUrl: trackingData.trackingUrl,
        emailId: trackingData.id,
      });

      setupSendButtonListener(composeWindow);
    } else {
      showErrorIndicator("Could not inject pixel");
    }
  } catch (error) {
    console.error("❌ Email Tracker: Unexpected error:", error);
  } finally {
    // Allow a retry on the next interaction if we didn't end up injected.
    if (composeWindow.getAttribute("data-tracker-injected") !== "true") {
      composeWindow.removeAttribute("data-tracker-processing");
    }
  }
}

function setupComposeWindow(composeWindow) {
  if (composeWindow.getAttribute("data-tracker-listener") === "true") {
    return true;
  }

  const editor = findEditor(composeWindow);
  if (!editor) {
    return false;
  }

  composeWindow.setAttribute("data-tracker-listener", "true");

  const handleBodyInteraction = () => injectTrackingOnBodyFocus(composeWindow);
  editor.addEventListener("focus", handleBodyInteraction);
  editor.addEventListener("click", handleBodyInteraction);
  editor.addEventListener("input", handleBodyInteraction);

  // If the editor already has focus (Gmail focuses the body of inline
  // replies immediately) don't wait for another interaction.
  if (document.activeElement === editor) {
    handleBodyInteraction();
  }

  return true;
}

function detectComposeWindows() {
  const seen = new Set();
  for (const selector of COMPOSE_EDITOR_SELECTORS) {
    document.querySelectorAll(selector).forEach((editor) => {
      const composeWindow = findComposeContainer(editor);
      if (!composeWindow || seen.has(composeWindow)) {
        return;
      }
      seen.add(composeWindow);

      if (composeWindow.getAttribute("data-tracker-listener") !== "true") {
        setTimeout(() => {
          if (!setupComposeWindow(composeWindow)) {
            setTimeout(() => setupComposeWindow(composeWindow), 1000);
          }
        }, 300);
      }
    });
  }
}

function startObserving() {
  const observer = new MutationObserver(() => detectComposeWindows());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function init() {
  if (!window.location.hostname.includes("mail.google.com")) {
    return;
  }

  const checkGmailLoaded = setInterval(() => {
    if (document.querySelector('div[role="main"]')) {
      clearInterval(checkGmailLoaded);
      startObserving();
      detectComposeWindows();
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Inbox: indicators and owner self-view suppression
// ---------------------------------------------------------------------------

function buildTrackingMap(trackedEmails) {
  const trackingMap = new Map();

  trackedEmails.forEach((email) => {
    const normalizedSubject = normalizeTrackedSubject(email.subject);
    if (!normalizedSubject) {
      return;
    }

    if (!trackingMap.has(normalizedSubject)) {
      trackingMap.set(normalizedSubject, []);
    }
    trackingMap.get(normalizedSubject).push(email);
  });

  trackingMap.forEach((emails) => {
    emails.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });

  return trackingMap;
}

function findTrackedEmailsForSubject(subject, trackingMap) {
  const normalizedSubject = normalizeTrackedSubject(subject);
  return trackingMap.get(normalizedSubject) || [];
}

function findTrackedEmailForSubject(subject, trackingMap) {
  const matches = findTrackedEmailsForSubject(subject, trackingMap);
  return matches.length > 0 ? matches[0] : null;
}

function getOpenCount(email) {
  return Number(email.openCount) || (email.opens ? email.opens.length : 0);
}

function getSubjectFromRow(row) {
  const selectors = [
    "span[data-thread-id]",
    ".bog span",
    ".y2 span",
    "span.bqe",
    "span.a4W",
  ];

  for (const selector of selectors) {
    const element = row.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function getCurrentThreadSubject() {
  const selectors = [
    "h2.hP",
    "h2[data-thread-perm-id]",
    "div.ha h2",
    'div[role="main"] h2',
    "div[data-thread-perm-id] h2",
  ];

  for (const selector of selectors) {
    const subject = document.querySelector(selector)?.textContent?.trim();
    if (subject) {
      return subject;
    }
  }

  return null;
}

function armSelfOpenSuppressionForRow(row, email) {
  if (!email?.id) {
    return;
  }

  if (row.getAttribute("data-email-tracker-self-open-id") === email.id) {
    return;
  }

  row.setAttribute("data-email-tracker-self-open-id", email.id);

  // Fire on the *intent* to open (mousedown) so the report races ahead of
  // Gmail's own thread render and proxy fetch.
  const suppress = () => {
    if (!isActivelyViewingGmail()) {
      return;
    }
    reportSelfViewById(email.id, "gmail-row-open");
  };

  row.addEventListener("mousedown", suppress, true);
  row.addEventListener("click", suppress, true);
  row.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "o") {
        suppress();
      }
    },
    true
  );
}

// Track which thread we last reported so sitting on an open thread doesn't
// re-report on every DOM mutation, while navigating away and back does.
let lastReportedThreadKey = null;

// "Actively reading" = this Gmail tab is visible AND focused. A Gmail tab
// parked in the background can't be the owner reading the email, so it must
// never suppress a recipient's open — even if Gmail re-renders the thread.
function isActivelyViewingGmail() {
  return document.visibilityState === "visible" && document.hasFocus();
}

async function suppressCurrentThreadIfTracked(trackingMap) {
  if (!isActivelyViewingGmail()) {
    return;
  }

  const subject = getCurrentThreadSubject();
  if (!subject) {
    lastReportedThreadKey = null;
    return;
  }

  const normalizedSubject = normalizeTrackedSubject(subject);
  const threadKey = `${window.location.hash}|${normalizedSubject}`;
  if (threadKey === lastReportedThreadKey) {
    return;
  }

  // Report *every* tracked email with this subject, not just the newest:
  // a thread can contain several tracked messages (follow-ups, replies) and
  // Gmail renders all of their pixels when the thread is opened.
  const emails = findTrackedEmailsForSubject(subject, trackingMap);
  if (emails.length === 0) {
    lastReportedThreadKey = threadKey;
    return;
  }

  lastReportedThreadKey = threadKey;
  const results = await Promise.all(
    emails.map((email) => reportSelfViewById(email.id, "gmail-thread-view"))
  );
  if (!results.every(Boolean)) {
    // Let the next pass retry.
    lastReportedThreadKey = null;
  }
}

function createIndicators(isOpened, openCount) {
  const container = document.createElement("span");
  container.className = "email-tracker-inbox-indicators";
  container.style.cssText = `
    display:inline-flex;gap:2px;margin-left:12px;margin-right:4px;
    align-items:center;font-size:11px;
  `;

  const checkmark = document.createElement("span");
  checkmark.innerHTML = "✓";
  checkmark.title =
    isOpened && openCount > 0
      ? `Email opened ${openCount} time${openCount > 1 ? "s" : ""}`
      : "Email tracked - not opened yet";
  checkmark.style.cssText = `
    color:${isOpened && openCount > 0 ? "#10b981" : "#9ca3af"};
    font-weight:600;cursor:help;
  `;
  container.appendChild(checkmark);

  if (openCount > 1) {
    const count = document.createElement("span");
    count.textContent = `x${openCount}`;
    count.style.cssText = `
      font-size:10px;font-weight:500;color:#10b981;margin-left:1px;
    `;
    container.appendChild(count);
  }

  return container;
}

async function addInboxIndicators(force = false) {
  const trackedEmails = await fetchTrackedEmails(force);
  if (trackedEmails.length === 0) {
    return;
  }

  const trackingMap = buildTrackingMap(trackedEmails);
  await suppressCurrentThreadIfTracked(trackingMap);

  const rowSelectors = ["tr.zA", 'div[role="row"]'];
  let rows = [];

  for (const selector of rowSelectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) {
      rows = Array.from(found);
      break;
    }
  }

  rows.forEach((row) => {
    const subject = getSubjectFromRow(row);
    const email = subject ? findTrackedEmailForSubject(subject, trackingMap) : null;

    if (!email) {
      return;
    }

    armSelfOpenSuppressionForRow(row, email);

    const openCount = getOpenCount(email);
    const existing = row.querySelector(".email-tracker-inbox-indicators");
    if (existing) {
      if (existing.getAttribute("data-open-count") === String(openCount)) {
        return;
      }
      existing.remove();
    }

    const timeElement =
      row.querySelector("span.xW.xY") ||
      row.querySelector("td.xW.xY") ||
      row.querySelector("span[title]")?.closest("td")?.querySelector("span") ||
      row.querySelectorAll("td")[row.querySelectorAll("td").length - 1];

    if (!timeElement?.parentElement) {
      return;
    }

    const indicators = createIndicators(openCount > 0, openCount);
    indicators.setAttribute("data-open-count", String(openCount));

    timeElement.parentElement.style.display = "flex";
    timeElement.parentElement.style.alignItems = "center";
    timeElement.parentElement.style.justifyContent = "flex-end";
    timeElement.parentElement.insertBefore(indicators, timeElement);
  });
}

function startInboxMonitoring() {
  setTimeout(() => addInboxIndicators(true), 2000);

  const inboxObserver = new MutationObserver(() => {
    clearTimeout(window.inboxUpdateTimeout);
    window.inboxUpdateTimeout = setTimeout(() => addInboxIndicators(), 1000);
  });

  const checkInboxContainer = setInterval(() => {
    const inboxContainer =
      document.querySelector('div[role="main"]') || document.querySelector(".AO");

    if (inboxContainer) {
      clearInterval(checkInboxContainer);
      inboxObserver.observe(inboxContainer, {
        childList: true,
        subtree: true,
      });
    }
  }, 1000);

  // Periodic refresh so open counts update without a page reload.
  setInterval(() => addInboxIndicators(true), 30000);
}

// Leaving the tab ends the "actively reading" session; coming back to a
// tracked thread that's still on screen starts a new one and is reported
// again (the owner is looking at it right now).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    lastReportedThreadKey = null;
    return;
  }
  if (trackedEmailsCache.length > 0) {
    setTimeout(() => {
      suppressCurrentThreadIfTracked(buildTrackingMap(trackedEmailsCache));
    }, 100);
  }
});
window.addEventListener("blur", () => {
  lastReportedThreadKey = null;
});
window.addEventListener("focus", () => {
  if (trackedEmailsCache.length > 0) {
    setTimeout(() => {
      suppressCurrentThreadIfTracked(buildTrackingMap(trackedEmailsCache));
    }, 100);
  }
});

// Navigating into a thread changes the hash. Report from the cached list
// immediately (no fetch, no debounce) to beat Gmail's proxy fetch, then do
// the normal pass.
window.addEventListener("hashchange", () => {
  if (trackedEmailsCache.length > 0) {
    setTimeout(() => {
      suppressCurrentThreadIfTracked(buildTrackingMap(trackedEmailsCache));
    }, 50);
  }
  setTimeout(() => addInboxIndicators(), 1000);
});

console.log("🎬 Email Tracker: Content script starting...");
init();

setTimeout(() => {
  if (window.location.hostname.includes("mail.google.com")) {
    startInboxMonitoring();
    addInboxIndicators(true);
  }
}, 3000);
