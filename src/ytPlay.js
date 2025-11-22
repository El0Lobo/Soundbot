// src/ytPlay.js
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { TMP_DIR, BIN_DIR } = require("./config");
const { ensureState, nudgeQueue } = require("./audioManager");
const { convertToMp3 } = require("./ffmpeg");
const {
  createAudioResource,
  demuxProbe,
  entersState,
  VoiceConnectionStatus
} = require("@discordjs/voice");

function findYtDlp() {
  const candidates = [
    path.join(BIN_DIR, "yt-dlp.exe"),
    path.join(BIN_DIR, "yt-dlp")
  ];
  return candidates.find(p => fs.existsSync(p));
}

function downloadWithYtDlp(url, outPathNoExt) {
  const bin = findYtDlp();
  if (!bin) throw new Error("yt-dlp not found. Put it into /bin.");

  return new Promise((resolve, reject) => {
    const args = [
      "--no-playlist",                       // ✅ IMPORTANT: never follow playlists/mixes
      "--extractor-args", "youtube:player_client=default", // ✅ avoids SABR/JS runtime traps
      "-f", "bestaudio",
      "-o", outPathNoExt + ".%(ext)s",
      url
    ];

    console.log("[YT-DLP]", bin, args.join(" "));

    const p = spawn(bin, args, { windowsHide: true });

    p.stdout.on("data", d => console.log("[YT-DLP OUT]", d.toString()));
    p.stderr.on("data", d => console.log("[YT-DLP ERR]", d.toString()));

    p.on("close", code => {
      console.log("[YT-DLP EXIT]", code);
      if (code === 0) resolve();
      else reject(new Error("yt-dlp failed"));
    });
  });
}

async function playYoutubeOnce({ guild, voiceChannel, url, volume = 0.5 }) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const base = path.join(TMP_DIR, `ytplay_${Date.now()}`);
  let downloadedFile = null;
  let mp3File = null;
  let cleanupOnError = [];

  try {
    await downloadWithYtDlp(url, base);

    // find produced file
    const dir = path.dirname(base);
    const prefix = path.basename(base);
    const match = fs.readdirSync(dir).find(f => f.startsWith(prefix + "."));
    if (!match) throw new Error("yt-dlp produced no file.");
    downloadedFile = path.join(dir, match);
    cleanupOnError.push(downloadedFile);

    // convert to mp3
    mp3File = base + ".mp3";
    await convertToMp3(downloadedFile, mp3File);
    cleanupOnError.push(mp3File);

    // enqueue into the normal state queue so multiple YouTube plays queue up
    const state = ensureState(guild, voiceChannel);
    const item = {
      filePath: mp3File,
      volume,
      cleanupPaths: [downloadedFile, mp3File],
    };

    state.queue.push(item);
    if (!state.playing) await entersState(state.connection, VoiceConnectionStatus.Ready, 20_000);
    nudgeQueue(guild.id, voiceChannel.id);

    // once enqueued, prevent immediate cleanup; handled after playback or stop/skip
    cleanupOnError = [];

    await entersState(state.connection, VoiceConnectionStatus.Ready, 20_000);

  } finally {
    for (const p of cleanupOnError) {
      if (p) fs.unlink(p, () => {});
    }
  }
}

module.exports = { playYoutubeOnce };
