# 🚀 Email Tracker - Complete Setup Guide

## ✅ What's Been Done

I've updated your email tracker with **API key authentication** for security:

1. ✅ Server has API key protection on all `/api/*` endpoints
2. ✅ Dashboard requires API key to create/view/delete emails
3. ✅ Chrome extension sends API key with requests
4. ✅ Tracking pixel endpoint (`/track/:id`) remains public (no auth needed)

---

## 🔑 Your Default API Key

**Default API Key:** `your-secret-api-key-123`

⚠️ **IMPORTANT:** Change this before deploying!

---

## 📋 Setup Steps

### 1. **Start the Server**

```bash
cd /Users/Jayden/Downloads/email-tracker-v3
npm install
node server.js
```

You should see:
```
Email tracker server running on http://localhost:3000
API Key: your-secret-api-key-123

IMPORTANT: Change the API key in server.js or set API_KEY environment variable!
```

### 2. **Open the Dashboard**

1. Go to: `http://localhost:3000`
2. You'll see the API Key Setup section
3. Enter your API key: `your-secret-api-key-123`
4. Click "Save API Key"
5. The API key is saved in your browser's localStorage

### 3. **Install Chrome Extension**

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select: `/Users/Jayden/Downloads/email-tracker-v3/chrome-extension`
5. The extension icon should appear in your toolbar

### 4. **Configure Extension**

1. Click the extension icon
2. In the popup:
   - **Server URL:** `http://localhost:3000` (or your deployed URL)
   - **API Key:** `your-secret-api-key-123`
   - Keep **Auto-track emails** enabled
3. Click "Save Settings"

### 5. **Test It Out!**

1. Go to Gmail: `https://mail.google.com`
2. Click "Compose" to write a new email
3. Add a recipient (required!)
4. Add a subject
5. Click into the message body
6. **Look for a green popup** in the bottom-right that says "📊 Email Tracking Active"
7. Send your email!

---

## 🔒 Security: Changing Your API Key

### Method 1: Edit server.js

1. Open `/Users/Jayden/Downloads/email-tracker-v3/server.js`
2. Find line 12:
   ```javascript
   const API_KEY = process.env.API_KEY || "your-secret-api-key-123";
   ```
3. Change `"your-secret-api-key-123"` to your own secure key
4. Restart the server

### Method 2: Environment Variable (Recommended for Production)

```bash
export API_KEY="your-super-secret-key-here"
node server.js
```

Or create a `.env` file:
```
API_KEY=your-super-secret-key-here
PORT=3000
```

Then use `dotenv`:
```bash
npm install dotenv
```

Update server.js (add at the top):
```javascript
require('dotenv').config();
```

---

## 🌐 Deploying to Production

When deploying (e.g., to Render, Heroku, etc.):

1. **Set API Key Environment Variable**
   - Don't hardcode it in server.js
   - Use your hosting platform's environment variable settings

2. **Update Dashboard**
   - Open dashboard at your deployed URL
   - Enter your new API key
   - Save it

3. **Update Chrome Extension**
   - Click extension icon
   - Change Server URL to your deployed URL (e.g., `https://email-tracker-v3.onrender.com`)
   - Enter your API key
   - Save settings

---

## 🎯 How It Works

```
┌─────────────────┐
│  Chrome Ext     │
│  (Gmail)        │
└────────┬────────┘
         │ 1. User composes email
         │ 2. Extension calls /api/emails with API key
         ↓
┌─────────────────┐
│  Node Server    │
│  Express.js     │
├─────────────────┤
│  • Validates    │
│    API key      │
│  • Creates      │
│    tracking URL │
│  • Returns to   │
│    extension    │
└────────┬────────┘
         │ 3. Extension injects pixel into email
         ↓
┌─────────────────┐
│  Recipient      │
│  Opens Email    │
└────────┬────────┘
         │ 4. Email client loads tracking pixel
         │ 5. GET /track/:id (no auth needed!)
         ↓
┌─────────────────┐
│  Server Logs    │
│  • IP address   │
│  • Device info  │
│  • Timestamp    │
│  • User agent   │
└────────┬────────┘
         │ 6. Data saved to tracking-data.json
         ↓
┌─────────────────┐
│  Dashboard      │
│  (You)          │
├─────────────────┤
│  • View opens   │
│  • See details  │
│  • Track stats  │
└─────────────────┘
```

---

## 🐛 Troubleshooting

### Green popup doesn't appear?
1. Open Chrome DevTools (F12) on Gmail
2. Go to Console tab
3. Look for "🚀 Email Tracker" messages
4. Make sure extension is loaded and API key is set

### "Invalid API key" error?
1. Check extension has correct API key set
2. Check dashboard has correct API key saved
3. Make sure server.js has the same API key
4. Restart server after changing API key

### Tracking not working?
1. Verify recipient was added BEFORE clicking message body
2. Check server is running
3. Check Server URL in extension matches actual server URL
4. Look for errors in browser console and server logs

### Opens not appearing in dashboard?
- Opens within first 45 seconds are ignored (grace period while composing)
- Bot/crawler opens are flagged separately
- Gmail proxy opens count as real opens

---

## 📊 Features

✅ **Smart Bot Detection**
- Filters out email crawlers
- Gmail/Yahoo proxies = real opens
- Bot opens shown separately

✅ **Grace Period**
- First 45 seconds ignored (while composing)
- Prevents counting yourself

✅ **Device Tracking**
- OS detection
- Browser detection
- Device type (Desktop/Mobile/Tablet)

✅ **Open Details**
- Timestamp
- IP address
- User agent
- Referer

✅ **Auto-Refresh**
- Dashboard updates every 10 seconds
- Manual refresh button available

---

## 🎉 You're All Set!

Your email tracker is now fully configured with API key security. Remember to:
- Change the default API key before deploying
- Keep your API key secret
- Update both dashboard and extension with the same API key

Happy tracking! 📧✨
