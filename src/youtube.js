const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { TMP_DIR, BIN_DIR } = require("./config");

function getVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
  } catch {}
  return null;
}

async function fetchPipedMetadata(url) {
  const id = getVideoId(url);
  if (!id) throw new Error("Invalid YouTube URL");
  const api = `https://pipedapi.kavin.rocks/streams/${id}`;
  const r = await fetch(api);
  if (!r.ok) throw new Error("Piped metadata failed");
  return r.json();
}

async function downloadFromPiped(url, outPath) {
  const meta = await fetchPipedMetadata(url);
  const audioStreams = (meta.audioStreams || []).filter(s=>s.url);
  if (!audioStreams.length) throw new Error("No audio streams from Piped");
  // pick best bitrate
  audioStreams.sort((a,b)=>(b.bitrate||0)-(a.bitrate||0));
  const best = audioStreams[0].url;

  const r = await fetch(best);
  if (!r.ok) throw new Error("Piped audio download failed");
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { title: meta.title || "youtube_audio" };
}

function findYtDlp() {
  const candidates = [
    path.join(BIN_DIR, "yt-dlp.exe"),
    path.join(BIN_DIR, "yt-dlp")
  ];
  return candidates.find(p => fs.existsSync(p));
}

async function downloadWithYtDlp(url, outPath) {
  const bin = findYtDlp();
  if (!bin) throw new Error("yt-dlp not found for fallback");
  return new Promise((resolve, reject) => {
    const args = ["-f", "bestaudio", "-o", outPath, url];
    const p = spawn(bin, args, { windowsHide:true });
    let err = "";
    p.stderr.on("data", d => err += d.toString());
    p.on("close", code => {
      if (code === 0) resolve({ title: "youtube_audio" });
      else reject(new Error("yt-dlp failed: " + err));
    });
  });
}

async function downloadYoutubeAudio(url) {
  fs.mkdirSync(TMP_DIR, { recursive:true });
  const tmpFile = path.join(TMP_DIR, `yt_${Date.now()}.webm`);
  try {
    const info = await downloadFromPiped(url, tmpFile);
    return { tmpFile, title: info.title, via: "piped" };
  } catch (e) {
    // fallback
    const info = await downloadWithYtDlp(url, tmpFile);
    return { tmpFile, title: info.title, via: "yt-dlp" };
  }
}

module.exports = { getVideoId, fetchPipedMetadata, downloadYoutubeAudio };
