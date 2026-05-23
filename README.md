# Email Tracker

An intelligent email tracking system that monitors email opens with invisible tracking pixels. It is designed for Gmail extension use and filters automated requests, duplicate proxy loads, compose-time image loads, and owner-side views so the dashboard focuses on recipient opens.

## Features

**Accurate Open Tracking**
Counts supported recipient Gmail/Yahoo image-proxy opens while ignoring grace-period loads, duplicate opens, direct browser test hits, and owner/self opens detected by the extension.

**Chrome Extension Integration**
The Chrome extension automatically creates tracking links, injects invisible pixels into Gmail compose windows, marks tracked emails as sent, adds Gmail inbox indicators, and suppresses owner-side reads when you open your own tracked threads.

**Real-Time Dashboard**
View tracked emails in a clean auto-refreshing dashboard with open counts, timestamps, tracking URLs, and expandable open history.

**API Key Authentication**
Each user has a private API key. Generate a key from the dashboard or extension, then use it to access only your tracked emails.

## Tracking Semantics

- Dashboard/API-created links activate immediately unless created with `deferCountingUntilSent: true`.
- Gmail extension-created links stay inactive until the extension detects the send action.
- Opens within the first 10 seconds after activation are ignored by default.
- Owner/self opens are suppressed by the extension through `/suppress-self-open` and `/report-self-view`.
- Duplicate opens from the same proxy type within 60 seconds are ignored.
- Only Gmail/Yahoo proxy opens are counted as reliable recipient opens.

## Local Development

```bash
npm install
npm start
```

Visit `http://localhost:3000`.

Set `MONGODB_URI` for persistent storage. For deployed environments behind a proxy, set `PUBLIC_BASE_URL` to your public HTTPS origin, for example `https://email-tracker-xxxx.onrender.com`.

## Testing

```bash
npm test
```

## Deploying to Render

**Step 1: Set Up MongoDB**

1. Create a free MongoDB Atlas account.
2. Create a new cluster.
3. Create a database user with a password.
4. Whitelist Render's outbound access as needed.
5. Copy your MongoDB connection string.

**Step 2: Deploy on Render**

1. Go to `render.com` and sign in with your GitHub account.
2. Click "New +" and select "Web Service".
3. Connect this repository.
4. Configure:
   - Name: `email-tracker`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`

**Step 3: Add Environment Variables**

- `MONGODB_URI`: your MongoDB connection string.
- `PUBLIC_BASE_URL`: your Render URL, such as `https://email-tracker-xxxx.onrender.com`.

## Chrome Extension

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the `chrome-extension` folder.
5. Open the extension popup, enter your API key, and set the server URL.

The extension adds checkmarks next to tracked Gmail rows. Green checkmarks indicate opens; gray checkmarks indicate tracked but unopened emails.

## API Endpoints

- `POST /api/auth/generate-key` - Generate a new API key.
- `POST /api/emails` - Create a tracked email.
- `POST /api/emails/:id/mark-sent` - Activate an extension-created tracked email after send.
- `POST /api/emails/:id/suppress-self-open` - Temporarily suppress owner-side Gmail opens.
- `POST /api/emails/:id/report-self-view` - Report an owner view and remove nearby self-open events.
- `GET /api/emails` - Get all tracked emails for the API key.
- `GET /api/emails/:id` - Get one tracked email.
- `DELETE /api/emails/:id` - Delete a tracked email.
- `GET /track/:id` - Tracking pixel endpoint.

## Tech Stack

- Backend: Node.js, Express, Mongoose
- Frontend: Vanilla JavaScript
- Storage: MongoDB
- Extension: Chrome Manifest V3

## Privacy & Ethics

Use this only for legitimate email tracking. Inform recipients where required, comply with privacy laws such as GDPR and CAN-SPAM, and avoid collecting data you do not need.
