const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/email-tracker";

const GRACE_PERIOD_SECONDS = 30;
const SELF_VIEW_WINDOW_SECONDS = 5;
const DEDUP_WINDOW_SECONDS = 60;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const emailSchema = new mongoose.Schema({
  id: String,
  trackingId: String,
  trackingUrl: String,
  subject: String,
  recipient: String,
  createdAt: String,
  sentAt: String,
  opens: [
    {
      timestamp: String,
      userAgent: String,
      referer: String,
      openType: String,
      isReal: Boolean,
    },
  ],
  openCount: Number,
  lastOpened: String,
  selfViewReports: [String],
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
  // If the email hasn't been sent yet, ALL opens are in the grace period
  // (these are just the email client/composer loading the pixel)
  if (!email.sentAt) {
    return true;
  }

  const sentTime = new Date(email.sentAt).getTime();
  const openTime = new Date(openTimestamp).getTime();
  const diffSeconds = (openTime - sentTime) / 1000;
  return diffSeconds < GRACE_PERIOD_SECONDS;
}

function isDuplicateOpen(email, openType, timestamp) {
  if (!email.opens || email.opens.length === 0) {
    return false;
  }

  const openTime = new Date(timestamp).getTime();
  const windowMs = DEDUP_WINDOW_SECONDS * 1000;

  return email.opens.some((existing) => {
    const existingTime = new Date(existing.timestamp).getTime();
    return (
      existing.openType === openType &&
      Math.abs(openTime - existingTime) < windowMs
    );
  });
}

function isNearSelfViewReport(email, timestamp) {
  if (!email.selfViewReports || email.selfViewReports.length === 0) {
    return false;
  }
  const openTime = new Date(timestamp).getTime();
  return email.selfViewReports.some((reportTs) => {
    const reportTime = new Date(reportTs).getTime();
    return Math.abs(openTime - reportTime) <= SELF_VIEW_WINDOW_SECONDS * 1000;
  });
}

async function validateApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  try {
    const user = await User.findOne({ apiKey });
    if (!user) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    req.apiKey = apiKey;
    next();
  } catch (error) {
    console.error("Error validating API key:", error);
    res.status(500).json({ error: "Authentication error" });
  }
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
  const referer = req.headers["referer"] || "Direct";
  const openInfo = detectOpenType(userAgent, req.headers);

  try {
    const user = await User.findOne({ "emails.trackingId": trackId });

    if (user) {
      const email = user.emails.find((e) => e.trackingId === trackId);

      if (email) {
        const now = new Date().toISOString();
        const inGracePeriod = isWithinGracePeriod(email, now);
        const isSelfView = isNearSelfViewReport(email, now);
        const isDupe = isDuplicateOpen(email, openInfo.type, now);

        const shouldCount =
          openInfo.isLikelyReal && !inGracePeriod && !isSelfView && !isDupe;

        if (shouldCount) {
          const openEvent = {
            timestamp: now,
            userAgent,
            referer,
            openType: openInfo.type,
            isReal: openInfo.isLikelyReal,
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
            `⏭️ Open ignored for email "${email.subject}" - Type: ${openInfo.type}, Grace: ${inGracePeriod}, Self: ${isSelfView}, Dupe: ${isDupe}`
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

    const user = await User.findOne({ apiKey: req.apiKey });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
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
      createdAt: new Date().toISOString(),
      sentAt: null,
      opens: [],
      openCount: 0,
      lastOpened: null,
      selfViewReports: [],
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

    const now = new Date().toISOString();
    email.sentAt = now;

    // Retroactively remove any opens that occurred before the email was sent
    // (these are from the composer/preview loading the tracking pixel)
    const sentMs = new Date(now).getTime();
    const graceMs = GRACE_PERIOD_SECONDS * 1000;
    const originalCount = email.opens.length;

    email.opens = email.opens.filter((open) => {
      const openTime = new Date(open.timestamp).getTime();
      return openTime - sentMs >= graceMs;
    });

    const removed = originalCount - email.opens.length;
    email.openCount = email.opens.length;
    email.lastOpened =
      email.opens.length > 0
        ? email.opens[email.opens.length - 1].timestamp
        : null;

    await user.save();

    console.log(
      `📤 Email "${email.subject}" marked as sent — removed ${removed} pre-send open(s)`
    );

    res.json({
      message: "Email marked as sent",
      sentAt: email.sentAt,
      removedPreSendOpens: removed,
    });
  } catch (error) {
    console.error("Error marking email as sent:", error);
    res.status(500).json({ error: "Failed to mark email as sent" });
  }
});

app.post(
  "/api/emails/:id/report-self-view",
  validateApiKey,
  async (req, res) => {
    try {
      const user = await User.findOne({ apiKey: req.apiKey });

      if (!user) {
        return res.status(404).json({ error: "Email not found" });
      }

      const email = user.emails.find((e) => e.id === req.params.id);

      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }

      const now = new Date().toISOString();

      if (!email.selfViewReports) {
        email.selfViewReports = [];
      }
      email.selfViewReports.push(now);

      const nowMs = new Date(now).getTime();
      const windowMs = SELF_VIEW_WINDOW_SECONDS * 1000;
      const originalLength = email.opens.length;

      email.opens = email.opens.filter((open) => {
        const openTime = new Date(open.timestamp).getTime();
        return Math.abs(openTime - nowMs) > windowMs;
      });

      const removed = originalLength - email.opens.length;

      email.openCount = email.opens.length;
      email.lastOpened =
        email.opens.length > 0
          ? email.opens[email.opens.length - 1].timestamp
          : null;

      await user.save();

      console.log(
        `🔕 Self-view reported for "${email.subject}" — removed ${removed} retroactive open(s)`
      );

      res.json({
        message: "Self-view reported",
        reportedAt: now,
        removedOpens: removed,
      });
    } catch (error) {
      console.error("Error reporting self-view:", error);
      res.status(500).json({ error: "Failed to report self-view" });
    }
  }
);

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
