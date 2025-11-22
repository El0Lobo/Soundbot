import { ensureSession } from "./auth.js";
await ensureSession();

const introSelect = document.getElementById("introSelect");
const outroSelect = document.getElementById("outroSelect");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");
const preview = document.getElementById("preview");
const introPreview = document.getElementById("introPreview");
const outroPreview = document.getElementById("outroPreview");

let sounds = [];
let statusTimer = null;

async function fetchJSON(url, opts={}) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "failed");
  return j;
}

function setStatus(text, type = "info") {
  if (!status) return;
  status.textContent = text;
  status.className = type === "error" ? "status error" : "status ok";
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 3000);
}

async function loadSounds() {
  sounds = await fetchJSON("/api/sounds");
  const opts = [`<option value="">(none)</option>`]
    .concat(sounds.map(s=>`<option value="${s.id}">${s.title} (${s.category})</option>`));
  introSelect.innerHTML = opts.join("");
  outroSelect.innerHTML = opts.join("");
}

async function loadMine() {
  const sessionId = localStorage.getItem("sessionId");
  const mine = await fetchJSON("/api/me/intros", { headers:{ "X-Session-Id": sessionId }});
  if (mine.cfg.intro) introSelect.value = mine.cfg.intro;
  if (mine.cfg.outro) outroSelect.value = mine.cfg.outro;
}

function playPreview(id) {
  if (!id) return;
  const s = sounds.find(x=>x.id===id);
  if (!s) return;
  // use provided fileUrl from API to avoid guessing path
  preview.src = s.fileUrl;
  preview.style.display = "block";
  preview.play();
}

introPreview.onclick = () => playPreview(introSelect.value);
outroPreview.onclick = () => playPreview(outroSelect.value);

saveBtn.onclick = async () => {
  const sessionId = localStorage.getItem("sessionId");
  if (!sessionId) return alert("Link first");
  try {
    setStatus("Saving…");
    await fetchJSON("/api/me/intros", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "X-Session-Id": sessionId },
      body: JSON.stringify({ intro: introSelect.value || null, outro: outroSelect.value || null })
    });
    setStatus("Saved.", "ok");
  } catch (e) {
    setStatus(e.message || "Failed to save", "error");
  }
};

await loadSounds();
await loadMine();
