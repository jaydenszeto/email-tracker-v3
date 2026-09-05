console.log("Email Tracker: Background service worker started");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRACKING_ADDED") {
    console.log(
      "Email Tracker: Tracking successfully added to email:",
      message.subject
    );
    console.log("Tracking URL:", message.trackingUrl);
  }
});

const DEFAULT_API_URL = "https://jaydenszeto.me/email-tracker";
// Hosts the tracker used to live on. Installs still pointing at one of these
// are migrated to the current server on update.
const LEGACY_API_URLS = ["https://email-tracker-v3.onrender.com"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["apiUrl", "autoTrack"], (result) => {
    const defaults = {};

    const storedUrl = String(result.apiUrl || "").trim().replace(/\/+$/, "");
    if (!storedUrl || LEGACY_API_URLS.includes(storedUrl)) {
      defaults.apiUrl = DEFAULT_API_URL;
    }

    if (result.autoTrack === undefined) {
      defaults.autoTrack = true;
    }

    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults, () => {
        console.log("Email Tracker: Default settings initialized:", defaults);
      });
    }
  });

  console.log("Email Tracker: Extension installed/updated");
});
