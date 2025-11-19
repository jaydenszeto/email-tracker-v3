// Email Tracker Extension - Popup Script

let API_URL = 'https://email-tracker-v3.onrender.com';
let AUTO_TRACK_ENABLED = true;
let API_KEY = '';

// Load settings
function loadSettings() {
    chrome.storage.sync.get(['apiUrl', 'autoTrack', 'apiKey'], (result) => {
        API_URL = result.apiUrl || 'https://email-tracker-v3.onrender.com';
        AUTO_TRACK_ENABLED = result.autoTrack !== undefined ? result.autoTrack : true;
        API_KEY = result.apiKey || '';
        
        updateUI();
    });
}

// Auto-register if no API key
async function ensureApiKey() {
    if (API_KEY) {
        return true;
    }
    
    try {
        showMessage('Registering for the first time...', 'info');
        
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Registration failed');
        }
        
        const data = await response.json();
        API_KEY = data.apiKey;
        
        // Save to Chrome storage
        await chrome.storage.sync.set({ apiKey: API_KEY });
        
        showMessage('✅ Successfully registered! API key saved.', 'success');
        updateUI();
        return true;
    } catch (error) {
        console.error('Auto-registration failed:', error);
        showMessage('❌ Could not connect to server. Check server URL.', 'error');
        return false;
    }
}

// Update UI with current settings
function updateUI() {
    const serverUrlInput = document.getElementById('server-url');
    const apiKeyInput = document.getElementById('api-key');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const apiKeyStatus = document.getElementById('api-key-status');
    const apiKeyDisplay = document.getElementById('api-key-display');
    
    // Update inputs
    serverUrlInput.value = API_URL;
    apiKeyInput.value = API_KEY;
    
    // Update status
    if (API_KEY) {
        statusIndicator.className = 'status-indicator active';
        statusText.textContent = 'Ready to track emails';
        apiKeyStatus.textContent = 'Active';
        
        // Show masked API key
        const maskedKey = API_KEY.substring(0, 8) + '...' + API_KEY.substring(API_KEY.length - 8);
        apiKeyDisplay.textContent = maskedKey;
        apiKeyDisplay.style.display = 'block';
    } else {
        statusIndicator.className = 'status-indicator inactive';
        statusText.textContent = 'Not configured';
        apiKeyStatus.textContent = 'Not set - Click "Refresh Status" to register';
        apiKeyDisplay.style.display = 'none';
    }
}

// Save settings
async function saveSettings() {
    const serverUrlInput = document.getElementById('server-url');
    const apiKeyInput = document.getElementById('api-key');
    
    const newUrl = serverUrlInput.value.trim();
    const newKey = apiKeyInput.value.trim();
    
    if (!newUrl) {
        showMessage('❌ Server URL is required', 'error');
        return;
    }
    
    API_URL = newUrl;
    API_KEY = newKey;
    
    await chrome.storage.sync.set({
        apiUrl: API_URL,
        apiKey: API_KEY
    });
    
    showMessage('✅ Settings saved!', 'success');
    updateUI();
}

// Open dashboard with API key
async function openDashboard() {
    // Make sure we have an API key
    if (!API_KEY) {
        const success = await ensureApiKey();
        if (!success) {
            return;
        }
    }
    
    // Open dashboard with API key in URL hash
    // This allows the dashboard to auto-load the API key
    const dashboardUrl = `${API_URL}#apiKey=${API_KEY}`;
    
    chrome.tabs.create({ url: dashboardUrl });
    
    showMessage('✅ Opening dashboard with your API key...', 'success');
}

// Refresh status (auto-register if needed)
async function refreshStatus() {
    showMessage('Checking status...', 'info');
    await ensureApiKey();
}

// Show message
function showMessage(message, type = 'info') {
    const successEl = document.getElementById('success-message');
    const errorEl = document.getElementById('error-message');
    
    // Hide all messages first
    successEl.style.display = 'none';
    errorEl.style.display = 'none';
    
    if (type === 'success' || type === 'info') {
        successEl.textContent = message;
        successEl.style.display = 'block';
        setTimeout(() => {
            successEl.style.display = 'none';
        }, 3000);
    } else if (type === 'error') {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

// Event listeners
document.getElementById('open-dashboard-btn').addEventListener('click', openDashboard);
document.getElementById('refresh-btn').addEventListener('click', refreshStatus);
document.getElementById('save-btn').addEventListener('click', saveSettings);

document.getElementById('toggle-settings').addEventListener('click', () => {
    const settingsSection = document.getElementById('settings-section');
    const toggleBtn = document.getElementById('toggle-settings');
    
    if (settingsSection.classList.contains('active')) {
        settingsSection.classList.remove('active');
        toggleBtn.textContent = '⚙️ Advanced Settings';
    } else {
        settingsSection.classList.add('active');
        toggleBtn.textContent = '⚙️ Hide Settings';
    }
});

// Initialize on load
loadSettings();

// Auto-register on first open if no API key
setTimeout(async () => {
    if (!API_KEY) {
        await ensureApiKey();
    }
}, 500);
