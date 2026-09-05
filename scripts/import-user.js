#!/usr/bin/env node
/**
 * Import a user (API key + tracked emails) into MongoDB.
 *
 * Input: a JSON file shaped like { "apiKey": "...", "emails": [ ... ] } —
 * exactly what `GET /api/emails` returns, wrapped with the key. Used to move
 * data between deployments (e.g. Render → self-hosted) without losing history
 * or forcing everyone to generate a new key.
 *
 *   MONGODB_URI=mongodb://localhost:27017/email-tracker node scripts/import-user.js export.json
 *
 * Existing users with the same API key are merged: emails already present
 * (by id) are left untouched, new ones are added.
 */
const fs = require("fs");
const mongoose = require("mongoose");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/email-tracker";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: import-user.js <export.json>");
    process.exit(2);
  }

  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!payload.apiKey || !Array.isArray(payload.emails)) {
    console.error("export must be { apiKey, emails[] }");
    process.exit(2);
  }

  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.collection("users");

  const existing = await users.findOne({ apiKey: payload.apiKey });
  const strip = (e) => {
    const copy = { ...e };
    delete copy._id;
    if (Array.isArray(copy.opens)) {
      copy.opens = copy.opens.map(({ _id, ...open }) => open);
    }
    return copy;
  };

  if (!existing) {
    await users.insertOne({
      apiKey: payload.apiKey,
      createdAt: payload.createdAt || new Date().toISOString(),
      emails: payload.emails.map(strip),
      __v: 0,
    });
    console.log(`created user with ${payload.emails.length} email(s)`);
  } else {
    const have = new Set((existing.emails || []).map((e) => e.id));
    const fresh = payload.emails.filter((e) => !have.has(e.id)).map(strip);
    if (fresh.length > 0) {
      await users.updateOne(
        { _id: existing._id },
        { $push: { emails: { $each: fresh, $position: 0 } } }
      );
    }
    console.log(
      `merged: ${fresh.length} new email(s), ${have.size} already present`
    );
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
