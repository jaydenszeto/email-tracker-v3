const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/email-tracker";

const GRACE_PERIOD_SECONDS = 10;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const emailSchema = new mongoose.Schema({
  id: String,
  trackingId: String,
  trackingUrl: String,
  subject: String,
  recipient: String,
  senderIp: String,
  createdAt: String,
  sentAt: String,
  opens: [
    {
      timestamp: String,
      userAgent: String,
      ip: String,
      referer: String,
      openType: String,
      isReal: Boolean,
      isSelfView: Boolean,
      inGracePeriod: Boolean,
      deviceInfo: {
        os: String,
        browser: String,
        device: String,
      },
      headers: {
        via: String,
        accept: String,
        acceptLanguage: String,
        acceptEncoding: String,
      },
    },
  ],
  openCount: Number,
  lastOpened: String,
});

const userSchema = new mongoose.Schema({
  apiKey: { type: String, unique: true, required: true },
  createdAt: String,
  emails: [emailSchema],
});

const User = mongoose.model("User", userSchema);

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

function generateApiKey() {
  return crypto.randomBytes(32).toString("hex");
}

function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { os: "Unknown", browser: "Unknown", device: "Unknown" };
  }

  const ua = userAgent.toLowerCase();

  let os = "Unknown";
  if (ua.includes("iphone")) os = "iOS (iPhone)";
  else if (ua.includes("ipad")) os = "iOS (iPad)";
  else if (ua.includes("android")) {
    const match = ua.match(/android\s+([\d.]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (ua.includes("mac os x") || ua.includes("macintosh")) {
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

  let browser = "Unknown";
  if (ua.includes("edg/") || ua.includes("edge/")) {
    browser = "Edge";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "Opera";
  } else if (ua.includes("brave")) {
    browser = "Brave";
  } else if (ua.includes("chrome/") || ua.includes("crios/")) {
    const match = ua.match(/chrome\/([\d.]+)/);
    browser = match ? `Chrome ${match[1].split(".")[0]}` : "Chrome";
  } else if (ua.includes("chromium")) {
    browser = "Chromium";
  } else if (ua.includes("firefox") || ua.includes("fxios")) {
    const match = ua.match(/firefox\/([\d.]+)/);
    browser = match ? `Firefox ${match[1].split(".")[0]}` : "Firefox";
  } else if (ua.includes("safari/") && !ua.includes("chrome")) {
    const match = ua.match(/version\/([\d.]+)/);
    browser = match ? `Safari ${match[1].split(".")[0]}` : "Safari";
  } else if (ua.includes("msie") || ua.includes("trident/")) {
    browser = "Internet Explorer";
  }

  let device = "Desktop/Laptop";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("ipod")) {
    device = "Mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    device = "Tablet";
  } else if (ua.includes("android") && !ua.includes("mobile")) {
    device = "Tablet";
  }

  return { os, browser, device };
}

function detectOpenType(userAgent, headers) {
  if (!userAgent) {
    return { type: "unknown", isLikelyReal: false };
  }

  const userAgentLower = userAgent.toLowerCase();

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

  if (
    userAgentLower.includes("googleimageproxy") ||
    (headers["via"] && headers["via"].toLowerCase().includes("google"))
  ) {
    return { type: "gmail-proxy", isLikelyReal: true };
  }

  if (
    userAgentLower.includes("yahoo") &&
    userAgentLower.includes("slurp") === false
  ) {
    return { type: "yahoo-proxy", isLikelyReal: true };
  }

  if (
    userAgentLower.includes("mozilla") ||
    userAgentLower.includes("chrome") ||
    userAgentLower.includes("safari") ||
    userAgentLower.includes("firefox")
  ) {
    return { type: "browser", isLikelyReal: true };
  }

  if (
    userAgentLower.includes("mobile") ||
    userAgentLower.includes("iphone") ||
    userAgentLower.includes("android")
  ) {
    return { type: "mobile", isLikelyReal: true };
  }

  return { type: "unknown", isLikelyReal: true };
}

function isWithinGracePeriod(email, openTimestamp) {
  if (!email.sentAt) {
    return true;
  }

  const sentTime = new Date(email.sentAt).getTime();
  const openTime = new Date(openTimestamp).getTime();
  const diffSeconds = (openTime - sentTime) / 1000;
  return diffSeconds < GRACE_PERIOD_SECONDS;
}

async function validateApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  req.apiKey = apiKey;
  next();
}

app.post("/api/auth/generate-key", async (req, res) => {
  try {
    const apiKey = generateApiKey();

    const user = new User({
      apiKey,
      createdAt: new Date().toISOString(),
      emails: [],
    });

    await user.save();

    res.json({ apiKey });
  } catch (error) {
    console.error("Error generating API key:", error);
    res.status(500).json({ error: "Failed to generate API key" });
  }
});

app.get("/track/:id", async (req, res) => {
  const trackId = req.params.id;
  const userAgent = req.headers["user-agent"] || "Unknown";

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
  const deviceInfo = parseUserAgent(userAgent);
  const openInfo = detectOpenType(userAgent, req.headers);

  try {
    const user = await User.findOne({ "emails.trackingId": trackId });

    if (user) {
      const email = user.emails.find((e) => e.trackingId === trackId);

      if (email) {
        const now = new Date().toISOString();
        const inGracePeriod = isWithinGracePeriod(email, now);

        const isSelfView = email.senderIp && ip === email.senderIp;

        const isGmailOpen =
          openInfo.type === "gmail-proxy" || openInfo.type === "yahoo-proxy";

        const shouldCount = isGmailOpen && !inGracePeriod && !isSelfView;

        if (shouldCount) {
          const openEvent = {
            timestamp: now,
            userAgent,
            ip,
            referer,
            openType: openInfo.type,
            isReal: openInfo.isLikelyReal,
            isSelfView: isSelfView,
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

          email.opens.push(openEvent);
          email.openCount = email.opens.length;
          email.lastOpened = openEvent.timestamp;

          await user.save();

          console.log(
            `✅ Open counted for email "${email.subject}" from ${openInfo.type}`
          );
        } else {
          console.log(
            `⏭️ Open ignored for email "${email.subject}" - Type: ${openInfo.type}, Grace: ${inGracePeriod}, Self: ${isSelfView}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error tracking open:", error);
  }

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

app.post("/api/emails", validateApiKey, async (req, res) => {
  try {
    const { subject, recipient } = req.body;

    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    let user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      user = new User({
        apiKey: req.apiKey,
        createdAt: new Date().toISOString(),
        emails: [],
      });
    }

    const senderIp = (
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "Unknown"
    )
      .split(",")[0]
      .trim()
      .replace("::ffff:", "");

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
      senderIp: senderIp,
      createdAt: new Date().toISOString(),
      sentAt: null,
      opens: [],
      openCount: 0,
      lastOpened: null,
    };

    user.emails.unshift(newEmail);
    await user.save();

    res.json(newEmail);
  } catch (error) {
    console.error("Error creating email:", error);
    res.status(500).json({ error: "Failed to create tracked email" });
  }
});

app.post("/api/emails/:id/mark-sent", validateApiKey, async (req, res) => {
  try {
    const user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      return res.status(404).json({ error: "Email not found" });
    }

    const email = user.emails.find((e) => e.id === req.params.id);

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    email.sentAt = new Date().toISOString();
    await user.save();

    res.json({ message: "Email marked as sent", sentAt: email.sentAt });
  } catch (error) {
    console.error("Error marking email as sent:", error);
    res.status(500).json({ error: "Failed to mark email as sent" });
  }
});

app.get("/api/emails", validateApiKey, async (req, res) => {
  try {
    const user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      return res.json([]);
    }

    const sortedEmails = user.emails.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(sortedEmails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

app.get("/api/emails/:id", validateApiKey, async (req, res) => {
  try {
    const user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      return res.status(404).json({ error: "Email not found" });
    }

    const email = user.emails.find((e) => e.id === req.params.id);

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    res.json(email);
  } catch (error) {
    console.error("Error fetching email:", error);
    res.status(500).json({ error: "Failed to fetch email" });
  }
});

app.delete("/api/emails/:id", validateApiKey, async (req, res) => {
  try {
    const user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      return res.status(404).json({ error: "Email not found" });
    }

    const emailIndex = user.emails.findIndex((e) => e.id === req.params.id);

    if (emailIndex === -1) {
      return res.status(404).json({ error: "Email not found" });
    }

    user.emails.splice(emailIndex, 1);
    await user.save();

    res.json({ message: "Email deleted successfully" });
  } catch (error) {
    console.error("Error deleting email:", error);
    res.status(500).json({ error: "Failed to delete email" });
  }
});

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Email tracker server running on port ${PORT}`);
  });
}

startServer();
