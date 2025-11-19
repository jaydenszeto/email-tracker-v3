# 🐛 Debugging Guide - How To Check If Extension Is Working

## Step 1: Open Gmail Console

1. Go to Gmail (https://mail.google.com)
2. Right-click anywhere on the page
3. Click **"Inspect"** or **"Inspect Element"**
4. Click the **"Console"** tab at the top

## Step 2: Look For These Messages

When the extension loads, you should see:

```
🚀 Email Tracker: Extension loaded!
⚙️ Email Tracker: Settings loaded: {API_URL: "...", AUTO_TRACK_ENABLED: true}
🚀 Email Tracker: Initializing extension...
✅ Email Tracker: Confirmed we are on Gmail
✅ Email Tracker: Gmail fully loaded!
👀 Email Tracker: Starting mutation observer...
✅ Email Tracker: Mutation observer active
🎯 Email Tracker: Extension is ready to track emails
📝 Email Tracker: Open a compose window to see tracking in action
```

**If you see these messages = Extension is working! ✅**

## Step 3: Click "Compose" in Gmail

After clicking compose, you should see:

```
🔍 Email Tracker: Scanning for compose windows...
✅ Email Tracker: Found 1 compose window(s) with selector: ...
📝 Email Tracker: Processing compose window #1
🎯 Email Tracker: Processing compose window...
⏳ Email Tracker: Waiting 2 seconds for compose window to load...
🔍 Email Tracker: Looking for email subject...
✅ Email Tracker: Found subject: (your subject)
🔍 Email Tracker: Looking for recipient email...
📡 Email Tracker: Creating tracking pixel...
📧 Subject: ...
👤 Recipient: ...
🌐 Server URL: https://email-tracker-v3.onrender.com
📥 Email Tracker: Server response status: 200
✅ Email Tracker: Tracking URL created: https://...
💉 Email Tracker: Attempting to inject tracking pixel...
🔗 Tracking URL: https://...
✅ Email Tracker: Found editor with selector: ...
🎨 Email Tracker: Pixel HTML: <img src="..." ...>
✅ Email Tracker: Pixel injected successfully via appendChild
🟢 Email Tracker: Showing success indicator
✅ Email Tracker: Green indicator added to page
🎉 Email Tracker: SUCCESS! Tracking pixel added to email
```

**If you see this = Pixel was added successfully! You should see the green popup! ✅**

## Step 4: What The Green Popup Looks Like

**Location:** Bottom-right corner of your screen

**Appearance:**

- Black background with green border
- Green pulsing dot
- Text: "📊 Email Tracking Active"
- Sub-text: "Pixel added successfully"

**Duration:** Shows for 8 seconds, then fades away

**Click it:** Shows you the tracking URL

---

## Common Issues & Solutions

### Issue 1: No Console Messages At All

**Problem:** Extension not loaded

**Solution:**

1. Go to `chrome://extensions/`
2. Find "Email Tracker"
3. Make sure it's **enabled** (toggle on the right)
4. Check for errors shown in red
5. Try clicking the "Reload" button (circular arrow icon)
6. Refresh Gmail

### Issue 2: "❌ Email Tracker: Not on Gmail"

**Problem:** You're not on mail.google.com

**Solution:**

- Go to https://mail.google.com
- Make sure URL starts with `mail.google.com`

### Issue 3: "❌ Email Tracker: Server error: ..."

**Problem:** Can't connect to server

**Solutions:**

- Check if server URL is correct
- Click extension icon → verify URL is `https://email-tracker-v3.onrender.com`
- Try opening the URL in a new tab - does it load?
- If using localhost: make sure `npm start` is running

### Issue 4: "❌ Email Tracker: Could not find email editor!"

**Problem:** Can't find where to insert the pixel

**Solutions:**

- Wait 2-3 seconds longer after clicking compose
- Try typing something in the email body first
- Refresh Gmail and try again

### Issue 5: Green Popup Doesn't Appear

**Problem:** Even though console shows success

**Solutions:**

1. Scroll down - it might be hidden behind Gmail's UI
2. Check if popup blockers are interfering
3. Try zooming out (Ctrl + Minus) to see full screen
4. Look in bottom-right corner specifically

### Issue 6: "⚠️ Email Tracker: Could not find recipient"

**This is OK!** The extension will use "Unknown" as recipient. Tracking still works.

---

## Quick Test

Want to test everything end-to-end?

1. **Open Console** (Right-click → Inspect → Console)
2. **Click Compose** in Gmail
3. **Look for green popup** bottom-right (wait 2-3 seconds)
4. **Type a subject** like "Test"
5. **Add your own email** as recipient
6. **Send the email**
7. **Wait 61 seconds** (important!)
8. **Open the email** you just sent
9. **Go to dashboard:** https://email-tracker-v3.onrender.com
10. **Click refresh** - you should see the open!

---

## Console Error Messages

### "Failed to fetch"

- Server is down or URL is wrong
- Check server URL in extension settings

### "TypeError: Cannot read property..."

- Gmail structure changed
- Report this as a bug

### "Extension context invalidated"

- Extension was reloaded while page was open
- Refresh Gmail page

---

## Still Not Working?

**Share these details:**

1. Screenshot of console messages
2. What happens when you click compose
3. Do you see the green popup? (Yes/No)
4. Server URL you're using
5. Any error messages in red

---

## Success Checklist

✅ Console shows "Extension loaded!"
✅ Console shows "Gmail fully loaded!"
✅ Compose window shows "Processing compose window"
✅ Console shows "Tracking URL created"
✅ Console shows "Pixel injected successfully"
✅ Green popup appears bottom-right
✅ You can click the green popup to see tracking URL

**If all checked = Working perfectly!** 🎉
