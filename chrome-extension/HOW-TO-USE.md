# 🚀 How To Use The Chrome Extension - Simple Guide

## Step-by-Step: How It Works

### 1️⃣ Install the Extension
- Go to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `chrome-extension` folder
- ✅ Extension is now installed!

### 2️⃣ Make Sure Your Server is Running
```bash
cd /Users/Jayden/Downloads/email-tracker-v3
npm start
```
Server should be running at http://localhost:3000

### 3️⃣ Go to Gmail and Compose a New Email
- Click **"Compose"** in Gmail
- Wait 2-3 seconds for the extension to work

### 4️⃣ Look for the Green Indicator!

**You'll see a GREEN POPUP in the bottom-right corner that says:**

```
🟢 📊 Email Tracking Active
   Invisible pixel added to email
```

**This popup means:**
- ✅ Tracking pixel was successfully added
- ✅ Your email is being tracked
- ✅ When the recipient opens it, you'll see it in the dashboard

**Click the green popup to see the tracking URL!**

### 5️⃣ Write Your Email Normally
- The tracking pixel is **completely invisible**
- You won't see it in your email
- The recipient won't see it either
- It's a 1x1 transparent pixel at the very end

### 6️⃣ Send Your Email
- Click "Send" like normal
- That's it! You're done!

### 7️⃣ Check the Dashboard
1. Wait **60 seconds** (grace period)
2. Have the recipient open the email
3. Go to http://localhost:3000
4. Click "Refresh" or wait for auto-refresh
5. **See the open with full details!**

---

## What You'll See

### ✅ When It Works:
- **Green popup** appears bottom-right
- Says "Email Tracking Active"
- Lasts 8 seconds then fades away

### ❌ If Something's Wrong:
- **Red popup** appears
- Says "Tracking Failed - Check server connection"
- This means your server isn't running or URL is wrong

---

## Troubleshooting

### "I don't see the green popup"

**Check these things:**
1. Is the server running? (`npm start`)
2. Is the extension installed and enabled?
3. Did you wait 2-3 seconds after clicking "Compose"?
4. Try clicking the extension icon - is auto-track enabled?

**To debug:**
1. Right-click anywhere in Gmail
2. Click "Inspect"
3. Go to "Console" tab
4. Look for messages starting with "Email Tracker:"
5. You should see:
   ```
   Email Tracker: Content script loaded
   Email Tracker: Settings loaded
   Email Tracker: Gmail loaded successfully!
   Email Tracker: Processing compose window
   Email Tracker: SUCCESS - Tracking added to email
   ```

### "I see the green popup but opens aren't tracked"

**Remember:**
- Wait **60 seconds** after sending before opens count
- Opens during the first 60 seconds are ignored (grace period)
- Check that the recipient actually opened the email

### "The extension icon has a gray/disabled look"

**Fix:**
1. Click the extension icon
2. Make sure "Auto-track emails" toggle is **ON** (should be green)
3. Check that Server URL is correct: `http://localhost:3000`

---

## Quick Test

Want to test if it's working?

1. **Compose a new email to yourself**
2. **Wait for green popup** (2-3 seconds)
3. **Send the email**
4. **Wait 61 seconds** (to pass grace period)
5. **Open the email** in another tab or your phone
6. **Check dashboard** - you should see the open!

---

## What The Tracking Pixel Looks Like

In the actual email HTML, the extension adds this at the very end:

```html
<img src="http://localhost:3000/track/abc-123-xyz" 
     width="1" 
     height="1" 
     style="display:none !important; visibility:hidden !important; opacity:0 !important;" />
```

**You can't see it because:**
- It's 1 pixel by 1 pixel (tiny!)
- It's completely transparent
- It's hidden with CSS
- It loads silently when the email opens

**But it works because:**
- When the recipient opens the email, their email client loads all images
- This includes your tiny 1x1 pixel
- When it loads, your server records the open with all the details!

---

## Common Questions

**Q: Will the recipient know they're being tracked?**  
A: No, the pixel is completely invisible and doesn't affect the email at all.

**Q: Does it work with all email clients?**  
A: Yes! Works with Gmail, Outlook, Apple Mail, Yahoo, etc. As long as they load images (most do by default).

**Q: What if images are blocked?**  
A: Then the tracking won't work for that specific open. But most email clients load images automatically now.

**Q: Can I turn it off temporarily?**  
A: Yes! Click the extension icon and toggle "Auto-track emails" to OFF.

**Q: Does it track every email I send?**  
A: Yes, as long as auto-track is enabled. Every new compose window gets a tracking pixel automatically.

---

## Summary

1. **Install extension** ✅
2. **Start server** (`npm start`) ✅
3. **Compose email in Gmail** ✅
4. **Look for GREEN popup** (bottom-right) ✅
5. **Send email** ✅
6. **Wait 60 seconds** ✅
7. **Check dashboard** when recipient opens ✅

**That's it! Super simple!** 🎉
