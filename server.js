const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/email-tracker";

const GRACE_PERIOD_SECONDS = parsePositiveInt(
  process.env.GRACE_PERIOD_SECONDS,
  10
);
const SELF_OPEN_SUPPRESSION_SECONDS = parsePositiveInt(
  process.env.SELF_OPEN_SUPPRESSION_SECONDS,
  45
);
const SELF_VIEW_WINDOW_SECONDS = parsePositiveInt(
  process.env.SELF_VIEW_WINDOW_SECONDS,
  5
);
const DEDUP_WINDOW_SECONDS = parsePositiveInt(
  process.env.DEDUP_WINDOW_SECONDS,
  60
);
// Safety net: if an extension email's "sent" signal is never received (e.g. the
// user sent with a keyboard shortcut and the listener missed it), stop holding
// every open in the grace period forever. After this many seconds from creation
// we treat the email as sent so genuine opens start counting.
const AUTO_SENT_FALLBACK_SECONDS = parsePositiveInt(
  process.env.AUTO_SENT_FALLBACK_SECONDS,
  1800
);
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  ""
).replace(/\/+$/, "");
const MANUAL_SOURCE = "manual";
const EXTENSION_SOURCE = "gmail-extension";

app.set("trust proxy", 1);
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
  source: { type: String, default: MANUAL_SOURCE },
  createdAt: String,
  sentAt: String,
  selfOpenSuppressedUntil: String,
  selfViewReports: [String],
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
      isDuplicate: Boolean,
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
  ignoredOpenCount: { type: Number, default: 0 },
  lastIgnoredOpen: String,
  lastIgnoredOpenType: String,
  lastIgnoredReason: String,
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

function generateId() {
  return crypto.randomUUID();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeIp(value) {
  if (!value) {
    return "Unknown";
  }

  const ip = String(value).split(",")[0].trim().replace(/^::ffff:/, "");
  return ip || "Unknown";
}

function getClientIp(req) {
  return normalizeIp(
    req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "Unknown"
  );
}

function getPublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL;
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto
    ? String(forwardedProto).split(",")[0].trim()
    : req.protocol;

  return `${protocol}://${req.get("host")}`.replace(/\/+$/, "");
}

function readStringField(value, options = {}) {
  const { required = false, defaultValue = "", maxLength = 500 } = options;

  if (value === undefined || value === null || value === "") {
    if (required) {
      return { error: "Required field is missing" };
    }
    return { value: defaultValue };
  }

  if (typeof value !== "string") {
    return { error: "Field must be a string" };
  }

  const trimmed = value.trim();
  if (!trimmed && required) {
    return { error: "Required field is missing" };
  }

  return { value: trimmed.slice(0, maxLength) || defaultValue };
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
  const openTime = Date.parse(openTimestamp);
  if (!Number.isFinite(openTime)) {
    return true;
  }

  if (email.sentAt) {
    const sentTime = Date.parse(email.sentAt);
    if (!Number.isFinite(sentTime)) {
      return true;
    }
    return (openTime - sentTime) / 1000 < GRACE_PERIOD_SECONDS;
  }

  // No explicit "sent" signal yet. Keep suppressing compose/self opens until the
  // fallback window elapses, then assume the email was sent so a missed
  // send-signal can't mute genuine opens forever.
  const createdTime = Date.parse(email.createdAt);
  if (!Number.isFinite(createdTime)) {
    return true;
  }
  return (openTime - createdTime) / 1000 < AUTO_SENT_FALLBACK_SECONDS;
}

function isSupportedProxyOpen(openInfo) {
  return ["gmail-proxy", "yahoo-proxy"].includes(openInfo.type);
}

function isSelfOpenSuppressed(email, openTimestamp) {
  if (!email.selfOpenSuppressedUntil) {
    return false;
  }

  const suppressedUntil = Date.parse(email.selfOpenSuppressedUntil);
  const openTime = Date.parse(openTimestamp);

  return (
    Number.isFinite(suppressedUntil) &&
    Number.isFinite(openTime) &&
    openTime <= suppressedUntil
  );
}

function isNearSelfViewReport(email, timestamp) {
  if (!email.selfViewReports || email.selfViewReports.length === 0) {
    return false;
  }

  const openTime = Date.parse(timestamp);
  if (!Number.isFinite(openTime)) {
    return false;
  }

  return email.selfViewReports.some((reportTs) => {
    const reportTime = Date.parse(reportTs);
    return (
      Number.isFinite(reportTime) &&
      Math.abs(openTime - reportTime) <= SELF_VIEW_WINDOW_SECONDS * 1000
    );
  });
}

function isDuplicateOpen(email, openType, timestamp) {
  if (!email.opens || email.opens.length === 0) {
    return false;
  }

  const openTime = Date.parse(timestamp);
  if (!Number.isFinite(openTime)) {
    return false;
  }

  const windowMs = DEDUP_WINDOW_SECONDS * 1000;

  return email.opens.some((existing) => {
    const existingTime = Date.parse(existing.timestamp);
    return (
      Number.isFinite(existingTime) &&
      existing.openType === openType &&
      Math.abs(openTime - existingTime) < windowMs
    );
  });
}

function getOpenDecision(email, openInfo, ip, openTimestamp) {
  const inGracePeriod = isWithinGracePeriod(email, openTimestamp);
  const isSenderIp = Boolean(
    email.senderIp && normalizeIp(ip) === normalizeIp(email.senderIp)
  );
  const isSupportedProxy = isSupportedProxyOpen(openInfo);
  const isSelfSuppressed = isSelfOpenSuppressed(email, openTimestamp);
  const isSelfReported = isNearSelfViewReport(email, openTimestamp);
  const isDuplicate = isDuplicateOpen(email, openInfo.type, openTimestamp);

  const reasons = [];
  if (!isSupportedProxy) reasons.push("unsupported-open-type");
  if (!openInfo.isLikelyReal) reasons.push("not-likely-real");
  if (inGracePeriod) reasons.push("grace-period");
  if (isSenderIp) reasons.push("sender-ip");
  if (isSelfSuppressed) reasons.push("owner-suppression");
  if (isSelfReported) reasons.push("owner-report");
  if (isDuplicate) reasons.push("duplicate");

  return {
    shouldCount:
      isSupportedProxy &&
      openInfo.isLikelyReal &&
      !inGracePeriod &&
      !isSenderIp &&
      !isSelfSuppressed &&
      !isSelfReported &&
      !isDuplicate,
    inGracePeriod,
    isSelfView: isSenderIp || isSelfSuppressed || isSelfReported,
    isSelfSuppressed,
    isSelfReported,
    isSupportedProxy,
    isDuplicate,
    reasons,
  };
}

function buildTrackedEmailRecord({
  subject,
  recipient,
  senderIp,
  baseUrl,
  source = MANUAL_SOURCE,
  deferCountingUntilSent = false,
  now = new Date(),
}) {
  const createdAt = now.toISOString();
  const trackingId = generateId();
  const createdByExtension =
    source === EXTENSION_SOURCE || deferCountingUntilSent === true;

  return {
    id: generateId(),
    trackingId,
    trackingUrl: `${baseUrl}/track/${trackingId}`,
    subject,
    recipient: recipient || "Unknown",
    senderIp: senderIp || "Unknown",
    source: createdByExtension ? EXTENSION_SOURCE : MANUAL_SOURCE,
    createdAt,
    sentAt: createdByExtension ? null : createdAt,
    selfOpenSuppressedUntil: null,
    selfViewReports: [],
    opens: [],
    openCount: 0,
    lastOpened: null,
    ignoredOpenCount: 0,
    lastIgnoredOpen: null,
    lastIgnoredOpenType: null,
    lastIgnoredReason: null,
  };
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
    req.user = user;
    next();
  } catch (error) {
    console.error("Error validating API key:", error);
    res.status(500).json({ error: "Failed to validate API key" });
  }
}

function removeNearbyOpenEvents(email, timestamp, windowSeconds) {
  const targetMs = Date.parse(timestamp);
  if (!Number.isFinite(targetMs) || !email.opens) {
    return 0;
  }

  const windowMs = windowSeconds * 1000;
  const originalLength = email.opens.length;

  email.opens = email.opens.filter((open) => {
    const openTime = Date.parse(open.timestamp);
    return !Number.isFinite(openTime) || Math.abs(openTime - targetMs) > windowMs;
  });

  email.openCount = email.opens.length;
  email.lastOpened =
    email.opens.length > 0 ? email.opens[email.opens.length - 1].timestamp : null;

  return originalLength - email.opens.length;
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
  const ip = getClientIp(req);
  const referer = req.headers["referer"] || "Direct";
  const deviceInfo = parseUserAgent(userAgent);
  const openInfo = detectOpenType(userAgent, req.headers);

  try {
    const user = await User.findOne({ "emails.trackingId": trackId });

    if (user) {
      const email = user.emails.find((e) => e.trackingId === trackId);

      if (email) {
        const now = new Date().toISOString();
        const decision = getOpenDecision(email, openInfo, ip, now);

        if (decision.shouldCount) {
          const openEvent = {
            timestamp: now,
            userAgent,
            ip,
            referer,
            openType: openInfo.type,
            isReal: openInfo.isLikelyReal,
            isSelfView: decision.isSelfView,
            inGracePeriod: decision.inGracePeriod,
            isDuplicate: decision.isDuplicate,
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

          await User.updateOne(
            { _id: user._id, "emails.trackingId": trackId },
            {
              $push: { "emails.$.opens": openEvent },
              $inc: { "emails.$.openCount": 1 },
              $set: { "emails.$.lastOpened": openEvent.timestamp },
            }
          );

          console.log(
            `✅ Open counted for email "${email.subject}" from ${openInfo.type}`
          );
        } else {
          await User.updateOne(
            { _id: user._id, "emails.trackingId": trackId },
            {
              $inc: { "emails.$.ignoredOpenCount": 1 },
              $set: {
                "emails.$.lastIgnoredOpen": now,
                "emails.$.lastIgnoredOpenType": openInfo.type,
                "emails.$.lastIgnoredReason": decision.reasons.join(", "),
              },
            }
          );

          console.log(
            `⏭️ Open ignored for email "${email.subject}" - Type: ${
              openInfo.type
            }, Reasons: ${decision.reasons.join(", ")}`
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
    const body = req.body || {};
    const subjectField = readStringField(body.subject, {
      required: true,
      maxLength: 300,
    });
    const recipientField = readStringField(body.recipient, {
      defaultValue: "Unknown",
      maxLength: 320,
    });

    if (subjectField.error) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (recipientField.error) {
      return res.status(400).json({ error: "Recipient must be a string" });
    }

    const newEmail = buildTrackedEmailRecord({
      subject: subjectField.value,
      recipient: recipientField.value,
      senderIp: getClientIp(req),
      baseUrl: getPublicBaseUrl(req),
      source: body.source,
      deferCountingUntilSent: body.deferCountingUntilSent === true,
    });

    const user = req.user;
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
    const user = req.user;
    const email = user.emails.find((e) => e.id === req.params.id);

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    let removed = 0;
    if (!email.sentAt) {
      const now = new Date().toISOString();
      email.sentAt = now;
      removed = removeNearbyOpenEvents(email, now, GRACE_PERIOD_SECONDS);
      await user.save();
    }

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
  "/api/emails/:id/suppress-self-open",
  validateApiKey,
  async (req, res) => {
    try {
      const user = req.user;
      const email = user.emails.find((e) => e.id === req.params.id);

      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }

      const requestedSeconds = parsePositiveInt(
        (req.body || {}).seconds,
        SELF_OPEN_SUPPRESSION_SECONDS
      );
      const seconds = Math.min(requestedSeconds, 300);
      const suppressUntil = new Date(Date.now() + seconds * 1000);
      const existingUntil = Date.parse(email.selfOpenSuppressedUntil);

      if (
        !Number.isFinite(existingUntil) ||
        suppressUntil.getTime() > existingUntil
      ) {
        email.selfOpenSuppressedUntil = suppressUntil.toISOString();
        await user.save();
      }

      res.json({
        message: "Self-open suppression armed",
        suppressUntil: email.selfOpenSuppressedUntil,
      });
    } catch (error) {
      console.error("Error suppressing self-open:", error);
      res.status(500).json({ error: "Failed to suppress self-open" });
    }
  }
);

app.post(
  "/api/emails/:id/report-self-view",
  validateApiKey,
  async (req, res) => {
    try {
      const user = req.user;
      const email = user.emails.find((e) => e.id === req.params.id);

      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }

      const now = new Date().toISOString();
      const suppressUntil = new Date(
        Date.now() + SELF_OPEN_SUPPRESSION_SECONDS * 1000
      );

      if (!email.selfViewReports) {
        email.selfViewReports = [];
      }
      email.selfViewReports.push(now);
      email.selfOpenSuppressedUntil = suppressUntil.toISOString();

      const removed = removeNearbyOpenEvents(email, now, SELF_VIEW_WINDOW_SECONDS);
      await user.save();

      console.log(
        `🔕 Self-view reported for "${email.subject}" — removed ${removed} retroactive open(s)`
      );

      res.json({
        message: "Self-view reported",
        reportedAt: now,
        suppressUntil: email.selfOpenSuppressedUntil,
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
    const user = req.user;

    const sortedEmails = [...user.emails].sort(
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
    const user = req.user;
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
    const user = req.user;
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

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildTrackedEmailRecord,
  detectOpenType,
  getOpenDecision,
  getPublicBaseUrl,
  isDuplicateOpen,
  isNearSelfViewReport,
  isSelfOpenSuppressed,
  isSupportedProxyOpen,
  isWithinGracePeriod,
  normalizeIp,
  parseUserAgent,
  readStringField,
};
