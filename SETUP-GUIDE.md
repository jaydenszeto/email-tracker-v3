# 🚀 Email Tracker - Super Easy Setup Guide

## 🎯 How It Works Now

Your email tracker **automatically generates a secure API key** the first time you start the server! No manual setup needed! 🎉

---

## 📋 Quick Setup (3 Steps!)

### Step 1: **Start the Server** 🖥️

```bash
cd /Users/Jayden/Downloads/email-tracker-v3
npm install
node server.js
```

You'll see something like this:

```
============================================================
🚀 Email Tracker Server Running
============================================================
📍 URL: http://localhost:3000
🔑 API Key: a3f8c9d2e1b4567890abcdef1234567890abcdef1234567890abcdef12345678
============================================================

📋 Next Steps:
   1. Open: http://localhost:3000
   2. Dashboard will auto-load your API key
   3. Configure Chrome extension with this API key

💡 Your API key is saved in config.json
============================================================
```

**Copy that API key!** You'll need it for the Chrome extension.

### Step 2: **Open the Dashboard** 🌐

1. Go to: `http://localhost:3000`
2. The dashboard will **automatically fetch and save your API key**! ✨
3. The API key section will hide itself
4. You're ready to track emails!

### Step 3: **Setup Chrome Extension** 🔌

1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select folder: `/Users/Jayden/Downloads/email-tracker-v3/chrome-extension`
5. Click the extension icon in your toolbar
6. In the popup, paste your API key from Step 1
7. Click "Save Settings"

**That's it! You're done!** 🎉

---

## 🧪 Testing It Out

1. Go to Gmail: `https://mail.google.com`
2. Click **"Compose"** to write a new email
3. Add a **recipient** (important!)
4. Add a subject
5. **Click into the message body**
6. **Look for a green popup** in the bottom-right corner! 🟢
   - It says "📊 Email Tracking Active"
7. Send your email!
8. Check your dashboard to see opens!

---

## 🔒 Security & API Key Info

### Where is my API key stored?

- **Server**: `config.json` (auto-generated, saved locally)
- **Dashboard**: Your browser's localStorage
- **Extension**: Chrome's sync storage

### What if I lose my API key?

Just look in `config.json` in your project folder, or check the server console when it starts!

### Can I change my API key?

**Option 1 - Regenerate:**
```bash
# Delete the config file
rm config.json

# Restart server - it will generate a new key
node server.js
```

**Option 2 - Set your own:**
```bash
export API_KEY="your-custom-key-here"
node server.js
```

### Should I commit config.json to Git?

**NO!** The `.gitignore` file already prevents this. Your API key should stay private.

---

## 🌐 Deploying to Production

When you deploy to a server like Render, Heroku, Railway, etc.:

### 1. **Set Environment Variable**

In your hosting platform's dashboard:
- Variable name: `API_KEY`
- Value: (copy from your server console or config.json)

### 2. **Update Dashboard**

- Open your deployed URL (e.g., `https://your-app.onrender.com`)
- Dashboard will auto-fetch the API key
- Done! ✅

### 3. **Update Chrome Extension**

- Click extension icon
- Change **Server URL** to your deployed URL
- Paste the **API Key** from your environment variable
- Save settings

---

## 🔍 How the Auto-Generation Works

```javascript
// On server startup:
1. Check if config.json exists
   ├─ YES: Load API key from config.json
   └─ NO: Generate new 64-character hex key using crypto.randomBytes(32)

2. Save API key to config.json

3. Start server and display API key

// On dashboard load:
1. Check localStorage for saved API key
   ├─ YES: Use it and hide API key section
   └─ NO: Fetch from /api/key endpoint

2. Save to localStorage for next time
```

---

## 🎨 What You'll See

### **Server Console:**
```
🔑 Generated new API key!
💾 API key saved to config.json
============================================================
🚀 Email Tracker Server Running
============================================================
📍 URL: http://localhost:3000
🔑 API Key: [your-key-here]
============================================================
```

### **Dashboard (First Visit):**
- Briefly shows "API Key Setup" section
- Auto-fetches key from server
- Section disappears
- Shows "Create New Tracking Link" form

### **Gmail + Extension:**
- Green popup appears when you click message body
- "📊 Email Tracking Active"
- Click it to see tracking URL
- Auto-injects invisible pixel

### **Dashboard (After Email Sent):**
- Auto-refreshes every 10 seconds
- Shows open count
- Displays device info, IP, timestamp
- Filters bot opens separately

---

## 🐛 Troubleshooting

### "Invalid API key" error?

**Dashboard:**
- Open browser console (F12)
- Click "Set API Key" button to re-enter manually
- Or clear localStorage and refresh

**Extension:**
- Check that API key matches server
- Look at server console for the correct key
- Re-save in extension popup

### Green popup not showing?

1. **Check recipient** - Must add recipient BEFORE clicking body
2. **Open DevTools** on Gmail (F12) → Console tab
3. **Look for** "🚀 Email Tracker" messages
4. **Verify** extension is loaded (`chrome://extensions/`)
5. **Check** API key is set in extension popup

### Server won't start?

```bash
# Make sure dependencies are installed
npm install

# Check if port 3000 is already in use
# Try a different port:
PORT=3001 node server.js
```

### Dashboard shows "please set your api key first"?

- Server might not be running
- Check server is at `http://localhost:3000`
- Try manually entering API key from config.json

---

## 📊 Features Overview

✅ **Auto-Generated API Key** (64-char secure hex)
✅ **Smart Bot Detection** (Gmail/Yahoo proxies = real)
✅ **45-Second Grace Period** (ignores opens while composing)
✅ **Device Tracking** (OS, Browser, Device Type)
✅ **IP & Timestamp Logging**
✅ **Auto-Refresh Dashboard** (every 10 seconds)
✅ **Chrome Extension** (auto-injects tracking pixel)
✅ **Beautiful Dark UI** (glass-morphism design)

---

## 🎉 You're All Set!

The system is now fully automated:
- ✅ Server auto-generates secure API key
- ✅ Dashboard auto-fetches API key
- ✅ Extension auto-tracks emails
- ✅ Everything just works!

**Just remember to copy your API key from the server console to configure the Chrome extension!**

Happy tracking! 📧✨
