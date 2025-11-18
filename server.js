const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'tracking-data.json');

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

// Improved bot detection - less aggressive
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
    // Gmail only loads images through proxy when user opens the email
    if (userAgentLower.includes('googleimageproxy') || 
        (headers['via'] && headers['via'].toLowerCase().includes('google'))) {
        return { type: 'gmail-proxy', isLikelyReal: true };
    }
    
    // Yahoo/AOL image proxies - also real opens
    if (userAgentLower.includes('yahoo') && userAgentLower.includes('slurp') === false) {
        return { type: 'yahoo-proxy', isLikelyReal: true };
    }
    
    // Direct browser access - definitely real
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
    
    // Default: probably real but uncertain
    return { type: 'unknown', isLikelyReal: true };
}

// Create tracking pixel endpoint - GET request
app.get('/track/:id', async (req, res) => {
    const trackId = req.params.id;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const referer = req.headers['referer'] || 'Direct';
    
    // Detect open type
    const openInfo = detectOpenType(userAgent, req.headers);
    
    try {
        const data = await readData();
        const email = data.emails.find(e => e.trackingId === trackId);
        
        if (email) {
            const openEvent = {
                timestamp: new Date().toISOString(),
                userAgent,
                ip: ip.replace('::ffff:', ''), // Clean IPv6 prefix
                referer,
                openType: openInfo.type,
                isReal: openInfo.isLikelyReal,
                headers: {
                    via: req.headers['via'] || null,
                    accept: req.headers['accept'] || null,
                    acceptLanguage: req.headers['accept-language'] || null
                }
            };
            
            email.opens = email.opens || [];
            email.opens.push(openEvent);
            
            // Update counts and last opened
            const realOpens = email.opens.filter(o => o.isReal);
            email.openCount = realOpens.length;
            
            if (openInfo.isLikelyReal) {
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
        data.emails.unshift(newEmail); // Add to beginning
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
        
        // Sort by creation date (newest first)
        const sortedEmails = data.emails.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
        
        res.json(sortedEmails);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// Get specific email details with all opens
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
