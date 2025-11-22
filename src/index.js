require("dotenv").config();

// Ensure new Discord voice encryption modes are available (XChaCha/AES via libsodium)
const sodium = require("libsodium-wrappers");

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

async function main() {
  // Wait for libsodium to finish loading the WASM bindings so @discordjs/voice can detect it
  await sodium.ready;
  console.log("[VOICE] libsodium ready");

  // Force ffmpeg for prism-media on Windows
  process.env.FFMPEG_PATH = require("ffmpeg-static");
  console.log("[FFMPEG]", process.env.FFMPEG_PATH);

  const {
    PORT,
    DEFAULT_BOT_CHANNEL_ID,
    TMP_DIR,
    TMP_CLEAN_INTERVAL_MS,
    TMP_MAX_FILE_AGE_MS
  } = require("./config");
  const { scanSounds, watchSounds } = require("./sounds");
  const { createBot } = require("./bot");
  const { createWebServer } = require("./web");
  const { startTunnel, onTunnelUrl, getCurrentTunnel } = require("./tunnel");
  const { cleanDir: cleanTmpDir } = require("./tmpCleaner");

  scanSounds();
  let onSoundsChangeCb = () => {};
  watchSounds(() => onSoundsChangeCb());

  const { client, pendingCodesRef } = createBot();
  const botStartTs = Date.now();
  // initial tmp cleanup and schedule every TMP_CLEAN_INTERVAL_MS
  cleanTmpDir(TMP_DIR, TMP_MAX_FILE_AGE_MS);
  setInterval(() => cleanTmpDir(TMP_DIR, TMP_MAX_FILE_AGE_MS), TMP_CLEAN_INTERVAL_MS);

  let tunnelInfo = getCurrentTunnel();
  let lastTunnelMessageId = null;
  const postTunnel = async (url) => {
    if (!DEFAULT_BOT_CHANNEL_ID || !url) return;
    const channel = client.channels.cache.get(DEFAULT_BOT_CHANNEL_ID);
    if (!channel) {
      console.warn("[TUNNEL] default bot channel not found:", DEFAULT_BOT_CHANNEL_ID);
      return;
    }
    try {
      if (lastTunnelMessageId) {
        const prev = await channel.messages.fetch(lastTunnelMessageId).catch(() => null);
        if (prev?.deletable) await prev.delete().catch(() => {});
      }
      const msg = await channel.send(`🌐 Web UI is online:\n${url}`);
      lastTunnelMessageId = msg?.id || null;
    } catch (err) {
      console.warn("[TUNNEL] failed to send tunnel URL:", err.message);
    }
  };

  onTunnelUrl(info => {
    tunnelInfo = info;
    if (client.isReady()) {
      postTunnel(info.url).catch(err => console.warn("[TUNNEL] postTunnel failed:", err?.message));
    }
  });

  startTunnel(`http://localhost:${PORT}`);

  client.once("ready", () => {
    // Only post a tunnel URL if it was generated after this process started
    if (tunnelInfo?.url && tunnelInfo?.timestamp >= botStartTs) {
      postTunnel(tunnelInfo.url).catch(err => console.warn("[TUNNEL] postTunnel failed:", err?.message));
    }
  });

  const web = createWebServer(client, PORT, (cb)=>{ onSoundsChangeCb = cb; });
  pendingCodesRef.map = web.pendingCodes;

  await client.login(TOKEN);
}

main().catch(err => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
