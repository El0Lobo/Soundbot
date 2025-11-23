import { ensureSession } from "./auth.js";

let sessionId = localStorage.getItem("sessionId");
await ensureSession();
sessionId = localStorage.getItem("sessionId");

const adminSearch = document.getElementById("adminSearch");
const adminList = document.getElementById("adminList");
const categoryManager = document.getElementById("categoryManager");
const tagManager = document.getElementById("tagManager");
const categoryListId = "admin-category-list";
const tagListId = "admin-tag-list";
let sounds = [];
let hasUploadRole = false;
let isAdmin = false;
let previewAudio = null;
let previewingId = null;

function categoriesOf(sound) {
  if (!sound) return [];
  if (Array.isArray(sound.categories) && sound.categories.length) {
    return sound.categories.filter(Boolean);
  }
  return sound.category ? [sound.category] : [];
}

function parseListInput(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  return raw
    .map(x => String(x || "").trim())
    .filter(x => {
      if (!x) return false;
      const key = x.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatList(value) {
  return parseListInput(value).join(", ");
}

function getAvailableCategories() {
  return Array.from(new Set(sounds.flatMap(s => categoriesOf(s)))).sort();
}

function getAvailableTags() {
  return Array.from(new Set(sounds.flatMap(s => s.tags || []))).sort((a, b) => a.localeCompare(b));
}

const socket = io();
socket.on("sounds:update", (list) => {
  sounds = list;
  updateSuggestions();
  renderTaxonomy();
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
  renderTaxonomy();
  renderList();
}

async function authedJSON(url, options = {}) {
  if (!sessionId) throw new Error("No session.");
  const headers = Object.assign({ "X-Session-Id": sessionId }, options.headers || {});
  const opts = Object.assign({}, options, { headers });
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "request failed");
  return j;
}

async function patchJSON(url, body) {
  return authedJSON(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId
    },
    body: JSON.stringify(body)
  });
}

function escapeOption(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

function updateSuggestions() {
  const categories = getAvailableCategories();
  const tags = getAvailableTags();

  const catEl = document.getElementById(categoryListId);
  const tagEl = document.getElementById(tagListId);
  if (catEl) {
    catEl.innerHTML = categories.map(c => `<option value="${escapeOption(c)}"></option>`).join("");
  }
  if (tagEl) {
    tagEl.innerHTML = tags.map(t => `<option value="${escapeOption(t)}"></option>`).join("");
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

function summarizeCategories() {
  const counts = new Map();
  sounds.forEach(s => {
    categoriesOf(s).forEach(cat => counts.set(cat, (counts.get(cat) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function summarizeTags() {
  const counts = new Map();
  sounds.forEach(s => {
    (s.tags || []).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

async function renameCategoryFlow(name) {
  if (!isAdmin) return alert("Admin required.");
  const next = prompt(`Rename category "${name}" to:`, name);
  if (!next || next.trim() === name) return;
  try {
    await authedJSON("/api/admin/categories/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
      body: JSON.stringify({ from: name, to: next.trim() })
    });
  } catch (e) {
    alert(e.message);
  }
}

async function deleteCategoryFlow(name) {
  if (!isAdmin) return alert("Admin required.");
  if (!confirm(`Delete category "${name}" from all sounds?`)) return;
  try {
    await authedJSON(`/api/admin/categories/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { "X-Session-Id": sessionId }
    });
  } catch (e) {
    alert(e.message);
  }
}

async function renameTagFlow(name) {
  if (!isAdmin) return alert("Admin required.");
  const next = prompt(`Rename tag "${name}" to:`, name);
  if (!next || next.trim() === name) return;
  try {
    await authedJSON("/api/admin/tags/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
      body: JSON.stringify({ from: name, to: next.trim() })
    });
  } catch (e) {
    alert(e.message);
  }
}

async function deleteTagFlow(name) {
  if (!isAdmin) return alert("Admin required.");
  if (!confirm(`Delete tag "${name}" from all sounds?`)) return;
  try {
    await authedJSON(`/api/admin/tags/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { "X-Session-Id": sessionId }
    });
  } catch (e) {
    alert(e.message);
  }
}

function renderTaxonomy() {
  const cats = summarizeCategories();
  if (categoryManager) {
    categoryManager.innerHTML = cats.length ? cats.map(([name, count]) => `
      <div class="taxonomy-row">
        <div class="taxonomy-info">
          <strong>${escapeOption(name)}</strong>
          <span class="muted">${count} sound${count === 1 ? "" : "s"}</span>
        </div>
        <div class="taxonomy-actions">
          ${isAdmin ? `<button data-action="rename-cat" data-name="${escapeOption(name)}">Rename</button>` : `<button disabled title="Admin only">Rename</button>`}
          ${isAdmin ? `<button class="danger" data-action="delete-cat" data-name="${escapeOption(name)}">Delete</button>` : `<button class="danger" disabled title="Admin only">Delete</button>`}
        </div>
      </div>
    `).join("") : `<div class="muted">No categories yet.</div>`;

    categoryManager.querySelectorAll('[data-action="rename-cat"]').forEach(btn => {
      btn.onclick = () => renameCategoryFlow(btn.dataset.name);
    });
    categoryManager.querySelectorAll('[data-action="delete-cat"]').forEach(btn => {
      btn.onclick = () => deleteCategoryFlow(btn.dataset.name);
    });
  }

  const tags = summarizeTags();
  if (tagManager) {
    tagManager.innerHTML = tags.length ? tags.map(([name, count]) => `
      <div class="taxonomy-row">
        <div class="taxonomy-info">
          <strong>${escapeOption(name)}</strong>
          <span class="muted">${count} sound${count === 1 ? "" : "s"}</span>
        </div>
        <div class="taxonomy-actions">
          ${isAdmin ? `<button data-action="rename-tag" data-name="${escapeOption(name)}">Rename</button>` : `<button disabled title="Admin only">Rename</button>`}
          ${isAdmin ? `<button class="danger" data-action="delete-tag" data-name="${escapeOption(name)}">Delete</button>` : `<button class="danger" disabled title="Admin only">Delete</button>`}
        </div>
      </div>
    `).join("") : `<div class="muted">No tags yet.</div>`;

    tagManager.querySelectorAll('[data-action="rename-tag"]').forEach(btn => {
      btn.onclick = () => renameTagFlow(btn.dataset.name);
    });
    tagManager.querySelectorAll('[data-action="delete-tag"]').forEach(btn => {
      btn.onclick = () => deleteTagFlow(btn.dataset.name);
    });
  }
}

function renderList() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = sounds.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.id.includes(q) ||
    categoriesOf(s).some(c => c.toLowerCase().includes(q)) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if (previewingId && !filtered.some(s => s.id === previewingId)) {
    stopPreview();
  }

  adminList.innerHTML = filtered.map(s => `
    <div class="admin-item${previewingId === s.id ? " is-previewing" : ""}" data-id="${s.id}">
      <div class="admin-row">
        <strong>${escapeOption(s.title)}</strong> <span class="muted">(${escapeOption(s.id)})</span>
        <span class="muted file-meta">${(s.ext || "audio").toUpperCase()}</span>
      </div>
      <div class="admin-row">
        <label>Title <input class="t" value="${escapeOption(s.title)}"></label>
        <label>Categories (comma) <input class="c" list="${categoryListId}" value="${escapeOption(formatList(categoriesOf(s)))}"></label>
        <label>Tags (comma) <input class="g" list="${tagListId}" value="${escapeOption(formatList(s.tags || []))}"></label>
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
      <div class="admin-status status-inline"></div>
    </div>
  `).join("");

  adminList.querySelectorAll(".admin-item").forEach(el => {
    const id = el.dataset.id;
    const sound = sounds.find(s => s.id === id);
    if (!sound) return;

    const saveBtn = el.querySelector(".save");
    const statusEl = el.querySelector(".admin-status");
    const titleInput = el.querySelector(".t");
    const catInput = el.querySelector(".c");
    const tagInput = el.querySelector(".g");
    const volInput = el.querySelector(".v");

    const initial = {
      title: titleInput.value.trim(),
      categories: parseListInput(catInput.value).join(", "),
      tags: parseListInput(tagInput.value).join(", "),
      volume: parseFloat(volInput.value)
    };

    const setStatus = (msg, type = "") => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("ok", type === "ok");
      statusEl.classList.toggle("dirty", type === "dirty");
    };

    const refreshDirty = () => {
      const current = {
        title: titleInput.value.trim(),
        categories: parseListInput(catInput.value).join(", "),
        tags: parseListInput(tagInput.value).join(", "),
        volume: parseFloat(volInput.value)
      };
      const dirty = current.title !== initial.title ||
        current.categories !== initial.categories ||
        current.tags !== initial.tags ||
        current.volume !== initial.volume;
      saveBtn?.classList.toggle("dirty", dirty);
      if (dirty) setStatus("Unsaved changes", "dirty");
      else setStatus("");
      return { dirty, current };
    };

    [titleInput, catInput, tagInput, volInput].forEach(inp => {
      inp?.addEventListener("input", refreshDirty);
    });

    refreshDirty();

    saveBtn.onclick = async () => {
      if (!hasUploadRole) return alert("Upload role required.");
      if (!sessionId) return alert("No session.");
      const state = refreshDirty();
      const title = titleInput.value.trim();
      const categories = parseListInput(catInput.value);
      const tags = parseListInput(tagInput.value);
      const volume = parseFloat(volInput.value);
      if (!state.dirty) {
        setStatus("No changes");
        return;
      }
      setStatus("Saving…");
      try {
        await patchJSON(`/api/admin/sounds/${id}`, { title, categories, tags, volume });
        initial.title = title;
        initial.categories = parseListInput(catInput.value).join(", ");
        initial.tags = parseListInput(tagInput.value).join(", ");
        initial.volume = volume;
        refreshDirty();
        setStatus("Saved.", "ok");
      } catch (e) {
        setStatus(e.message, "dirty");
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
        const r = await fetch(`/api/admin/sounds/${id}`, {
          method: "DELETE",
          headers: { "X-Session-Id": sessionId }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return alert(j.error || "Delete failed");
        sounds = sounds.filter(s => s.id !== id);
        renderList();
        renderTaxonomy();
      };
    }
  });

  updatePreviewStates();
}

adminSearch.addEventListener("input", renderList);

await ensureUploader();
updateSuggestions();
renderTaxonomy();
renderList();
