const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'tracking-data.json');

// Grace period: ignore opens within this many seconds after tracking link creation
const GRACE_PERIOD_SECONDS = 45;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize data file if it doesn't exist
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ emails: [] }, null, 2));
    }
}

// Read data
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return { emails: [] };
    }
}

// Write data
async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Parse user agent to get device info
function parseUserAgent(userAgent) {
    const ua = userAgent.toLowerCase();

    // OS Detection
    let os = 'Unknown';
    if (ua.includes('windows nt 10.0')) os = 'Windows 10/11';
    else if (ua.includes('windows nt 6.3')) os = 'Windows 8.1';
    else if (ua.includes('windows nt 6.2')) os = 'Windows 8';
    else if (ua.includes('windows nt 6.1')) os = 'Windows 7';
    else if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os x')) {
        const match = ua.match(/mac os x ([\d_]+)/);
        os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
    }
    else if (ua.includes('iphone')) os = 'iOS (iPhone)';
    else if (ua.includes('ipad')) os = 'iOS (iPad)';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('linux')) os = 'Linux';

    // Browser Detection
    let browser = 'Unknown';
    if (ua.includes('edg/')) browser = 'Edge';
    else if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('opera') || ua.includes('opr/')) browser = 'Opera';

    // Device Type
    let device = 'Desktop';
    if (ua.includes('mobile')) device = 'Mobile';
    else if (ua.includes('tablet') || ua.includes('ipad')) device = 'Tablet';

    return { os, browser, device };
}

// Improved bot detection
function detectOpenType(userAgent, headers) {
    if (!userAgent) {
        return { type: 'unknown', isLikelyReal: false };
    }

    const userAgentLower = userAgent.toLowerCase();

    // These are definitely bots/crawlers
    const definitelyBots = [
        'bot',
        'crawler',
        'spider',
        'slurp',
        'bingbot',
        'facebookexternalhit',
        'preview',
        'prefetch',
        'prerender'
    ];

    for (const pattern of definitelyBots) {
        if (userAgentLower.includes(pattern) && !userAgentLower.includes('webview')) {
            return { type: 'bot', isLikelyReal: false };
        }
    }

    // Gmail image proxy - this IS a real open!
    if (userAgentLower.includes('googleimageproxy') ||
        (headers['via'] && headers['via'].toLowerCase().includes('google'))) {
        return { type: 'gmail-proxy', isLikelyReal: true };
    }

    // Yahoo/AOL image proxies
    if (userAgentLower.includes('yahoo') && userAgentLower.includes('slurp') === false) {
        return { type: 'yahoo-proxy', isLikelyReal: true };
    }

    // Direct browser access
    if (userAgentLower.includes('mozilla') ||
        userAgentLower.includes('chrome') ||
        userAgentLower.includes('safari') ||
        userAgentLower.includes('firefox')) {
        return { type: 'browser', isLikelyReal: true };
    }

    // Mobile email clients
    if (userAgentLower.includes('mobile') ||
        userAgentLower.includes('iphone') ||
        userAgentLower.includes('android')) {
        return { type: 'mobile', isLikelyReal: true };
    }

    return { type: 'unknown', isLikelyReal: true };
}

// Check if open is within grace period
function isWithinGracePeriod(emailCreatedAt, openTimestamp) {
    const createdTime = new Date(emailCreatedAt).getTime();
    const openTime = new Date(openTimestamp).getTime();
    const diffSeconds = (openTime - createdTime) / 1000;

    return diffSeconds < GRACE_PERIOD_SECONDS;
}

// Create tracking pixel endpoint - GET request
app.get('/track/:id', async (req, res) => {
    const trackId = req.params.id;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Get IP address (works with proxies/load balancers)
    const ip = (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'Unknown'
    ).split(',')[0].trim().replace('::ffff:', '');

    const referer = req.headers['referer'] || 'Direct';

    // Parse user agent
    const deviceInfo = parseUserAgent(userAgent);

    // Detect open type
    const openInfo = detectOpenType(userAgent, req.headers);

    try {
        const data = await readData();
        const email = data.emails.find(e => e.trackingId === trackId);

        if (email) {
            const now = new Date().toISOString();
            const inGracePeriod = isWithinGracePeriod(email.createdAt, now);

            const openEvent = {
                timestamp: now,
                userAgent,
                ip,
                referer,
                openType: openInfo.type,
                isReal: openInfo.isLikelyReal,
                inGracePeriod: inGracePeriod,
                deviceInfo: {
                    os: deviceInfo.os,
                    browser: deviceInfo.browser,
                    device: deviceInfo.device
                },
                headers: {
                    via: req.headers['via'] || null,
                    accept: req.headers['accept'] || null,
                    acceptLanguage: req.headers['accept-language'] || null,
                    acceptEncoding: req.headers['accept-encoding'] || null
                }
            };

            email.opens = email.opens || [];
            email.opens.push(openEvent);

            // Update counts and last opened (only for real opens OUTSIDE grace period)
            const validOpens = email.opens.filter(o => o.isReal && !o.inGracePeriod);
            email.openCount = validOpens.length;

            if (openInfo.isLikelyReal && !inGracePeriod) {
                email.lastOpened = openEvent.timestamp;
            }

            await writeData(data);
        }
    } catch (error) {
        console.error('Error tracking open:', error);
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );

    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.end(pixel);
});

// Create new tracked email
app.post('/api/emails', async (req, res) => {
    try {
        const { subject, recipient } = req.body;

        if (!subject) {
            return res.status(400).json({ error: 'Subject is required' });
        }

        const trackingId = uuidv4();
        const trackingUrl = `${req.protocol}://${req.get('host')}/track/${trackingId}`;

        const newEmail = {
            id: uuidv4(),
            trackingId,
            trackingUrl,
            subject,
            recipient: recipient || 'Unknown',
            createdAt: new Date().toISOString(),
            opens: [],
            openCount: 0,
            lastOpened: null
        };

        const data = await readData();
        data.emails.unshift(newEmail);
        await writeData(data);

        res.json(newEmail);
    } catch (error) {
        console.error('Error creating email:', error);
        res.status(500).json({ error: 'Failed to create tracked email' });
    }
});

// Get all tracked emails
app.get('/api/emails', async (req, res) => {
    try {
        const data = await readData();
        const sortedEmails = data.emails.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
        res.json(sortedEmails);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// Get specific email details
app.get('/api/emails/:id', async (req, res) => {
    try {
        const data = await readData();
        const email = data.emails.find(e => e.id === req.params.id);

        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json(email);
    } catch (error) {
        console.error('Error fetching email:', error);
        res.status(500).json({ error: 'Failed to fetch email' });
    }
});

// Delete tracked email
app.delete('/api/emails/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.emails.findIndex(e => e.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Email not found' });
        }

        data.emails.splice(index, 1);
        await writeData(data);

        res.json({ message: 'Email deleted successfully' });
    } catch (error) {
        console.error('Error deleting email:', error);
        res.status(500).json({ error: 'Failed to delete email' });
    }
});

// Initialize and start server
async function startServer() {
    await initDataFile();
    app.listen(PORT, () => {
        console.log(`Email tracker server running on http://localhost:${PORT}`);
    });
}

startServer();
