import { ensureSession } from "./auth.js";
await ensureSession();

const adminSearch = document.getElementById("adminSearch");
const adminList = document.getElementById("adminList");
const categoryListId = "admin-category-list";
const tagListId = "admin-tag-list";

let sessionId = localStorage.getItem("sessionId");
let sounds = [];
let hasUploadRole = false;
let isAdmin = false;
let previewAudio = null;
let previewingId = null;

const socket = io();
socket.on("sounds:update", (list) => {
  sounds = list;
  updateSuggestions();
  renderList();
});

async function ensureUploader() {
  if (!sessionId) return;
  const r = await fetch("/api/me/status", { headers: { "X-Session-Id": sessionId } });
  if (!r.ok) return;
  const j = await r.json();
  hasUploadRole = !!j.hasUploadRole;
  isAdmin = !!j.isAdmin;
  if (!hasUploadRole) {
    alert("You need the upload role to edit sounds.");
  }
  renderList();
}

async function patchJSON(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId
    },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "request failed");
  return j;
}

function escapeOption(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function updateSuggestions() {
  const categories = new Set();
  const tags = new Set();

  sounds.forEach(s => {
    if (s.category) categories.add(s.category);
    (s.tags || []).forEach(t => tags.add(t));
  });

  const catEl = document.getElementById(categoryListId);
  const tagEl = document.getElementById(tagListId);
  if (catEl) {
    catEl.innerHTML = [...categories].sort().map(c => `<option value="${escapeOption(c)}"></option>`).join("");
  }
  if (tagEl) {
    tagEl.innerHTML = [...tags].sort().map(t => `<option value="${escapeOption(t)}"></option>`).join("");
  }
}

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = "";
    previewAudio = null;
  }
  previewingId = null;
  updatePreviewStates();
}

function updatePreviewStates() {
  adminList.querySelectorAll(".admin-item").forEach(item => {
    const active = item.dataset.id === previewingId;
    item.classList.toggle("is-previewing", active);
    const btn = item.querySelector(".preview");
    if (btn) {
      btn.textContent = active ? "Stop preview" : "Preview";
    }
  });
}

function togglePreview(sound) {
  if (!sound?.fileUrl) return alert("No file to preview.");

  if (previewingId === sound.id) {
    stopPreview();
    return;
  }

  stopPreview();
  previewingId = sound.id;
  previewAudio = new Audio(sound.fileUrl);
  previewAudio.volume = Math.max(0, Math.min(sound.volume ?? 1, 2));
  previewAudio.onended = () => stopPreview();
  previewAudio.onerror = () => stopPreview();

  previewAudio.play().catch((err) => {
    stopPreview();
    alert(err?.message || "Preview failed.");
  });

  updatePreviewStates();
}

function renderList() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = sounds.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.id.includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if (previewingId && !filtered.some(s => s.id === previewingId)) {
    stopPreview();
  }

  adminList.innerHTML = filtered.map(s => `
    <div class="admin-item${previewingId === s.id ? " is-previewing" : ""}" data-id="${s.id}">
      <div class="admin-row">
        <strong>${s.title}</strong> <span class="muted">(${s.id})</span>
        <span class="muted file-meta">${(s.ext || "audio").toUpperCase()}</span>
      </div>
      <div class="admin-row">
        <label>Title <input class="t" value="${s.title}"></label>
        <label>Category <input class="c" list="${categoryListId}" value="${s.category}"></label>
        <label>Tags (comma) <input class="g" list="${tagListId}" value="${(s.tags||[]).join(", ")}"></label>
        <label>Volume <input class="v" type="range" min="0" max="2" step="0.01" value="${s.volume ?? 1}"><span class="vol-label">${Math.round((s.volume ?? 1)*100)}%</span></label>
      </div>
      <div class="admin-row admin-actions">
        <div class="admin-preview">
          <button class="preview">Preview</button>
          <a class="file-link" href="${s.fileUrl}" target="_blank" rel="noopener">Open file</a>
        </div>
        <div class="admin-actions-right">
          <button class="save"${hasUploadRole ? "" : " disabled"}>Save</button>
          ${isAdmin ? `<button class="delete danger">Delete</button>` : ""}
        </div>
      </div>
    </div>
  `).join("");

  adminList.querySelectorAll(".admin-item").forEach(el => {
    const id = el.dataset.id;
    const sound = sounds.find(s => s.id === id);
    if (!sound) return;

    el.querySelector(".save").onclick = async () => {
      if (!hasUploadRole) return alert("Upload role required.");
      if (!sessionId) return alert("No session.");
      const title = el.querySelector(".t").value.trim();
      const category = el.querySelector(".c").value.trim();
      const tags = el.querySelector(".g").value.split(",").map(x=>x.trim()).filter(Boolean);
      const volume = parseFloat(el.querySelector(".v").value);
      try {
        await patchJSON(`/api/admin/sounds/${id}`, { title, category, tags, volume });
      } catch (e) {
        alert(e.message);
      }
    };

    el.querySelector(".v").addEventListener("input", (e) => {
      const lbl = el.querySelector(".vol-label");
      lbl.textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
    });

    const previewBtn = el.querySelector(".preview");
    if (previewBtn) {
      previewBtn.onclick = () => togglePreview(sound);
    }

    const delBtn = el.querySelector(".delete");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!isAdmin) return alert("Admin required.");
        if (!confirm("Delete this sound? This cannot be undone.")) return;
        const id = el.dataset.id;
        const r = await fetch(`/api/admin/sounds/${id}`, {
          method: "DELETE",
          headers: { "X-Session-Id": sessionId }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return alert(j.error || "Delete failed");
        sounds = sounds.filter(s => s.id !== id);
        renderList();
      };
    }
  });

  updatePreviewStates();
}

adminSearch.addEventListener("input", renderList);

await ensureUploader();
updateSuggestions();
