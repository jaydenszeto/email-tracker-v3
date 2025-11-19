# ✅ OPTION B: FINAL CHECKLIST

## Server: ✅ 100% DONE!
No changes needed. Just run: `node server.js`

---

## Dashboard: 3 Easy Changes

### Change #1: Add auth.js script
**File:** `/public/index.html`
**Location:** In the `<head>` section, before `</head>`
**Add this line:**
```html
<script src="auth.js"></script>
```

### Change #2: Update initialization
**File:** `/public/index.html`
**Location:** Bottom of the `<script>` section (last few lines)
**Find:**
```javascript
// Initial load and start countdown
loadEmails();
startCountdown();
```

**Replace with:**
```javascript
// Initial load and start countdown
(async () => {
    await window.EmailTrackerAuth.initApiKey();
    loadEmails();
    startCountdown();
})();
```

### Change #3: Update ALL fetch headers
**File:** `/public/index.html`
**Location:** Inside every `fetch('/api/...)` call
**Find:** (appears 4 times)
```javascript
headers: { 'Content-Type': 'application/json' }
```

**Replace with:**
```javascript
headers: window.EmailTrackerAuth.getAuthHeaders()
```

**Where to find them:**
1. In `createTrackedEmail()` function
2. In `loadEmails()` function  
3. In `deleteEmail()` function
4. Any other `/api/emails` fetch calls

---

## Extension: 2 Easy Changes

### Change #1: Add auto-registration function
**File:** `/chrome-extension/content.js`
**Location:** After the `chrome.storage.onChanged` listener (around line 30)
**Add this function:**
```javascript
// Auto-register if no API key
async function ensureApiKey() {
    if (!API_KEY) {
        console.log('🆕 Email Tracker: No API key, auto-registering...');
        try {
            const response = await fetch(`${API_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                API_KEY = data.apiKey;
                
                // Save to Chrome storage
                chrome.storage.sync.set({ apiKey: API_KEY }, () => {
                    console.log('✅ Email Tracker: Auto-registered! API key saved');
                });
                
                return true;
            }
        } catch (error) {
            console.error('❌ Email Tracker: Auto-registration failed:', error);
            return false;
        }
    }
    return true;
}
```

### Change #2: Call ensureApiKey in createTrackingPixel
**File:** `/chrome-extension/content.js`
**Location:** Inside `createTrackingPixel` function (around line 110)
**Add at the VERY TOP of the function:**
```javascript
async function createTrackingPixel(subject, recipient) {
    // ADD THESE LINES FIRST:
    const hasKey = await ensureApiKey();
    if (!hasKey) {
        showErrorIndicator('Failed to auto-register');
        return null;
    }
    
    // Then the existing code continues:
    console.log('📡 Email Tracker: Creating tracking pixel...');
    // ... rest stays the same
}
```

---

## ✅ Done!

That's it! Just these 5 small changes:
- 3 in dashboard (add script, update init, update headers)
- 2 in extension (add function, call function)

Then you're ready to deploy! 🚀
