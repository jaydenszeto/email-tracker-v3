# Complete Email Tracker Setup Guide

## What You Now Have

- ✅ **Enhanced Server** - Tracks IP, device OS, browser, and device type
- ✅ **Beautiful Dashboard** - Shows all tracking data with clean timestamps
- ✅ **Chrome Extension** - Automatically adds tracking pixels to Gmail
- ✅ **10-Second Grace Period** - Filters out compose-time opens
- ✅ **Self-Open Suppression** - Ignores owner-side Gmail opens detected by the extension (send, row click, thread view), retroactively deleting any that raced ahead
- ✅ **Bot Detection** - Distinguishes real opens from automated ones

---

## Self-hosted deployment (openclaw)

Live at **https://jaydenszeto.me/email-tracker/**.

| Piece | Where |
|---|---|
| Code | `openclaw:/home/opc/email-tracker` (rsync'd by `./deploy.sh`) |
| Service | `email-tracker.service` — `systemctl status email-tracker`, `journalctl -u email-tracker -f` |
| Runtime | `/usr/bin/node` on port **3005**; env is inline `Environment=` lines in the unit (SELinux blocks `EnvironmentFile` under `/home`) |
| Database | `mongod` 8.0 on `127.0.0.1:27017`, db `email-tracker` (`systemctl status mongod`) |
| Reverse proxy | Caddy `/etc/caddy/Caddyfile`: `redir /email-tracker /email-tracker/` + `handle_path /email-tracker/* → localhost:3005` inside the `jaydenszeto.me` site block. Backup: `Caddyfile.bak.pre-email-tracker` |
| Health | `curl https://jaydenszeto.me/email-tracker/health` — `clientIp` must be your real IP, not 127.0.0.1 (Xray → Caddy PROXY protocol; see lessons) |

Redeploy after local changes: `./deploy.sh` (runs the tests first).

Extension users: the popup's Server URL should be `https://jaydenszeto.me/email-tracker`. Installs still pointing at the old Render URL are migrated automatically when the extension updates. Your existing API key keeps working — the data was imported.

---

## Quick Start

### 1. Install Dependencies & Start Server

```bash
cd /Users/Jayden/Downloads/email-tracker-v3
npm install
npm start
```

Server will run on: http://localhost:3000

### 2. Install Chrome Extension

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top right)
3. Click **"Load unpacked"**
4. Select folder: `/Users/Jayden/Downloads/email-tracker-v3/chrome-extension`

### 3. Create Extension Icons (Required)

The extension needs 3 icon files. Here's the easiest way:

**Option A: Use an Online Tool**
1. Go to https://favicon.io/favicon-converter/
2. Upload any image (or use 📧 emoji screenshot)
3. Download the ZIP
4. Rename and copy these files to `/chrome-extension/`:
   - `favicon-16x16.png` → `icon16.png`
   - `favicon-48x48.png` → `icon48.png` (or resize the 32x32)
   - `android-chrome-192x192.png` → `icon128.png`

**Option B: Simple PNG Files**
Just create 3 simple colored squares:
- 16x16 pixels → `icon16.png`
- 48x48 pixels → `icon48.png`
- 128x128 pixels → `icon128.png`

### 4. Test It Out!

1. **Open Gmail** and compose a new email
2. The extension will **automatically add** a tracking pixel
3. You'll see a **"📊 Tracking enabled"** indicator
4. Send the email
5. Open the **dashboard** at http://localhost:3000
6. Open the email from a separate recipient account after the 10-second grace period
7. **Refresh the dashboard** - you'll see the recipient open with full details!

---

## What Gets Tracked

Each email open captures:

- ⏰ **Exact timestamp** (e.g., "today at 4:32 PM")
- 📱 **Device type** (Desktop, Mobile, Tablet)
- 💻 **Operating System** (Windows 10, macOS, iOS, Android, etc.)
- 🌐 **Browser** (Chrome, Firefox, Safari, Edge)
- 🌍 **IP Address**
- 📧 **Client type** (Gmail proxy, direct browser, mobile app)

---

## Extension Settings

Click the extension icon in Chrome to:

- **Toggle auto-tracking** on/off
- **Change server URL** (for when you deploy to Render)
- **Open dashboard** quickly

---

## Deploy to Production (Render)

### Step 1: Push to GitHub

```bash
cd /Users/Jayden/Downloads/email-tracker-v3
git init
git add .
git commit -m "Email tracker with Chrome extension"
git branch -M main
# Add your GitHub repo URL
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to https://render.com and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `email-tracker`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **"Create Web Service"**

### Step 3: Update Extension

1. Once deployed, copy your Render URL (e.g., `https://email-tracker-abc123.onrender.com`)
2. Click the extension icon in Chrome
3. Change **Server URL** to your Render URL
4. Click **"Save Settings"**

Done! Your extension now uses the production server.

---

## Features Breakdown

### 🎯 10-Second Grace Period
- Prevents counting opens while you're composing
- Filters out Gmail's preview/image loading
- Works with self-open suppression so your own Gmail views do not become reads

### 🤖 Smart Bot Detection
- **Gmail Proxy** = Real open (Gmail loads images only when user opens)
- **Yahoo Proxy** = Real open
- **Direct Browser/Mobile Client** = Ignored unless routed through a supported mail proxy
- **Crawlers/Bots** = Filtered out

### 📊 Rich Analytics
- See exactly when emails are opened
- Know what device/browser they're using
- Track their IP address
- View multiple opens from same recipient

### 🎨 Beautiful UI
- Dark theme with glass-morphism
- IBM Plex Mono font
- Auto-refreshes every 10 seconds
- Matches your cal-dining-app aesthetic

---

## Tips

- **For personal use**: localhost is fine
- **For team/business**: Deploy to Render
- **Extension auto-tracks**: No manual pixel insertion needed
- **Dashboard shows all**: One place to see all tracked emails

---

## Troubleshooting

**Extension not tracking?**
- Check that auto-track is enabled (click extension icon)
- Verify server URL is correct
- Make sure server is running

**Not seeing opens?**
- Wait 10 seconds after sending (grace period)
- Check that the recipient opened the email in Gmail or Yahoo with images enabled
- Refresh the dashboard

**Icons not showing?**
- Extension requires icon files to load
- Follow icon creation steps above

---

## Privacy & Ethics

🚨 **Important**: Always inform recipients that emails may be tracked and comply with privacy laws (GDPR, CAN-SPAM, etc.).

---

Enjoy your new email tracker! 🎉
