# 🌐 Render Deployment Guide

## Important: API Keys & URLs

### ❓ Should the Render URL include the API key?

**NO!** Here's why:

### 🎯 Three Different Types of URLs:

1. **Dashboard URL** (No API key needed)
   ```
   https://email-tracker-v3.onrender.com
   ```
   - Users just visit this URL
   - Dashboard auto-registers them
   - API key is saved in browser's localStorage
   - **Never put API keys in the URL!** (security risk)

2. **Tracking Pixel URL** (No API key needed)
   ```
   https://email-tracker-v3.onrender.com/track/abc-123-xyz
   ```
   - This is the invisible image in emails
   - Anyone can load it (no auth required)
   - When loaded, it records the open
   - **Public by design** - that's how tracking works!

3. **API Endpoints** (API key in HEADER, not URL)
   ```
   POST https://email-tracker-v3.onrender.com/api/emails
   Headers:
     X-API-Key: your-secret-key-here
   ```
   - Extension and dashboard use these
   - API key goes in the HTTP header
   - **Never in the URL!** (would be visible in logs)

---

## 🔐 How API Keys Work

### For Users:

1. **They never see or type API keys manually**
   - Extension auto-registers → gets API key → saves it
   - Dashboard auto-registers → gets API key → saves it
   - Everything is automatic!

2. **API key is stored securely**
   - Extension: Chrome's sync storage (encrypted)
   - Dashboard: Browser's localStorage
   - Server: Hashed in database (if we add that feature)

3. **API key syncing is automatic**
   - User clicks "Open Dashboard" in extension
   - Extension passes API key via URL hash: `#apiKey=abc123`
   - Dashboard reads hash, saves to localStorage
   - User never sees the key!

### For Developers:

API keys are sent in HTTP headers:
```bash
# Creating an email:
curl -X POST https://email-tracker-v3.onrender.com/api/emails \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{"subject":"Test","recipient":"test@example.com"}'

# Getting emails:
curl https://email-tracker-v3.onrender.com/api/emails \
  -H "X-API-Key: your-secret-key-here"
```

---

## 🚀 Render Deployment Checklist

### ✅ What's Already Configured:

- [x] Server starts automatically
- [x] Auto-generates unique API keys per user
- [x] Multi-tenant (multiple users supported)
- [x] CORS enabled (extension can connect)
- [x] Port binding (Render's dynamic ports)

### 📋 What You Need to Do:

1. **Update Extension Settings**
   - Server URL: `https://email-tracker-v3.onrender.com`
   - Leave API key empty (will auto-generate)

2. **Test the Flow**
   - Install extension
   - Click extension icon (it will auto-register)
   - Click "Open Dashboard"
   - Dashboard opens with synced API key
   - Create test email in Gmail

---

## 🎯 User Journey (Production)

### First-Time User:

```
User installs extension from Chrome Web Store
    ↓
Opens extension popup
    ↓
Extension calls: POST /api/register
    ↓
Server returns API key
    ↓
Extension saves key
    ↓
User clicks "Open Dashboard"
    ↓
Opens: https://email-tracker-v3.onrender.com#apiKey=xyz
    ↓
Dashboard reads hash, saves key
    ↓
Dashboard shows: "📱 This dashboard is synced with your extension!"
    ↓
User can now:
  • Track emails via extension
  • View opens on dashboard
  • Both use same API key!
```

---

## 🔒 Security Notes

### ✅ Good Practices (Already Implemented):

1. **API keys in headers, not URLs**
   - URLs are logged everywhere
   - Headers are more secure

2. **API keys are long & random**
   - 64 hex characters (256 bits)
   - Cryptographically secure (crypto.randomBytes)

3. **Each user gets unique key**
   - No shared keys
   - Data isolation per user

4. **Tracking links are stateless**
   - No sensitive data in tracking URLs
   - Just a UUID: `/track/abc-123-xyz`

### 🚫 Don't Do This:

- ❌ `https://app.com?apiKey=secret` (key in URL)
- ❌ `https://app.com/user/secret/emails` (key in path)
- ❌ Hardcoding API keys in code
- ❌ Sharing API keys between users

---

## 📊 Current Setup

### Render Configuration:

```
Service: email-tracker-v3
URL: https://email-tracker-v3.onrender.com
Region: Oregon (US West)
Instance: Free tier
Build: npm install
Start: npm start (node server.js)
Port: Auto-detected (10000 internally, 443 externally)
```

### Environment:
- No environment variables needed!
- Everything auto-configures
- Multi-tenant by default

---

## 🧪 Testing Your Deployment

### Test 1: Check Server Health
```bash
curl https://email-tracker-v3.onrender.com
# Should return: 200 OK (HTML page)
```

### Test 2: Register New User
```bash
curl -X POST https://email-tracker-v3.onrender.com/api/register
# Should return: {"apiKey":"...","userId":"...","message":"..."}
```

### Test 3: Create Email (use API key from Test 2)
```bash
curl -X POST https://email-tracker-v3.onrender.com/api/emails \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY_HERE" \
  -d '{"subject":"Test","recipient":"test@example.com"}'
# Should return: {"id":"...","trackingUrl":"...","subject":"Test",...}
```

### Test 4: Get Emails
```bash
curl https://email-tracker-v3.onrender.com/api/emails \
  -H "X-API-Key: YOUR_KEY_HERE"
# Should return: [{"id":"...","subject":"Test",...}]
```

---

## 📱 Extension Configuration

Update these in the extension's popup settings:

```javascript
Server URL: https://email-tracker-v3.onrender.com
API Key: (leave empty - will auto-generate)
Auto-track: ✅ Enabled
```

---

## 🎉 Summary

### For Users:
- Just install extension
- Everything is automatic
- No API keys to manage
- Use "Open Dashboard" button to stay synced

### For You:
- API keys are handled automatically
- Server URL is all users need
- Multi-tenant works out of the box
- No environment variables needed

### Security:
- API keys in headers (not URLs)
- Long random keys (64 hex chars)
- Each user isolated
- Tracking links are public (by design)

---

## 🆘 Troubleshooting

### "Cannot connect to server"
- Check Render status: https://render.com/dashboard
- Check URL in extension settings
- Try: `curl https://email-tracker-v3.onrender.com`

### "Invalid API key"
- Extension and dashboard using different keys
- Solution: Click "Open Dashboard" in extension

### "No emails showing"
- Check browser console: `localStorage.getItem('emailTrackerApiKey')`
- Make sure you're using same browser/profile
- Try: Clear localStorage, refresh, will auto-register

---

**The key insight**: Users never manually enter API keys. It's all automatic! 🚀
