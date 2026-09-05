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
- Gmail extension-created links stay inactive until the extension detects the send action (Send click, Cmd/Ctrl+Enter, or the compose surface closing). If the send signal is missed entirely, counting starts automatically 30 minutes after creation.
- Opens within the first 10 seconds after activation are ignored by default.
- Duplicate opens from the same proxy type within 60 seconds are ignored.
- Only Gmail/Yahoo proxy opens are counted as reliable recipient opens. Direct browser loads (including your own compose window, the dashboard's "copy URL" tests, and Outlook/Apple Mail, which don't proxy) are recorded as *filtered* opens, never counted.

### How self-opens are filtered

Your own views of a sent email go through the same Gmail image proxy as a recipient's, so they are indistinguishable on the wire. The extension therefore tells the server when *you* are looking:

| Moment | Extension | Server |
|---|---|---|
| Body first focused | Creates the tracked email (even before subject/recipient are typed) and injects the pixel | Record stays inactive (`sentAt: null`) |
| Send (click / shortcut) | Sends the *final* subject + recipient, arms a 45s owner window | `mark-sent` updates the record, sets `sentAt`, arms the 45s window itself as a backstop |
| You click a tracked row / open a tracked thread | Reports a self-view immediately from cache (no fetch first) | Arms a 45s window **and deletes any open counted within ±15s** (the proxy usually fetches before the report arrives) |
| Draft reopened / compose re-rendered | Re-attaches to the pixel already in the body instead of adding a second one | — |
| Your own IP loads the pixel directly | — | Ignored (`sender-ip`) |

Every filtered open is still recorded with its reason and shown in the dashboard as "N filtered opens", so you can see what was rejected and why.

## Deployment

The tracker runs on the `openclaw` Oracle Cloud server at **https://jaydenszeto.me/email-tracker/**. See [SETUP-GUIDE.md](SETUP-GUIDE.md#self-hosted-deployment-openclaw) for the server layout; redeploy with:

```bash
./deploy.sh
```

Health: `curl https://jaydenszeto.me/email-tracker/health` (reports DB state, uptime, version).

The old Render deployment (`email-tracker-v3.onrender.com`) is kept only so pixels inside already-sent emails keep working: when the same code runs on Render it 302-redirects `/track/:id` to the current server, so those opens land in the same database. Render's free tier sleeps after inactivity and takes ~30-60s to wake, which is why the primary host moved.

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

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `MONGODB_URI` | `mongodb://localhost:27017/email-tracker` | Database |
| `PUBLIC_BASE_URL` | request host | Origin (plus optional path prefix) baked into tracking URLs |
| `TRACK_REDIRECT_BASE` | empty (auto-set on Render) | If set, `/track/:id` redirects there instead of recording — for legacy hosts |
| `GRACE_PERIOD_SECONDS` | `10` | Ignore opens this soon after send |
| `SELF_OPEN_SUPPRESSION_SECONDS` | `45` | Owner-view window armed by send / self-view |
| `SELF_VIEW_WINDOW_SECONDS` | `15` | How far a self-view report reaches back to delete a counted open |
| `DEDUP_WINDOW_SECONDS` | `60` | Same-proxy duplicate window |
| `AUTO_SENT_FALLBACK_SECONDS` | `1800` | Treat unsent extension emails as sent after this |

The app can be mounted under a path prefix (the dashboard resolves API calls relative to the directory it was served from), so a reverse proxy can strip `/email-tracker` and forward to the app root.

### Moving data between deployments

`GET /api/emails` returns everything for a key. Wrap it as `{ "apiKey": "...", "emails": [...] }` and run:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/email-tracker node scripts/import-user.js export.json
```

Existing users are merged (same key keeps working in the extension), new emails are added, duplicates skipped.

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
- `POST /api/emails/:id/mark-sent` - Activate an extension-created tracked email after send. Accepts `{ subject, recipient }` to record the final values.
- `POST /api/emails/:id/suppress-self-open` - Temporarily suppress owner-side Gmail opens.
- `POST /api/emails/:id/report-self-view` - Report an owner view and remove nearby self-open events.
- `GET /api/emails` - Get all tracked emails for the API key.
- `GET /api/emails/:id` - Get one tracked email.
- `DELETE /api/emails/:id` - Delete a tracked email.
- `GET /track/:id` - Tracking pixel endpoint (always returns a 1x1 GIF, `no-store`).
- `GET /health` - Service + database status.

## Tech Stack

- Backend: Node.js, Express, Mongoose
- Frontend: Vanilla JavaScript
- Storage: MongoDB
- Extension: Chrome Manifest V3

## Privacy & Ethics

Use this only for legitimate email tracking. Inform recipients where required, comply with privacy laws such as GDPR and CAN-SPAM, and avoid collecting data you do not need.
