// src/tmpCleaner.js
const fs = require("fs");
const path = require("path");

function cleanDir(dir, maxAgeMs, now = Date.now()) {
  fs.mkdirSync(dir, { recursive: true });
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      const stat = fs.statSync(full);
      const age = now - stat.mtimeMs;
      if (age < maxAgeMs) continue;

      if (entry.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        fs.unlinkSync(full);
      }
      removed++;
    } catch (err) {
      console.warn("[TMP] Failed to remove", full, err.message);
    }
  }

  if (removed > 0) {
    console.log(`[TMP] Cleaned ${removed} item(s) older than ${Math.round(maxAgeMs / 3600000)}h in ${dir}`);
  }
}

module.exports = { cleanDir };
