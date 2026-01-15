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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["apiUrl", "autoTrack"], (result) => {
    const defaults = {};

    if (!result.apiUrl) {
      defaults.apiUrl = "https://email-tracker-v3.onrender.com";
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
