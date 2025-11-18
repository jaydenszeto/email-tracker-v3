# Email Tracker

A sleek email tracking system that uses invisible pixels to track email opens.

## Features

- 🎯 **Accurate Tracking**: Tracks real email opens while filtering out bots and email client prefetchers
- 🤖 **Bot Detection**: Automatically identifies and filters Gmail image proxy, mail clients, and other automated fetches
- 📊 **Real-time Dashboard**: Auto-refreshing dashboard shows open statistics
- 🎨 **Beautiful UI**: Dark theme with glass-morphism effects
- 📱 **Responsive**: Works on desktop and mobile devices

## How It Works

1. Create a tracking link for your email
2. Copy the tracking URL
3. Insert it as an image in your email:
   - **In Gmail**: Use the "Insert Image" button → "Web Address (URL)" → Paste the tracking URL
   - **In HTML emails**: Use the provided HTML snippet
4. When the recipient opens the email, the invisible pixel loads and records the open

## Local Development

```bash
cd email-tracker-v3
npm install
npm start
```

Visit http://localhost:3000

## Deploy to Render

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [Render.com](https://render.com) and sign in
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `email-tracker` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for better performance)
5. Click "Create Web Service"

Render will automatically deploy your app. The URL will be something like:
`https://email-tracker-xxxx.onrender.com`

### Important Notes for Deployment

- The app automatically uses `process.env.PORT` which Render provides
- Tracking URLs will automatically use your Render domain
- The free tier may spin down after inactivity (takes ~30 seconds to wake up)
- Data is stored in `tracking-data.json` (consider using a database for production)

## How to Use in Gmail

Since Gmail doesn't allow you to paste raw HTML, use this method:

1. **Create tracking link** on the dashboard
2. **Copy the tracking URL**
3. **In Gmail compose window**:
   - Click the "Insert Image" icon (picture icon in toolbar)
   - Select "Web address (URL)"
   - Paste your tracking URL
   - Click "Insert"
4. **Optional**: Resize the image to be very small or use Gmail's developer tools to set it to 1x1 pixel

## How to Use in HTML Email Services

For services like Mailchimp, SendGrid, or custom HTML emails:

1. Copy the HTML snippet: `<img src="YOUR_TRACKING_URL" width="1" height="1" style="display:none" />`
2. Paste it at the end of your email's HTML body
3. Send the email

## Bot Filtering

The system automatically filters out:
- Gmail image proxy requests
- Email client prefetchers
- Search engine bots
- Preview/pre-render requests

Only legitimate human opens are counted in the statistics.

## API Endpoints

- `POST /api/emails` - Create new tracked email
- `GET /api/emails` - Get all tracked emails
- `GET /api/emails/:id` - Get specific email details
- `DELETE /api/emails/:id` - Delete tracked email
- `GET /track/:id` - Tracking pixel endpoint

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript
- **Styling**: Tailwind CSS + IBM Plex Mono font
- **Storage**: JSON file (can be upgraded to a database)

## Privacy & Ethics

This tool is for legitimate email tracking purposes. Always:
- Inform recipients that emails may be tracked
- Comply with privacy laws (GDPR, CAN-SPAM, etc.)
- Use responsibly and ethically

## License

MIT
