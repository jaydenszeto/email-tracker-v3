// Email Tracker Dashboard - Auto-Registration Script
// This handles user registration and API key management

let apiKey = localStorage.getItem('emailTrackerApiKey') || '';

// Check if API key is in URL hash (from extension)
function checkUrlForApiKey() {
    const hash = window.location.hash;
    if (hash && hash.includes('apiKey=')) {
        const urlKey = hash.split('apiKey=')[1].split('&')[0];
        if (urlKey && urlKey.length > 0) {
            console.log('🔑 Found API key in URL from extension');
            apiKey = urlKey;
            localStorage.setItem('emailTrackerApiKey', apiKey);
            localStorage.setItem('emailTrackerSource', 'extension');
            // Clean up URL
            window.history.replaceState(null, null, window.location.pathname);
            console.log('✅ API key from extension saved to localStorage');
            return true;
        }
    }
    return false;
}

// Auto-register user and get API key
async function registerUser() {
    try {
        console.log('🔑 Registering new user...');
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Failed to register');
        }
        
        const data = await response.json();
        
        if (data.apiKey) {
            apiKey = data.apiKey;
            localStorage.setItem('emailTrackerApiKey', apiKey);
            localStorage.setItem('emailTrackerUserId', data.userId);
            localStorage.setItem('emailTrackerSource', 'dashboard');
            console.log('✅ User registered! User ID:', data.userId);
            console.log('✅ API key saved to localStorage');
            console.log('🎉 You can now track emails!');
            return true;
        }
    } catch (error) {
        console.error('❌ Failed to register:', error);
        return false;
    }
}

// Initialize API key - check URL first, then register if needed
async function initApiKey() {
    // First, check if API key is in URL (from extension)
    const fromUrl = checkUrlForApiKey();
    
    if (fromUrl) {
        console.log('✅ Using API key from extension');
        const source = localStorage.getItem('emailTrackerSource');
        console.log('📱 This dashboard is synced with your extension!');
        return true;
    }
    
    // Then check localStorage
    if (apiKey) {
        console.log('✅ Using existing API key from localStorage');
        const source = localStorage.getItem('emailTrackerSource');
        if (source === 'extension') {
            console.log('📱 This dashboard is synced with your extension!');
        } else {
            console.log('🌐 This dashboard was registered independently');
        }
        console.log('User ID:', localStorage.getItem('emailTrackerUserId'));
        return true;
    } else {
        console.log('🆕 No API key found, auto-registering...');
        const success = await registerUser();
        
        if (success) {
            console.log('✨ Auto-registration complete! Ready to track emails.');
            console.log('💡 Tip: Install the Chrome extension to auto-track emails from Gmail!');
            return true;
        } else {
            console.error('❌ Auto-registration failed - check server connection');
            return false;
        }
    }
}

// Get headers with API key for authenticated requests
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
    };
}

// Handle API key expiration/invalidity
async function handleInvalidApiKey() {
    console.warn('⚠️ API key invalid or expired, re-registering...');
    apiKey = '';
    localStorage.removeItem('emailTrackerApiKey');
    localStorage.removeItem('emailTrackerUserId');
    localStorage.removeItem('emailTrackerSource');
    await initApiKey();
}

// Export for use in dashboard
window.EmailTrackerAuth = {
    initApiKey,
    getAuthHeaders,
    handleInvalidApiKey,
    getApiKey: () => apiKey
};
