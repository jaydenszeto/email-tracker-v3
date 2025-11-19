// Gmail Email Tracker Content Script with API Key Support
console.log("🚀 Email Tracker: Extension loaded!");

let API_URL = "https://email-tracker-v3.onrender.com";
let AUTO_TRACK_ENABLED = true;
let API_KEY = null;

// Load settings from storage
chrome.storage.sync.get(["apiUrl", "autoTrack", "apiKey"], (result) => {
  if (result.apiUrl) API_URL = result.apiUrl;
  if (result.autoTrack !== undefined) AUTO_TRACK_ENABLED = result.autoTrack;
  if (result.apiKey) API_KEY = result.apiKey;
  
  console.log("⚙️ Email Tracker: Settings loaded:", {
    API_URL,
    AUTO_TRACK_ENABLED,
    hasApiKey: !!API_KEY
  });
});

// Listen for settings changes
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
    console.log("🔄 Email Tracker: API key updated");
  }
});

// Get email subject from compose window
function getEmailSubject(composeWindow) {
  console.log("🔍 Email Tracker: Looking for email subject...");

  const selectors = [
    'input[name="subjectbox"]',
    'input[placeholder*="Subject"]',
    'input[aria-label*="Subject"]',
  ];

  for (const selector of selectors) {
    const subjectInput = composeWindow.querySelector(selector);
    if (subjectInput) {
      const subject = subjectInput.value.trim();
      if (subject) {
        console.log("✅ Email Tracker: Found subject:", subject);
        return subject;
      }
    }
  }

  console.log("⚠️ Email Tracker: No subject entered, using default");
  return "No Subject";
}

// Get recipient email
function getRecipientEmail(composeWindow) {
  console.log("🔍 Email Tracker: Looking for recipient email...");

  const toField = composeWindow.querySelector('div[aria-label*="To"]');
  if (toField) {
    const emailSpan = toField.querySelector("span[email]");
    if (emailSpan) {
      const email = emailSpan.getAttribute("email");
      console.log("✅ Email Tracker: Found recipient:", email);
      return email;
    }

    const hoverCards = toField.querySelectorAll("[data-hovercard-id]");
    for (const card of hoverCards) {
      const email = card.getAttribute("data-hovercard-id");
      if (email && email.includes("@")) {
        console.log("✅ Email Tracker: Found recipient from hovercard:", email);
        return email;
      }
    }

    const emailText = toField.textContent.trim();
    if (emailText && emailText.includes("@")) {
      const emailMatch = emailText.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        console.log("✅ Email Tracker: Found recipient from text:", emailMatch[0]);
        return emailMatch[0];
      }
    }
  }

  console.log("⚠️ Email Tracker: No recipient found");
  return null;
}

// Create tracking pixel by calling the server API
async function createTrackingPixel(subject, recipient) {
  console.log("📡 Email Tracker: Creating tracking pixel...");
  console.log("📧 Subject:", subject);
  console.log("👤 Recipient:", recipient);
  console.log("🌐 Server URL:", API_URL);
  console.log("🔑 Has API Key:", !!API_KEY);

  if (!API_KEY) {
    console.error("❌ Email Tracker: No API key configured!");
    showErrorIndicator("No API key - configure in extension");
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/api/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
      },
      body: JSON.stringify({
        subject: subject,
        recipient: recipient,
      }),
    });

    console.log("📥 Email Tracker: Server response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Email Tracker: Server error:", errorText);
      
      if (response.status === 401) {
        showErrorIndicator("Invalid API key");
      } else {
        showErrorIndicator(`Server error: ${response.status}`);
      }
      
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Email Tracker: Tracking URL created:", data.trackingUrl);
    return data.trackingUrl;
  } catch (error) {
    console.error("❌ Email Tracker: Error creating tracking pixel:", error);
    return null;
  }
}

// Insert tracking pixel into the email body
function injectTrackingPixel(composeWindow, trackingUrl) {
  console.log("💉 Email Tracker: Attempting to inject tracking pixel...");
  console.log("🔗 Tracking URL:", trackingUrl);

  try {
    const selectors = [
      'div[aria-label="Message Body"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[g_editable="true"]',
    ];

    let editor = null;
    for (const selector of selectors) {
      editor = composeWindow.querySelector(selector);
      if (editor) {
        console.log("✅ Email Tracker: Found editor with selector:", selector);
        break;
      }
    }

    if (!editor) {
      console.error("❌ Email Tracker: Could not find email editor!");
      return false;
    }

    const pixelHtml = `<img src="${trackingUrl}" width="1" height="1" style="display:none !important; visibility:hidden !important; opacity:0 !important; position:absolute !important;" alt="" border="0" />`;

    console.log("🎨 Email Tracker: Pixel HTML:", pixelHtml);

    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = pixelHtml;
      const pixelElement = tempDiv.firstChild;

      editor.appendChild(pixelElement);

      console.log("✅ Email Tracker: Pixel injected successfully");

      composeWindow.setAttribute("data-tracker-injected", "true");
      composeWindow.setAttribute("data-tracking-url", trackingUrl);

      return true;
    } catch (e) {
      console.error("⚠️ Email Tracker: appendChild failed, trying alternative method:", e);
    }

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = pixelHtml;
      const pixelElement = tempDiv.firstChild;

      range.insertNode(pixelElement);

      console.log("✅ Email Tracker: Pixel injected via range insert");

      composeWindow.setAttribute("data-tracker-injected", "true");
      composeWindow.setAttribute("data-tracking-url", trackingUrl);

      return true;
    } catch (e) {
      console.error("❌ Email Tracker: All injection methods failed:", e);
      return false;
    }
  } catch (error) {
    console.error("❌ Email Tracker: Unexpected error during injection:", error);
    return false;
  }
}

// Show visual indicator that tracking was added
function showTrackingIndicator(trackingUrl) {
  console.log("🟢 Email Tracker: Showing success indicator");

  const existing = document.querySelector(".email-tracker-indicator");
  if (existing) {
    existing.remove();
  }

  const indicator = document.createElement("div");
  indicator.className = "email-tracker-indicator";

  indicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 10px; height: 10px; background: #22c55e; border-radius: 50%; animation: pulse-animation 2s infinite;"></div>
            <div>
                <div style="font-weight: 600; font-size: 13px;">📊 Email Tracking Active</div>
                <div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">Pixel added successfully</div>
            </div>
        </div>
    `;

  indicator.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid #22c55e;
        color: #22c55e;
        padding: 16px 20px;
        border-radius: 10px;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        z-index: 999999;
        box-shadow: 0 8px 30px rgba(34, 197, 94, 0.4);
        backdrop-filter: blur(10px);
        animation: slideIn 0.3s ease-out;
        cursor: pointer;
    `;

  const style = document.createElement("style");
  style.textContent = `
        @keyframes pulse-animation {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.2); }
        }
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes fadeOut {
            to {
                opacity: 0;
                transform: translateY(20px);
            }
        }
    `;
  document.head.appendChild(style);

  indicator.onclick = () => {
    alert(
      `Tracking Pixel Added!\n\nTracking URL:\n${trackingUrl}\n\nThis invisible pixel will track when your email is opened. Check the dashboard after sending!`
    );
  };

  document.body.appendChild(indicator);
  console.log("✅ Email Tracker: Green indicator added to page");

  setTimeout(() => {
    indicator.style.animation = "fadeOut 0.5s ease-out";
    setTimeout(() => indicator.remove(), 500);
  }, 8000);
}

// Show error indicator
function showErrorIndicator(message) {
  console.log("❌ Email Tracker: Showing error indicator:", message);

  const indicator = document.createElement("div");
  indicator.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Tracking Failed</div>
        <div style="font-size: 10px; opacity: 0.8;">${message}</div>
    `;
  indicator.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: rgba(239, 68, 68, 0.95);
        border: 2px solid rgba(239, 68, 68, 1);
        color: white;
        padding: 16px 20px;
        border-radius: 10px;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        z-index: 999999;
        box-shadow: 0 8px 30px rgba(239, 68, 68, 0.4);
        animation: slideIn 0.3s ease-out;
    `;

  document.body.appendChild(indicator);

  setTimeout(() => indicator.remove(), 5000);
}

// Main function to inject tracking when message body is clicked
async function injectTrackingOnBodyFocus(composeWindow) {
  console.log("🎯 Email Tracker: User interacted with message body!");

  if (!AUTO_TRACK_ENABLED) {
    console.log("⏸️ Email Tracker: Auto-tracking is disabled, skipping");
    return;
  }

  if (composeWindow.getAttribute("data-tracker-injected") === "true") {
    console.log("⏭️ Email Tracker: Tracking already added to this email");
    return;
  }

  if (composeWindow.getAttribute("data-tracker-processing") === "true") {
    console.log("⏳ Email Tracker: Already processing this compose window, skipping to prevent duplicates");
    return;
  }

  composeWindow.setAttribute("data-tracker-processing", "true");
  console.log("🔒 Email Tracker: Locked processing for this compose window");

  try {
    console.log("⏳ Email Tracker: Waiting 500ms for Gmail to update...");
    await new Promise((resolve) => setTimeout(resolve, 500));

    const recipient = getRecipientEmail(composeWindow);

    if (!recipient) {
      console.log("⚠️ Email Tracker: No recipient found, cannot inject tracking pixel");
      console.log("💡 Email Tracker: User needs to add a recipient first");
      composeWindow.removeAttribute("data-tracker-processing");
      return;
    }

    const subject = getEmailSubject(composeWindow);

    console.log("✅ Email Tracker: Have all required info, creating tracking link...");
    console.log("📧 Subject:", subject);
    console.log("👤 Recipient:", recipient);

    const trackingUrl = await createTrackingPixel(subject, recipient);

    if (!trackingUrl) {
      console.error("❌ Email Tracker: Failed to create tracking URL");
      composeWindow.removeAttribute("data-tracker-processing");
      return;
    }

    console.log("💉 Email Tracker: Injecting pixel into email...");
    const success = injectTrackingPixel(composeWindow, trackingUrl);

    if (success) {
      console.log("🎉 Email Tracker: SUCCESS! Tracking pixel added to email");
      showTrackingIndicator(trackingUrl);

      chrome.runtime.sendMessage({
        type: "TRACKING_ADDED",
        subject: subject,
        recipient: recipient,
        trackingUrl: trackingUrl,
      });
    } else {
      console.error("❌ Email Tracker: Failed to inject pixel");
      showErrorIndicator("Could not inject pixel");
      composeWindow.removeAttribute("data-tracker-processing");
    }
  } catch (error) {
    console.error("❌ Email Tracker: Unexpected error:", error);
    composeWindow.removeAttribute("data-tracker-processing");
  }
}

// Set up listener for when user clicks into message body
function setupMessageBodyListener(composeWindow) {
  console.log("🎧 Email Tracker: Setting up message body listener...");

  if (composeWindow.getAttribute("data-tracker-listener") === "true") {
    console.log("⏭️ Email Tracker: Listener already set up for this compose window");
    return;
  }

  composeWindow.setAttribute("data-tracker-listener", "true");

  const selectors = [
    'div[aria-label="Message Body"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[g_editable="true"]',
  ];

  let editor = null;
  for (const selector of selectors) {
    editor = composeWindow.querySelector(selector);
    if (editor) {
      console.log("✅ Email Tracker: Found message body with selector:", selector);
      break;
    }
  }

  if (!editor) {
    console.log("⚠️ Email Tracker: Could not find message body editor yet, will try again");
    return false;
  }

  editor.addEventListener(
    "focus",
    () => {
      console.log("🎯 Email Tracker: Message body focused!");
      injectTrackingOnBodyFocus(composeWindow);
    },
    { once: true }
  );

  console.log("✅ Email Tracker: Message body focus listener added");
  return true;
}

// Detect and process compose windows
function detectComposeWindows() {
  console.log("🔍 Email Tracker: Scanning for compose windows...");

  const selectors = [
    'div[role="dialog"]',
    "div.n1tfz",
    'div[aria-label*="compose" i]',
  ];

  let found = false;
  for (const selector of selectors) {
    const composeWindows = document.querySelectorAll(selector);

    if (composeWindows.length > 0) {
      console.log(`✅ Email Tracker: Found ${composeWindows.length} compose window(s) with selector: ${selector}`);

      composeWindows.forEach((composeWindow, index) => {
        const hasSubject = composeWindow.querySelector('input[name="subjectbox"]');
        const hasEditor = composeWindow.querySelector('div[aria-label="Message Body"]');

        if (hasSubject || hasEditor) {
          console.log(`📝 Email Tracker: Found compose window #${index + 1}`);

          if (!composeWindow.getAttribute("data-tracker-listener")) {
            setTimeout(() => {
              const success = setupMessageBodyListener(composeWindow);
              if (!success) {
                setTimeout(() => setupMessageBodyListener(composeWindow), 1000);
              }
            }, 500);
            found = true;
          }
        }
      });
    }
  }

  if (!found) {
    console.log("ℹ️ Email Tracker: No new compose windows found");
  }
}

// Set up observer to watch for new compose windows
function startObserving() {
  console.log("👀 Email Tracker: Starting mutation observer...");

  const observer = new MutationObserver((mutations) => {
    detectComposeWindows();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("✅ Email Tracker: Mutation observer active");
}

// Initialize extension
function init() {
  console.log("🚀 Email Tracker: Initializing extension...");

  if (!window.location.hostname.includes("mail.google.com")) {
    console.log("❌ Email Tracker: Not on Gmail, extension will not activate");
    return;
  }

  console.log("✅ Email Tracker: Confirmed we are on Gmail");

  const checkGmailLoaded = setInterval(() => {
    const mainElement = document.querySelector('div[role="main"]');
    if (mainElement) {
      clearInterval(checkGmailLoaded);
      console.log("✅ Email Tracker: Gmail fully loaded!");
      console.log("🎯 Email Tracker: Extension is ready to track emails");
      console.log("📝 Email Tracker: Open a compose window and click into the message body to add tracking");

      startObserving();
      detectComposeWindows();
    }
  }, 1000);
}

// Start the extension
console.log("🎬 Email Tracker: Content script starting...");
init();
