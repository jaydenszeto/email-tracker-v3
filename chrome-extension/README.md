# Email Tracker Chrome Extension

This Chrome extension automatically adds tracking pixels to all your Gmail emails.

## Installation

1. **Open Chrome Extensions page**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the extension**:
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Add icons** (required):
   - Create three PNG icons named:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)
   - Place them in the `chrome-extension` folder
   - Use a simple email/tracking icon design

## How It Works

1. **Automatic Tracking**: When you compose an email in Gmail, the extension automatically:
   - Creates a tracking link on your server
   - Injects an invisible 1x1 pixel at the end of your email
   - Shows a "📊 Tracking enabled" indicator

2. **60-Second Grace Period**: Opens within 60 seconds of creating the tracking link are ignored (this filters out Gmail's preview/loading)

3. **Rich Tracking Data**: Each open captures:
   - IP address
   - Operating system (Windows, macOS, iOS, Android, Linux)
   - Browser (Chrome, Firefox, Safari, Edge)
   - Device type (Desktop, Mobile, Tablet)
   - Timestamp
   - User agent

## Settings

Click the extension icon to:
- **Toggle auto-tracking** on/off
- **Set server URL** (change from localhost to your deployed URL)
- **Open dashboard** to view tracked emails

## Configuration

### For Local Development
- Default server: `http://localhost:3000`
- Make sure your email tracker server is running

### For Production (Render)
1. Deploy your server to Render
2. Click the extension icon
3. Change Server URL to: `https://your-app.onrender.com`
4. Click "Save Settings"

## Features

- ✅ Automatic pixel injection
- ✅ Visual tracking indicator
- ✅ 60-second grace period
- ✅ Rich device/browser detection
- ✅ IP address tracking
- ✅ Easy on/off toggle
- ✅ Works with Gmail

## Creating Icons

You can create simple icons using:
1. **Online tools**: Use Canva, Figma, or similar
2. **Icon generators**: Search for "favicon generator"
3. **Simple design**: Use 📧 or 📊 emoji as inspiration

## Troubleshooting

- **Tracking not working**: Check that the server URL is correct in settings
- **Pixel not injecting**: Make sure auto-track is enabled
- **Can't see opens**: Remember the 60-second grace period after sending

## Privacy & Ethics

Always:
- Inform recipients that emails may be tracked
- Comply with privacy laws (GDPR, CAN-SPAM)
- Use responsibly and ethically
