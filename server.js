const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "tracking-data.json");
const USERS_FILE = path.join(__dirname, "users.json");

// Grace period: ignore opens within this many seconds after tracking link creation
const GRACE_PERIOD_SECONDS = 45;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// API Key validation middleware - validates and returns user
async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  try {
    const users = await readUsers();
    const user = users.find(u => u.apiKey === apiKey);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Initialize data file if it doesn't exist
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ emails: [] }, null, 2));
  }
}

// Initialize users file if it doesn't exist
async function initUsersFile() {
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

// Read users
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch {
    return [];
  }
}

// Write users
async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// Read data
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { emails: [] };
  }
}

// Write data
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get emails for a specific user
async function getUserEmails(userId) {
  const data = await readData();
  return data.emails.filter(email => email.userId === userId);
}

// Parse user agent to get device info
function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { os: "Unknown", browser: "Unknown", device: "Unknown" };
  }

  const ua = userAgent.toLowerCase();
  const original = userAgent; // Keep original for case-sensitive matching

  // OS Detection - Order matters! Check most specific first
  let os = "Unknown";

  // Mobile OS first (most specific)
  if (ua.includes("iphone")) {
    os = "iOS (iPhone)";
  } else if (ua.includes("ipad")) {
    os = "iOS (iPad)";
  } else if (ua.includes("android")) {
    // Try to get Android version
    const match = ua.match(/android\s+([\d.]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  }
  // Desktop OS
  else if (ua.includes("mac os x") || ua.includes("macintosh")) {
    const match = ua.match(/mac os x ([\d_]+)/);
    if (match) {
      const version = match[1].replace(/_/g, ".");
      os = `macOS ${version}`;
    } else {
      os = "macOS";
    }
  } else if (ua.includes("windows nt 10.0")) os = "Windows 10/11";
  else if (ua.includes("windows nt 6.3")) os = "Windows 8.1";
  else if (ua.includes("windows nt 6.2")) os = "Windows 8";
  else if (ua.includes("windows nt 6.1")) os = "Windows 7";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("linux") && !ua.includes("android")) os = "Linux";
  else if (ua.includes("cros")) os = "Chrome OS";

  // Browser Detection - Order is critical! Most specific first
  let browser = "Unknown";

  // Check for specific browsers that include "chrome" in UA but aren't Chrome
  if (ua.includes("edg/") || ua.includes("edge/")) {
    browser = "Edge";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "Opera";
  } else if (ua.includes("brave")) {
    browser = "Brave";
  }
  // Chrome and Chrome-based browsers
  else if (ua.includes("chrome/") || ua.includes("crios/")) {
    // Extract Chrome version
    const match = ua.match(/chrome\/([\d.]+)/);
    browser = match ? `Chrome ${match[1].split(".")[0]}` : "Chrome";
  } else if (ua.includes("chromium")) {
    browser = "Chromium";
  }
  // Firefox
  else if (ua.includes("firefox") || ua.includes("fxios")) {
    const match = ua.match(/firefox\/([\d.]+)/);
    browser = match ? `Firefox ${match[1].split(".")[0]}` : "Firefox";
  }
  // Safari - must be after Chrome check!
  else if (ua.includes("safari/") && !ua.includes("chrome")) {
    const match = ua.match(/version\/([\d.]+)/);
    browser = match ? `Safari ${match[1].split(".")[0]}` : "Safari";
  }
  // Other browsers
  else if (ua.includes("msie") || ua.includes("trident/")) {
    browser = "Internet Explorer";
  }

  // Device Type Detection
  let device = "Desktop/Laptop";

  // Mobile devices
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("ipod")) {
    device = "Mobile";
  }
  // Tablets
  else if (ua.includes("tablet") || ua.includes("ipad")) {
    device = "Tablet";
  }
  // Specific mobile keywords
  else if (ua.includes("android") && !ua.includes("mobile")) {
    device = "Tablet"; // Android without "mobile" is usually tablet
  }

  return { os, browser, device };
}

// Improved bot detection
function detectOpenType(userAgent, headers) {
  if (!userAgent) {
    return { type: "unknown", isLikelyReal: false };
  }

  const userAgentLower = userAgent.toLowerCase();

  // These are definitely bots/crawlers
  const definitelyBots = [
    "bot",
    "crawler",
    "spider",
    "slurp",
    "bingbot",
    "facebookexternalhit",
    "preview",
    "prefetch",
    "prerender",
  ];

  for (const pattern of definitelyBots) {
    if (
      userAgentLower.includes(pattern) &&
      !userAgentLower.includes("webview")
    ) {
      return { type: "bot", isLikelyReal: false };
    }
  }

  // Gmail image proxy - this IS a real open!
  if (
    userAgentLower.includes("googleimageproxy") ||
    (headers["via"] && headers["via"].toLowerCase().includes("google"))
  ) {
    return { type: "gmail-proxy", isLikelyReal: true };
  }

  // Yahoo/AOL image proxies
  if (
    userAgentLower.includes("yahoo") &&
    userAgentLower.includes("slurp") === false
  ) {
    return { type: "yahoo-proxy", isLikelyReal: true };
  }

  // Direct browser access
  if (
    userAgentLower.includes("mozilla") ||
    userAgentLower.includes("chrome") ||
    userAgentLower.includes("safari") ||
    userAgentLower.includes("firefox")
  ) {
    return { type: "browser", isLikelyReal: true };
  }

  // Mobile email clients
  if (
    userAgentLower.includes("mobile") ||
    userAgentLower.includes("iphone") ||
    userAgentLower.includes("android")
  ) {
    return { type: "mobile", isLikelyReal: true };
  }

  return { type: "unknown", isLikelyReal: true };
}

// Check if open is within grace period
function isWithinGracePeriod(emailCreatedAt, openTimestamp) {
  const createdTime = new Date(emailCreatedAt).getTime();
  const openTime = new Date(openTimestamp).getTime();
  const diffSeconds = (openTime - createdTime) / 1000;

  return diffSeconds < GRACE_PERIOD_SECONDS;
}

// Create tracking pixel endpoint - GET request
app.get("/track/:id", async (req, res) => {
  const trackId = req.params.id;
  const userAgent = req.headers["user-agent"] || "Unknown";

  // Get IP address (works with proxies/load balancers)
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "Unknown"
  )
    .split(",")[0]
    .trim()
    .replace("::ffff:", "");

  const referer = req.headers["referer"] || "Direct";

  // Parse user agent
  const deviceInfo = parseUserAgent(userAgent);

  // Detect open type
  const openInfo = detectOpenType(userAgent, req.headers);

  try {
    const data = await readData();
    const email = data.emails.find((e) => e.trackingId === trackId);

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
          device: deviceInfo.device,
        },
        headers: {
          via: req.headers["via"] || null,
          accept: req.headers["accept"] || null,
          acceptLanguage: req.headers["accept-language"] || null,
          acceptEncoding: req.headers["accept-encoding"] || null,
        },
      };

      email.opens = email.opens || [];
      email.opens.push(openEvent);

      // Update counts and last opened (only for real opens OUTSIDE grace period)
      const validOpens = email.opens.filter(
        (o) => o.isReal && !o.inGracePeriod
      );
      email.openCount = validOpens.length;

      if (openInfo.isLikelyReal && !inGracePeriod) {
        email.lastOpened = openEvent.timestamp;
      }

      await writeData(data);
    }
  } catch (error) {
    console.error("Error tracking open:", error);
  }

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": pixel.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(pixel);
});

// Register new user - auto-generates API key
app.post("/api/register", async (req, res) => {
  try {
    // Generate a unique API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const userId = uuidv4();
    
    const newUser = {
      userId,
      apiKey,
      createdAt: new Date().toISOString()
    };
    
    const users = await readUsers();
    users.push(newUser);
    await writeUsers(users);
    
    console.log(`✅ New user registered: ${userId}`);
    
    res.json({ 
      apiKey,
      userId,
      message: 'Registration successful! Save your API key.' 
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Create new tracked email
app.post("/api/emails", requireApiKey, async (req, res) => {
  try {
    const { subject, recipient } = req.body;

    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    const trackingId = uuidv4();
    const trackingUrl = `${req.protocol}://${req.get(
      "host"
    )}/track/${trackingId}`;

    const newEmail = {
      id: uuidv4(),
      trackingId,
      trackingUrl,
      subject,
      recipient: recipient || "Unknown",
      userId: req.user.userId, // Associate with user
      createdAt: new Date().toISOString(),
      opens: [],
      openCount: 0,
      lastOpened: null,
    };

    const data = await readData();
    data.emails.unshift(newEmail);
    await writeData(data);

    res.json(newEmail);
  } catch (error) {
    console.error("Error creating email:", error);
    res.status(500).json({ error: "Failed to create tracked email" });
  }
});

// Get all tracked emails for the authenticated user
app.get("/api/emails", requireApiKey, async (req, res) => {
  try {
    const userEmails = await getUserEmails(req.user.userId);
    const sortedEmails = userEmails.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(sortedEmails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// Get specific email details (must belong to user)
app.get("/api/emails/:id", requireApiKey, async (req, res) => {
  try {
    const data = await readData();
    const email = data.emails.find((e) => e.id === req.params.id && e.userId === req.user.userId);

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    res.json(email);
  } catch (error) {
    console.error("Error fetching email:", error);
    res.status(500).json({ error: "Failed to fetch email" });
  }
});

// Delete tracked email (must belong to user)
app.delete("/api/emails/:id", requireApiKey, async (req, res) => {
  try {
    const data = await readData();
    const index = data.emails.findIndex((e) => e.id === req.params.id && e.userId === req.user.userId);

    if (index === -1) {
      return res.status(404).json({ error: "Email not found" });
    }

    data.emails.splice(index, 1);
    await writeData(data);

    res.json({ message: "Email deleted successfully" });
  } catch (error) {
    console.error("Error deleting email:", error);
    res.status(500).json({ error: "Failed to delete email" });
  }
});

// Initialize and start server
async function startServer() {
  await initDataFile();
  await initUsersFile();
  
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Email Tracker Server Running`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📋 Setup:`);
    console.log(`   • Users auto-register and get their own API key`);
    console.log(`   • Each user's tracking is separate and private`);
    console.log(`   • Extension will auto-register on first use`);
    console.log(`\n💡 Multi-tenant email tracking ready!`);
    console.log(`${'='.repeat(60)}\n`);
  });
}

startServer();
