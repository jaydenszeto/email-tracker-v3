// Popup script for Email Tracker extension

document.addEventListener('DOMContentLoaded', () => {
    const autoTrackToggle = document.getElementById('autoTrack');
    const apiUrlInput = document.getElementById('apiUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const generateKeyBtn = document.getElementById('generateKey');
    const openDashboardBtn = document.getElementById('openDashboard');
    const statusDiv = document.getElementById('status');
    const noApiKeyWarning = document.getElementById('no-api-key-warning');
    const newKeyDisplay = document.getElementById('new-key-display');
    const newKeyValue = document.getElementById('newKeyValue');

    // Load settings
    chrome.storage.sync.get(['apiUrl', 'autoTrack', 'apiKey'], (result) => {
        if (result.apiUrl) {
            apiUrlInput.value = result.apiUrl;
        } else {
            apiUrlInput.value = 'https://email-tracker-v3.onrender.com';
        }
        
        if (result.autoTrack !== undefined) {
            autoTrackToggle.checked = result.autoTrack;
            updateStatus(result.autoTrack);
        }

        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
            noApiKeyWarning.style.display = 'none';
        } else {
            noApiKeyWarning.style.display = 'block';
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

    // Generate new API key
    generateKeyBtn.addEventListener('click', async () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
        
        generateKeyBtn.textContent = 'Generating...';
        generateKeyBtn.disabled = true;

        try {
            const response = await fetch(`${apiUrl}/api/auth/generate-key`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to generate key');
            }

            const data = await response.json();
            
            // Show the new key
            newKeyValue.value = data.apiKey;
            newKeyDisplay.style.display = 'block';
            apiKeyInput.value = data.apiKey;
            
            // Auto-save it
            chrome.storage.sync.set({ apiKey: data.apiKey }, () => {
                noApiKeyWarning.style.display = 'none';
            });

        } catch (error) {
            alert('Failed to generate API key. Check server URL and try again.');
        } finally {
            generateKeyBtn.textContent = 'Generate New Key';
            generateKeyBtn.disabled = false;
        }
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
        const autoTrack = autoTrackToggle.checked;
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert('Please enter an API key or generate a new one');
            return;
        }

        chrome.storage.sync.set({ 
            apiUrl: apiUrl, 
            autoTrack: autoTrack,
            apiKey: apiKey
        }, () => {
            // Show success feedback
            const originalText = saveSettingsBtn.textContent;
            saveSettingsBtn.textContent = '✓ Saved!';
            saveSettingsBtn.style.background = 'rgba(34, 197, 94, 0.2)';
            
            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.style.background = '';
            }, 2000);
            
            noApiKeyWarning.style.display = 'none';
            console.log('Settings saved:', { apiUrl, autoTrack, hasApiKey: !!apiKey });
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
