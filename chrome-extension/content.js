// Gmail Email Tracker Content Script
console.log('Email Tracker: Content script loaded');

let API_URL = 'http://localhost:3000';
let AUTO_TRACK_ENABLED = true;

// Load settings from storage
chrome.storage.sync.get(['apiUrl', 'autoTrack'], (result) => {
    if (result.apiUrl) API_URL = result.apiUrl;
    if (result.autoTrack !== undefined) AUTO_TRACK_ENABLED = result.autoTrack;
    console.log('Email Tracker: Settings loaded', { API_URL, AUTO_TRACK_ENABLED });
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.apiUrl) API_URL = changes.apiUrl.newValue;
    if (changes.autoTrack) AUTO_TRACK_ENABLED = changes.autoTrack.newValue;
});

// Track which compose windows we've already processed
const processedComposeIds = new Set();

// Function to get email subject from compose window
function getEmailSubject(composeWindow) {
    const subjectInput = composeWindow.querySelector('input[name="subjectbox"]');
    return subjectInput ? subjectInput.value.trim() : 'Untitled Email';
}

// Function to get recipient email
function getRecipientEmail(composeWindow) {
    const toField = composeWindow.querySelector('div[aria-label*="To"]');
    if (toField) {
        const emailSpan = toField.querySelector('span[email]');
        if (emailSpan) {
            return emailSpan.getAttribute('email');
        }
    }
    return 'Unknown';
}

// Function to create tracking pixel
async function createTrackingPixel(subject, recipient) {
    try {
        const response = await fetch(`${API_URL}/api/emails`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subject, recipient })
        });

        if (!response.ok) {
            throw new Error('Failed to create tracking link');
        }

        const data = await response.json();
        return data.trackingUrl;
    } catch (error) {
        console.error('Email Tracker: Error creating tracking pixel:', error);
        return null;
    }
}

// Function to inject tracking pixel into email body
function injectTrackingPixel(composeWindow, trackingUrl) {
    try {
        // Find the email body editor
        const editor = composeWindow.querySelector('div[aria-label="Message Body"]');
        
        if (!editor) {
            console.error('Email Tracker: Could not find email editor');
            return false;
        }

        // Create the tracking pixel HTML - completely invisible
        const pixelHtml = `<img src="${trackingUrl}" width="1" height="1" style="display:none !important; visibility:hidden !important; opacity:0 !important; position:absolute !important;" alt="" />`;
        
        // Insert at the end of the email
        const range = document.createRange();
        const selection = window.getSelection();
        
        // Move to end of content
        range.selectNodeContents(editor);
        range.collapse(false);
        
        // Create a temporary div to convert HTML string to nodes
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = pixelHtml;
        const pixelNode = tempDiv.firstChild;
        
        // Insert the pixel
        range.insertNode(pixelNode);
        
        // Add a marker so we know this compose has been processed
        composeWindow.setAttribute('data-tracker-injected', 'true');
        composeWindow.setAttribute('data-tracking-url', trackingUrl);
        
        console.log('Email Tracker: Pixel injected successfully');
        return true;
    } catch (error) {
        console.error('Email Tracker: Error injecting pixel:', error);
        return false;
    }
}

// Function to add PROMINENT visual indicator
function addVisualIndicator(composeWindow, trackingUrl) {
    // Check if indicator already exists
    if (composeWindow.querySelector('.email-tracker-indicator')) {
        return;
    }

    const indicator = document.createElement('div');
    indicator.className = 'email-tracker-indicator';
    
    // Make it more prominent with animation
    indicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite;"></div>
            <span>📊 Email Tracking Active</span>
        </div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Invisible pixel added to email</div>
    `;
    
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid rgba(34, 197, 94, 0.5);
        color: rgba(34, 197, 94, 1);
        padding: 12px 16px;
        border-radius: 8px;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3);
        backdrop-filter: blur(10px);
        animation: slideIn 0.3s ease-out;
    `;
    
    // Add click to view tracking URL
    indicator.style.cursor = 'pointer';
    indicator.title = 'Click to view tracking URL';
    indicator.onclick = () => {
        alert(`Tracking URL:\n\n${trackingUrl}\n\nThis invisible pixel was added to your email. When the recipient opens it, you'll see the open in your dashboard!`);
    };
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
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
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(indicator);
    
    // Auto-hide after 8 seconds with fade out
    setTimeout(() => {
        indicator.style.transition = 'opacity 0.5s ease-out';
        indicator.style.opacity = '0';
        setTimeout(() => indicator.remove(), 500);
    }, 8000);
}

// Main function to process compose window
async function processComposeWindow(composeWindow) {
    if (!AUTO_TRACK_ENABLED) {
        console.log('Email Tracker: Auto-tracking is disabled');
        return;
    }
    
    // Check if already processed
    if (composeWindow.getAttribute('data-tracker-injected') === 'true') {
        return;
    }

    // Get a unique ID for this compose window
    const composeId = composeWindow.getAttribute('data-compose-id') || Date.now().toString();
    if (!composeWindow.getAttribute('data-compose-id')) {
        composeWindow.setAttribute('data-compose-id', composeId);
    }

    if (processedComposeIds.has(composeId)) {
        return;
    }

    console.log('Email Tracker: Processing compose window', composeId);

    // Wait a bit for the compose window to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get email details
    const subject = getEmailSubject(composeWindow);
    const recipient = getRecipientEmail(composeWindow);

    console.log('Email Tracker: Email details:', { subject, recipient });

    // Create tracking pixel
    const trackingUrl = await createTrackingPixel(subject, recipient);
    
    if (trackingUrl) {
        // Inject the pixel
        const success = injectTrackingPixel(composeWindow, trackingUrl);
        
        if (success) {
            processedComposeIds.add(composeId);
            addVisualIndicator(composeWindow, trackingUrl);
            
            console.log('Email Tracker: SUCCESS - Tracking added to email');
            
            // Show notification
            chrome.runtime.sendMessage({
                type: 'TRACKING_ADDED',
                subject: subject
            });
        }
    } else {
        console.error('Email Tracker: Failed to create tracking URL');
        
        // Show error indicator
        const errorIndicator = document.createElement('div');
        errorIndicator.innerHTML = '⚠️ Tracking Failed - Check server connection';
        errorIndicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(239, 68, 68, 0.2);
            border: 2px solid rgba(239, 68, 68, 0.5);
            color: rgba(239, 68, 68, 1);
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 12px;
            z-index: 10000;
        `;
        document.body.appendChild(errorIndicator);
        setTimeout(() => errorIndicator.remove(), 5000);
    }
}

// Observer to watch for new compose windows
const observer = new MutationObserver((mutations) => {
    // Look for compose windows
    const composeWindows = document.querySelectorAll('div[role="dialog"][aria-label*="compose" i]');
    
    composeWindows.forEach(composeWindow => {
        if (!composeWindow.getAttribute('data-tracker-processed')) {
            composeWindow.setAttribute('data-tracker-processed', 'true');
            processComposeWindow(composeWindow);
        }
    });
});

// Start observing
function startObserving() {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('Email Tracker: Observer started - watching for compose windows');
}

// Initialize when Gmail is ready
function init() {
    console.log('Email Tracker: Initializing...');
    
    // Wait for Gmail to load
    const checkGmailLoaded = setInterval(() => {
        if (document.querySelector('div[role="main"]')) {
            clearInterval(checkGmailLoaded);
            console.log('Email Tracker: Gmail loaded successfully!');
            startObserving();
            
            // Process any existing compose windows
            const existingComposeWindows = document.querySelectorAll('div[role="dialog"][aria-label*="compose" i]');
            if (existingComposeWindows.length > 0) {
                console.log(`Email Tracker: Found ${existingComposeWindows.length} existing compose windows`);
                existingComposeWindows.forEach(processComposeWindow);
            }
        }
    }, 1000);
}

// Start initialization
console.log('Email Tracker: Starting initialization');
init();
