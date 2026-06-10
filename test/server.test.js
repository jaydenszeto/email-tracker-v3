const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTrackedEmailRecord,
  detectOpenType,
  getOpenDecision,
  isWithinGracePeriod,
  normalizeIp,
  readStringField,
} = require("../server");

const gmailProxyOpen = { type: "gmail-proxy", isLikelyReal: true };
const browserOpen = { type: "browser", isLikelyReal: true };

test("manual dashboard links are active immediately", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const email = buildTrackedEmailRecord({
    subject: "Quarterly update",
    recipient: "person@example.com",
    senderIp: "203.0.113.10",
    baseUrl: "https://tracker.example.com",
    now,
  });

  assert.equal(email.source, "manual");
  assert.equal(email.sentAt, now.toISOString());
  assert.match(email.trackingUrl, /^https:\/\/tracker\.example\.com\/track\//);
});

test("extension-created emails stay inactive until marked sent", () => {
  const email = buildTrackedEmailRecord({
    subject: "Follow up",
    recipient: "person@example.com",
    senderIp: "203.0.113.10",
    baseUrl: "https://tracker.example.com",
    source: "gmail-extension",
    deferCountingUntilSent: true,
    now: new Date("2026-05-23T12:00:00.000Z"),
  });

  assert.equal(email.source, "gmail-extension");
  assert.equal(email.sentAt, null);
  assert.equal(isWithinGracePeriod(email, "2026-05-23T12:10:00.000Z"), true);
});

test("counts supported recipient proxy opens after grace period", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "198.51.100.20",
    "2026-05-23T12:00:15.000Z"
  );

  assert.equal(decision.shouldCount, true);
  assert.deepEqual(decision.reasons, []);
});

test("ignores opens during the grace period", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "198.51.100.20",
    "2026-05-23T12:00:05.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("grace-period"), true);
});

test("ignores direct sender IP opens", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "::ffff:203.0.113.10",
    "2026-05-23T12:01:00.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("sender-ip"), true);
});

test("ignores owner-suppressed Gmail proxy opens", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: "2026-05-23T12:02:00.000Z",
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "198.51.100.20",
    "2026-05-23T12:01:00.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("owner-suppression"), true);
});

test("ignores browser opens because the product counts reliable mail proxies", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    browserOpen,
    "198.51.100.20",
    "2026-05-23T12:01:00.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("unsupported-open-type"), true);
});

test("keeps extension emails suppressed before the auto-sent fallback window", () => {
  const email = {
    createdAt: "2026-05-23T12:00:00.000Z",
    sentAt: null,
  };

  // 10 minutes after creation, still inside the 30-minute fallback window.
  assert.equal(
    isWithinGracePeriod(email, "2026-05-23T12:10:00.000Z"),
    true
  );
});

test("auto-arms extension emails once the fallback window elapses", () => {
  const email = {
    createdAt: "2026-05-23T12:00:00.000Z",
    sentAt: null,
  };

  // 40 minutes after creation, past the 30-minute fallback — a missed
  // send-signal must not mute genuine opens forever.
  assert.equal(
    isWithinGracePeriod(email, "2026-05-23T12:40:00.000Z"),
    false
  );
});

test("counts an auto-armed proxy open when the send-signal was missed", () => {
  const email = {
    createdAt: "2026-05-23T12:00:00.000Z",
    sentAt: null,
    senderIp: "203.0.113.10",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "198.51.100.20",
    "2026-05-23T12:40:00.000Z"
  );

  assert.equal(decision.shouldCount, true);
  assert.deepEqual(decision.reasons, []);
});

test("still ignores compose-time opens before the fallback window", () => {
  const email = {
    createdAt: "2026-05-23T12:00:00.000Z",
    sentAt: null,
    senderIp: "203.0.113.10",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "198.51.100.20",
    "2026-05-23T12:05:00.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("grace-period"), true);
});

test("detects Gmail image proxy user agents", () => {
  const openType = detectOpenType(
    "Mozilla/5.0 (compatible; GoogleImageProxy)",
    {}
  );

  assert.deepEqual(openType, { type: "gmail-proxy", isLikelyReal: true });
});

test("normalizes forwarded IPv4-mapped addresses", () => {
  assert.equal(normalizeIp("::ffff:203.0.113.10"), "203.0.113.10");
  assert.equal(
    normalizeIp("198.51.100.20, 198.51.100.21"),
    "198.51.100.20"
  );
});

test("validates string inputs", () => {
  assert.deepEqual(
    readStringField("  hello  ", { required: true, maxLength: 3 }),
    { value: "hel" }
  );
  assert.equal(readStringField(42, { required: true }).error, "Field must be a string");
  assert.equal(readStringField("", { required: true }).error, "Required field is missing");
});
