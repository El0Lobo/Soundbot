// src/config.js
const path = require("path");

const ROOT = path.join(__dirname, "..");

module.exports = {
  ROOT,

  // paths
  SOUNDS_DIR: path.join(ROOT, "sounds"),
  DATA_DIR: path.join(ROOT, "data"),
  META_FILE: path.join(ROOT, "data", "sounds.json"),
  GUILD_FILE: path.join(ROOT, "data", "guilds.json"),
  USERS_FILE: path.join(ROOT, "data", "users.json"),
  TUNNEL_FILE: path.join(ROOT, "data", "tunnel.json"),
  TMP_DIR: path.join(ROOT, "tmp"),
  BIN_DIR: path.join(ROOT, "bin"),

  // server
  PORT: Number(process.env.PORT || 3000),
  TMP_CLEAN_INTERVAL_MS: Number(process.env.TMP_CLEAN_INTERVAL_HOURS || "5") * 60 * 60 * 1000,
  TMP_MAX_FILE_AGE_MS: Number(process.env.TMP_MAX_FILE_AGE_HOURS || "5") * 60 * 60 * 1000,

  // discord creds
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  CLIENT_ID: process.env.CLIENT_ID || "",
  DEFAULT_GUILD_ID: process.env.DEFAULT_GUILD_ID || "",
  DEFAULT_BOT_CHANNEL_ID: (process.env.DEFAULT_BOT_CHANNEL_ID || "").trim(),

  // roles/admin
  ADMIN_USER_IDS: (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),

  UPLOAD_ALLOWED_ROLE: (process.env.UPLOAD_ALLOWED_ROLE || "").trim(),

  // ===== LOOP CHANNEL FEATURE =====
  // Voice channel name to watch. Exact match (case-insensitive).
  LOOP_CHANNEL_NAME: (process.env.LOOP_CHANNEL_NAME || "Narnia").trim(),

  // Sound id (from sounds.json) to loop in that channel.
  LOOP_SOUND_ID: (process.env.LOOP_SOUND_ID || "airhorn").trim(),

  // Volume for loop playback (0.0–1.0)
  LOOP_VOLUME: Number(process.env.LOOP_VOLUME || "0.5"),

  // voice idle timeout (destroy connection after this many ms of inactivity)
  IDLE_VC_TIMEOUT_MS: Number(process.env.IDLE_VC_TIMEOUT_MS || "180000"),
};
