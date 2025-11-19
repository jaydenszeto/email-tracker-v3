// Email Tracker Dashboard - Auto-Registration Script
// This handles user registration and API key management

let apiKey = localStorage.getItem('emailTrackerApiKey') || '';

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

// Initialize API key - register if needed
async function initApiKey() {
    if (apiKey) {
        console.log('✅ Using existing API key from localStorage');
        console.log('User ID:', localStorage.getItem('emailTrackerUserId'));
        return true;
    } else {
        console.log('🆕 No API key found, auto-registering...');
        const success = await registerUser();
        
        if (success) {
            console.log('✨ Auto-registration complete! Ready to track emails.');
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
    await initApiKey();
}

// Export for use in dashboard
window.EmailTrackerAuth = {
    initApiKey,
    getAuthHeaders,
    handleInvalidApiKey,
    getApiKey: () => apiKey
};
