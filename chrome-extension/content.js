console.log("🚀 Email Tracker: Extension loaded!");

let API_URL = "https://email-tracker-v3.onrender.com";
let AUTO_TRACK_ENABLED = true;
let API_KEY = null;

const SELF_OPEN_SUPPRESSION_SECONDS = 45;
const selfOpenSuppressionCache = new Map();
const reportedSelfViews = new Map();

chrome.storage.sync.get(["apiUrl", "autoTrack", "apiKey"], (result) => {
  if (result.apiUrl) API_URL = result.apiUrl;
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
    API_URL = changes.apiUrl.newValue;
    console.log("🔄 Email Tracker: Server URL updated to:", API_URL);
  }
  if (changes.autoTrack) {
    AUTO_TRACK_ENABLED = changes.autoTrack.newValue;
    console.log("🔄 Email Tracker: Auto-track changed to:", AUTO_TRACK_ENABLED);
  }
  if (changes.apiKey) {
    API_KEY = changes.apiKey.newValue;
    selfOpenSuppressionCache.clear();
    reportedSelfViews.clear();
    console.log("🔄 Email Tracker: API key updated");
  }
});

function normalizeTrackedSubject(subject) {
  return String(subject || "")
    .replace(/^\s*((re|fw|fwd):\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
      console.log("✅ Email Tracker: Found subject:", subject);
      return subject;
    }
  }

  return "No Subject";
}

function getRecipientEmail(composeWindow) {
  const toField = composeWindow.querySelector('div[aria-label*="To"]');
  if (!toField) {
    return null;
  }

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

  const emailMatch = toField.textContent.trim().match(/[\w.-]+@[\w.-]+\.\w+/);
  return emailMatch ? emailMatch[0] : null;
}

async function createTrackingPixel(subject, recipient) {
  if (!API_KEY) {
    showErrorIndicator("No API key - configure in extension");
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        subject,
        recipient,
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

function injectTrackingPixel(composeWindow, trackingUrl) {
  const selectors = [
    'div[aria-label="Message Body"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[g_editable="true"]',
  ];

  const editor = selectors
    .map((selector) => composeWindow.querySelector(selector))
    .find(Boolean);

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
  indicator.onclick = () => {
    alert(`Tracking Pixel Added!\n\nTracking URL:\n${trackingUrl}`);
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
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        seconds: SELF_OPEN_SUPPRESSION_SECONDS,
        reason,
      }),
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

async function reportSelfViewById(emailId, reason = "thread-view") {
  if (!API_KEY || !emailId) {
    return false;
  }

  await suppressSelfOpenById(emailId, reason);

  try {
    const response = await fetch(`${API_URL}/api/emails/${emailId}/report-self-view`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({ reason }),
    });

    return response.ok;
  } catch (error) {
    console.error("❌ Email Tracker: Error reporting self-view:", error);
    return false;
  }
}

async function markEmailAsSent(emailId) {
  if (!API_KEY || !emailId) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails/${emailId}/mark-sent`, {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
      },
    });

    if (!response.ok) {
      console.error("❌ Email Tracker: Failed to mark email as sent:", response.status);
    }
  } catch (error) {
    console.error("❌ Email Tracker: Error marking email as sent:", error);
  }
}

function setupSendButtonListener(composeWindow) {
  const sendButtonSelectors = [
    'div[role="button"][aria-label*="Send" i]',
    'div[data-tooltip*="Send" i]',
    "div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3",
  ];

  const sendButton = sendButtonSelectors
    .map((selector) => composeWindow.querySelector(selector))
    .find(Boolean);

  const markTrackedEmailAsSent = () => {
    const emailId = composeWindow.getAttribute("data-email-id");
    if (!emailId) {
      return;
    }

    suppressSelfOpenById(emailId, "send-action");
    setTimeout(() => markEmailAsSent(emailId), 1000);
  };

  if (!sendButton) {
    const observer = new MutationObserver(() => {
      if (!document.body.contains(composeWindow)) {
        markTrackedEmailAsSent();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  sendButton.addEventListener("click", markTrackedEmailAsSent, { once: true });
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

    const recipient = getRecipientEmail(composeWindow);
    if (!recipient) {
      composeWindow.removeAttribute("data-tracker-processing");
      return;
    }

    const subject = getEmailSubject(composeWindow);
    const trackingData = await createTrackingPixel(subject, recipient);
    if (!trackingData) {
      composeWindow.removeAttribute("data-tracker-processing");
      return;
    }

    if (injectTrackingPixel(composeWindow, trackingData.trackingUrl)) {
      composeWindow.setAttribute("data-email-id", trackingData.id);
      showTrackingIndicator(trackingData.trackingUrl);

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
      composeWindow.removeAttribute("data-tracker-processing");
    }
  } catch (error) {
    console.error("❌ Email Tracker: Unexpected error:", error);
    composeWindow.removeAttribute("data-tracker-processing");
  }
}

function setupMessageBodyListener(composeWindow) {
  if (composeWindow.getAttribute("data-tracker-listener") === "true") {
    return;
  }

  composeWindow.setAttribute("data-tracker-listener", "true");

  const selectors = [
    'div[aria-label="Message Body"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[g_editable="true"]',
  ];

  const editor = selectors
    .map((selector) => composeWindow.querySelector(selector))
    .find(Boolean);

  if (!editor) {
    return false;
  }

  const handleBodyInteraction = () => injectTrackingOnBodyFocus(composeWindow);
  editor.addEventListener("focus", handleBodyInteraction);
  editor.addEventListener("click", handleBodyInteraction);

  return true;
}

function detectComposeWindows() {
  const selectors = [
    'div[role="dialog"]',
    "div.n1tfz",
    'div[aria-label*="compose" i]',
  ];

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((composeWindow) => {
      const hasSubject = composeWindow.querySelector('input[name="subjectbox"]');
      const hasEditor = composeWindow.querySelector('div[aria-label="Message Body"]');

      if ((hasSubject || hasEditor) && !composeWindow.getAttribute("data-tracker-listener")) {
        setTimeout(() => {
          const success = setupMessageBodyListener(composeWindow);
          if (!success) {
            setTimeout(() => setupMessageBodyListener(composeWindow), 1000);
          }
        }, 500);
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

async function fetchTrackedEmails() {
  if (!API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${API_URL}/api/emails`, {
      headers: {
        "X-API-Key": API_KEY,
      },
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("❌ Email Tracker: Error fetching tracked emails:", error);
  }

  return [];
}

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

function findTrackedEmailForSubject(subject, trackingMap) {
  const normalizedSubject = normalizeTrackedSubject(subject);
  const matches = trackingMap.get(normalizedSubject);
  return matches && matches.length > 0 ? matches[0] : null;
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
    'div[data-thread-perm-id] h2',
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

  const suppress = () => {
    reportSelfViewById(email.id, "gmail-row-open");
  };

  row.addEventListener("mousedown", suppress, true);
  row.addEventListener("click", suppress, true);
  row.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        suppress();
      }
    },
    true
  );
}

async function suppressCurrentThreadIfTracked(trackingMap) {
  const subject = getCurrentThreadSubject();
  if (!subject) {
    return;
  }

  const normalizedSubject = normalizeTrackedSubject(subject);
  const lastReport = reportedSelfViews.get(normalizedSubject);
  if (lastReport && Date.now() - lastReport < 5 * 60 * 1000) {
    return;
  }

  const email = findTrackedEmailForSubject(subject, trackingMap);
  if (email && (await reportSelfViewById(email.id, "gmail-thread-view"))) {
    reportedSelfViews.set(normalizedSubject, Date.now());
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

async function addInboxIndicators() {
  const trackedEmails = await fetchTrackedEmails();
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

    if (row.querySelector(".email-tracker-inbox-indicators")) {
      return;
    }

    const timeElement =
      row.querySelector("span.xW.xY") ||
      row.querySelector("td.xW.xY") ||
      row.querySelector("span[title]")?.closest("td")?.querySelector("span") ||
      row.querySelectorAll("td")[row.querySelectorAll("td").length - 1];

    if (!timeElement?.parentElement) {
      return;
    }

    const openCount = getOpenCount(email);
    const indicators = createIndicators(openCount > 0, openCount);

    timeElement.parentElement.style.display = "flex";
    timeElement.parentElement.style.alignItems = "center";
    timeElement.parentElement.style.justifyContent = "flex-end";
    timeElement.parentElement.insertBefore(indicators, timeElement);
  });
}

function startInboxMonitoring() {
  setTimeout(() => addInboxIndicators(), 2000);

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

  setInterval(() => {
    document
      .querySelectorAll(".email-tracker-inbox-indicators")
      .forEach((el) => el.remove());
    addInboxIndicators();
  }, 30000);
}

window.addEventListener("hashchange", () => {
  setTimeout(addInboxIndicators, 1000);
});

console.log("🎬 Email Tracker: Content script starting...");
init();

setTimeout(() => {
  if (window.location.hostname.includes("mail.google.com")) {
    startInboxMonitoring();
    addInboxIndicators();
  }
}, 3000);
