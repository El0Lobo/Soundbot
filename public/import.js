import { ensureSession } from "./auth.js";

await ensureSession();

const ytUrl = document.getElementById("ytUrl");
const loadBtn = document.getElementById("loadBtn");
const metaBox = document.getElementById("meta");
const status = document.getElementById("status");
const embedBox = document.getElementById("ytEmbed");

const startSec = document.getElementById("startSec");
const endSec = document.getElementById("endSec");
const playSelection = document.getElementById("playSelection");
const saveForm = document.getElementById("saveForm");

let wave = null;
let audioEl = new Audio();
let meta = null;

loadBtn.onclick = async () => {
  const sessionId = localStorage.getItem("sessionId");
  if (!sessionId) return alert("Link Discord first.");
  if (!ytUrl.value.trim()) return;

  metaBox.textContent = "Fetching metadata...";
  embedBox.innerHTML = "";
  console.log("[YT METADATA] request", ytUrl.value.trim());
  const r = await fetch(`/api/youtube/metadata?url=${encodeURIComponent(ytUrl.value.trim())}`, {
    headers: { "X-Session-Id": sessionId }
  });
  const j = await r.json();
  if (!r.ok) {
    metaBox.textContent = j.error || "Failed";
    return;
  }
  meta = j.meta;
  const dur = meta.duration ? Math.round(meta.duration) : null;
  metaBox.textContent = `${meta.title}${dur ? " • " + dur + "s" : ""}${j.warning ? " (" + j.warning + ")" : ""}`;

  const setDefaultSelection = () => {
    const d = meta.duration || 30;
    startSec.value = "0";
    endSec.value = d.toFixed(1);
  };

  // Try to use the best piped audio URL for preview
  const aud = (meta.audioStreams || []).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0];
  if (!aud || !aud.url) {
    metaBox.textContent += " (No preview stream. Import still works.)";
    if (meta.embedUrl) {
      embedBox.innerHTML = `<iframe src="${meta.embedUrl}" title="YouTube preview" allowfullscreen loading="lazy"></iframe>`;
    }
    setDefaultSelection();
    return;
  }

  audioEl.src = aud.url;
  audioEl.crossOrigin = "anonymous";

  if (wave) wave.destroy();
  wave = WaveSurfer.create({
    container: "#wave",
    waveColor: "#666",
    progressColor: "#fff",
    height: 96
  });
  wave.load(aud.url);
  wave.on("ready", () => {
    const d = wave.getDuration();
    startSec.value = "0";
    endSec.value = d.toFixed(1);
  });
};

playSelection.onclick = () => {
  if (!wave) return;
  const s = Number(startSec.value);
  const e = Number(endSec.value);
  audioEl.currentTime = s;
  audioEl.play();
  const stopAt = () => {
    if (audioEl.currentTime >= e) {
      audioEl.pause();
      audioEl.removeEventListener("timeupdate", stopAt);
    }
  };
  audioEl.addEventListener("timeupdate", stopAt);
};

saveForm.onsubmit = async (e) => {
  e.preventDefault();
  const sessionId = localStorage.getItem("sessionId");
  if (!sessionId) return alert("Link Discord first.");
  if (!ytUrl.value.trim()) return alert("Need URL");
  const s = Number(startSec.value);
  const en = Number(endSec.value);

  status.textContent = "Importing...";
  const body = {
    url: ytUrl.value.trim(),
    start: s,
    end: en,
    title: saveForm.title.value.trim(),
    category: saveForm.category.value.trim(),
    tags: saveForm.tags.value.trim()
  };

  const r = await fetch("/api/youtube/import", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "X-Session-Id": sessionId },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) {
    status.textContent = j.error || "Failed";
    return;
  }
  status.textContent = `Saved as ${j.soundId} (via ${j.via}).`;
  saveForm.reset();
};
