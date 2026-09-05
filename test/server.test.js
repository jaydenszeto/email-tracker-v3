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

test("sender-ip flags direct browser loads from the sender's public IP", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    browserOpen,
    "::ffff:203.0.113.10",
    "2026-05-23T12:01:00.000Z"
  );

  assert.equal(decision.shouldCount, false);
  assert.equal(decision.reasons.includes("sender-ip"), true);
});

test("sender-ip never applies to Gmail/Yahoo proxy opens (they come from Google's IPs)", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
  };

  const decision = getOpenDecision(
    email,
    gmailProxyOpen,
    "203.0.113.10",
    "2026-05-23T12:01:00.000Z"
  );

  assert.equal(decision.shouldCount, true);
  assert.deepEqual(decision.reasons, []);
});

test("sender-ip is inert when a reverse proxy hides the client (loopback/private)", () => {
  const { isSenderIpOpen, isPublicIp } = require("../server");

  // Regression: behind Xray→Caddy on loopback every request looked like
  // 127.0.0.1, so senderIp === every open's IP and everything was filtered.
  const email = { senderIp: "127.0.0.1" };
  assert.equal(isSenderIpOpen(email, browserOpen, "127.0.0.1"), false);
  assert.equal(isSenderIpOpen({ senderIp: "10.0.0.5" }, browserOpen, "10.0.0.5"), false);
  assert.equal(isSenderIpOpen({ senderIp: "Unknown" }, browserOpen, "Unknown"), false);

  assert.equal(isPublicIp("203.0.113.10"), true);
  assert.equal(isPublicIp("::ffff:203.0.113.10"), true);
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("172.20.1.1"), false);
  assert.equal(isPublicIp("fd00::1"), false);
  assert.equal(isPublicIp("2001:db8::1"), true);
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

test("real Gmail proxy user agent (with 'via ggpht.com') is a gmail-proxy open", () => {
  const openType = detectOpenType(
    "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
    {}
  );
  assert.deepEqual(openType, { type: "gmail-proxy", isLikelyReal: true });
});

test("Yahoo mail proxy is a supported proxy open", () => {
  const openType = detectOpenType(
    "YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html",
    {}
  );
  assert.deepEqual(openType, { type: "yahoo-proxy", isLikelyReal: true });
});

test("duplicate proxy fetches inside the dedup window are ignored", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
    opens: [{ timestamp: "2026-05-23T12:05:00.000Z", openType: "gmail-proxy" }],
  };

  const dup = getOpenDecision(email, gmailProxyOpen, "198.51.100.20", "2026-05-23T12:05:30.000Z");
  assert.equal(dup.shouldCount, false);
  assert.equal(dup.reasons.includes("duplicate"), true);

  const later = getOpenDecision(email, gmailProxyOpen, "198.51.100.20", "2026-05-23T12:06:30.000Z");
  assert.equal(later.shouldCount, true);
});

test("owner self-view report suppresses opens within the report window", () => {
  const email = {
    senderIp: "203.0.113.10",
    sentAt: "2026-05-23T12:00:00.000Z",
    selfOpenSuppressedUntil: null,
    selfViewReports: ["2026-05-23T12:10:00.000Z"],
  };

  // 10 seconds before the report (proxy fetched before the extension's
  // report arrived) — inside the 15s window.
  const before = getOpenDecision(email, gmailProxyOpen, "198.51.100.20", "2026-05-23T12:09:50.000Z");
  assert.equal(before.shouldCount, false);
  assert.equal(before.reasons.includes("owner-report"), true);

  // A minute later is a distinct open again.
  const after = getOpenDecision(email, gmailProxyOpen, "198.51.100.20", "2026-05-23T12:11:00.000Z");
  assert.equal(after.shouldCount, true);
});

test("removeNearbyOpenEvents deletes counted opens around a self-view and fixes counters", () => {
  const { removeNearbyOpenEvents } = require("../server");
  const email = {
    opens: [
      { timestamp: "2026-05-23T12:00:00.000Z", openType: "gmail-proxy" },
      { timestamp: "2026-05-23T12:09:52.000Z", openType: "gmail-proxy" },
      { timestamp: "2026-05-23T12:30:00.000Z", openType: "gmail-proxy" },
    ],
    openCount: 3,
    lastOpened: "2026-05-23T12:30:00.000Z",
  };

  const removed = removeNearbyOpenEvents(email, "2026-05-23T12:10:00.000Z", 15);
  assert.equal(removed, 1);
  assert.equal(email.openCount, 2);
  assert.equal(email.lastOpened, "2026-05-23T12:30:00.000Z");

  const removedAll = removeNearbyOpenEvents(email, "2026-05-23T12:30:00.000Z", 15);
  assert.equal(removedAll, 1);
  assert.equal(email.openCount, 1);
  assert.equal(email.lastOpened, "2026-05-23T12:00:00.000Z");
});

test("/track redirects to the current server when TRACK_REDIRECT_BASE is set (legacy Render pixels)", async () => {
  const { spawn } = require("node:child_process");
  const path = require("node:path");

  // Boot a throwaway copy of the app with the redirect enabled. It never
  // touches the database for /track when redirecting.
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
      const { app } = require(${JSON.stringify(path.join(__dirname, "..", "server.js"))});
      const server = app.listen(0, () => {
        process.stdout.write(String(server.address().port) + "\\n");
      });
      `,
    ],
    { env: { ...process.env, TRACK_REDIRECT_BASE: "https://tracker.example.com/app/" } }
  );

  const port = await new Promise((resolve, reject) => {
    child.stdout.once("data", (d) => resolve(Number(String(d).trim())));
    child.stderr.once("data", (d) => reject(new Error(String(d))));
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/track/abc-123`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://tracker.example.com/app/track/abc-123");
    assert.match(res.headers.get("cache-control"), /no-store/);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 503); // no DB in this throwaway process
    assert.equal((await health.json()).trackRedirectBase, "https://tracker.example.com/app");
  } finally {
    child.kill();
  }
});
