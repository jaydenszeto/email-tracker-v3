// Background service worker for Email Tracker

console.log('Email Tracker: Background service worker started');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRACKING_ADDED') {
        console.log('Email Tracker: Tracking added to email:', message.subject);
        
        // Could show a notification here if desired
        // chrome.notifications.create({
        //     type: 'basic',
        //     iconUrl: 'icon48.png',
        //     title: 'Email Tracking Enabled',
        //     message: `Tracking added to: ${message.subject}`
        // });
    }
});

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['apiUrl', 'autoTrack'], (result) => {
        if (!result.apiUrl) {
            chrome.storage.sync.set({ 
                apiUrl: 'http://localhost:3000',
                autoTrack: true 
            });
        }
    });
    
    console.log('Email Tracker: Extension installed');
});
