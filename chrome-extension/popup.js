// Popup script for Email Tracker extension

document.addEventListener('DOMContentLoaded', () => {
    const autoTrackToggle = document.getElementById('autoTrack');
    const apiUrlInput = document.getElementById('apiUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const openDashboardBtn = document.getElementById('openDashboard');
    const statusDiv = document.getElementById('status');

    // Load settings
    chrome.storage.sync.get(['apiUrl', 'autoTrack', 'apiKey'], (result) => {
        if (result.apiUrl) {
            apiUrlInput.value = result.apiUrl;
        } else {
            // Set default
            apiUrlInput.value = 'https://email-tracker-v3.onrender.com';
        }
        
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
        
        if (result.autoTrack !== undefined) {
            autoTrackToggle.checked = result.autoTrack;
            updateStatus(result.autoTrack);
        }
    });

    // Update status display
    function updateStatus(enabled) {
        if (enabled) {
            statusDiv.className = 'status status-active';
            statusDiv.textContent = '✓ Auto-tracking enabled';
        } else {
            statusDiv.className = 'status status-inactive';
            statusDiv.textContent = '○ Auto-tracking disabled';
        }
    }

    // Toggle auto-track
    autoTrackToggle.addEventListener('change', () => {
        const enabled = autoTrackToggle.checked;
        updateStatus(enabled);
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        const autoTrack = autoTrackToggle.checked;

        // Remove trailing slash if present
        const cleanUrl = apiUrl.replace(/\/$/, '');

        chrome.storage.sync.set({ 
            apiUrl: cleanUrl,
            apiKey: apiKey,
            autoTrack: autoTrack 
        }, () => {
            // Show success feedback
            const originalText = saveSettingsBtn.textContent;
            saveSettingsBtn.textContent = '✓ Saved!';
            saveSettingsBtn.style.background = 'rgba(34, 197, 94, 0.2)';
            
            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.style.background = '';
            }, 2000);
            
            console.log('Settings saved:', { apiUrl: cleanUrl, apiKey: apiKey ? '***' + apiKey.slice(-4) : 'not set', autoTrack });
        });
    });

    // Open dashboard
    openDashboardBtn.addEventListener('click', () => {
        chrome.storage.sync.get(['apiUrl'], (result) => {
            const dashboardUrl = result.apiUrl || 'https://email-tracker-v3.onrender.com';
            chrome.tabs.create({ url: dashboardUrl });
        });
    });
});
