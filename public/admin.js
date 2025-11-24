import { ensureSession } from "./auth.js";
await ensureSession();

const adminSearch = document.getElementById("adminSearch");
const adminList = document.getElementById("adminList");
const categoryManager = document.getElementById("categoryManager");
const tagManager = document.getElementById("tagManager");

let sessionId = localStorage.getItem("sessionId");
let sounds = [];
let hasUploadRole = false;
let isAdmin = false;
let previewingId = null;
const previewAudio = new Audio();

function parseListInput(value) {
  const seen = new Set();
  return String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .filter(v => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const socket = io();
socket.on("sounds:update", (list) => {
  if (previewingId && !list.some(s => s.id === previewingId)) {
    stopPreview();
  }
  sounds = list;
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

function updatePreviewUI() {
  const playing = previewingId && !previewAudio.paused;
  adminList.querySelectorAll(".admin-item").forEach(el => {
    const active = playing && el.dataset.id === previewingId;
    el.classList.toggle("is-previewing", !!active);
    const btn = el.querySelector(".preview-btn");
    if (btn) btn.textContent = active ? "Stop" : "Preview";
  });
}

function stopPreview() {
  previewAudio.pause();
  previewAudio.currentTime = 0;
  previewingId = null;
  updatePreviewUI();
}

function previewSound(id) {
  const sound = sounds.find(s => s.id === id);
  if (!sound || !sound.fileUrl) return;

  // toggle off if already playing
  if (previewingId === id && !previewAudio.paused) {
    stopPreview();
    return;
  }

  previewAudio.pause();
  previewAudio.currentTime = 0;
  previewingId = id;
  const vol = Math.max(0, Math.min(1, sound.volume ?? 1));
  previewAudio.volume = vol;
  previewAudio.src = sound.fileUrl;
  previewAudio.play().catch((err) => {
    previewingId = null;
    updatePreviewUI();
    alert("Preview failed: " + (err?.message || err));
  });
  updatePreviewUI();
}

previewAudio.addEventListener("ended", stopPreview);
previewAudio.addEventListener("pause", () => {
  if (previewAudio.currentTime === 0) {
    previewingId = null;
    updatePreviewUI();
  }
});

function categoriesOf(sound) {
  if (!sound) return [];
  if (Array.isArray(sound.categories) && sound.categories.length) {
    return sound.categories.filter(Boolean);
  }
  return sound.category ? [sound.category] : [];
}

async function reloadSounds() {
  try {
    const r = await fetch("/api/sounds");
    if (!r.ok) throw new Error("Failed to refresh sounds");
    sounds = await r.json();
    renderList();
  } catch (err) {
    console.warn("Failed to reload sounds", err?.message);
  }
}

function buildTaxonomy(type) {
  const map = new Map();
  sounds.forEach(s => {
    const list = type === "category" ? categoriesOf(s) : (s.tags || []);
    list.forEach(name => {
      const key = String(name || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
  });
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderTaxonomy(type) {
  const container = type === "category" ? categoryManager : tagManager;
  if (!container) return;

  const list = buildTaxonomy(type);
  container.innerHTML = list.map(item => `
    <div class="taxonomy-row" data-name="${item.name}">
      <div class="taxonomy-info">
        <strong>${item.name}</strong>
        <span class="muted">${item.count} sound${item.count === 1 ? "" : "s"}</span>
      </div>
      <div class="taxonomy-actions">
        <input class="rename-input" placeholder="Rename to...">
        <button class="rename-btn"${isAdmin ? "" : " disabled"}>${isAdmin ? "Rename" : "Admin only"}</button>
        <button class="delete-btn danger"${isAdmin ? "" : " disabled"}>${isAdmin ? "Delete" : "Admin only"}</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".taxonomy-row").forEach(row => {
    const name = row.dataset.name;
    const renameInput = row.querySelector(".rename-input");
    const renameBtn = row.querySelector(".rename-btn");
    const deleteBtn = row.querySelector(".delete-btn");

    const endpointBase = type === "category" ? "/api/admin/categories" : "/api/admin/tags";

    if (renameBtn) {
      renameBtn.onclick = async () => {
        if (!isAdmin) return alert("Admin required.");
        const to = renameInput.value.trim();
        if (!to || to === name) return alert("Enter a new name.");
        renameBtn.disabled = true;
        deleteBtn.disabled = true;
        renameBtn.textContent = "Renaming...";
        try {
          const r = await fetch(`${endpointBase}/rename`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Id": sessionId
            },
            body: JSON.stringify({ from: name, to })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "Rename failed");
          renameInput.value = "";
          await reloadSounds();
        } catch (err) {
          alert(err?.message || "Rename failed");
        } finally {
          renameBtn.textContent = isAdmin ? "Rename" : "Admin only";
          renameBtn.disabled = !isAdmin;
          deleteBtn.disabled = !isAdmin;
        }
      };
    }

    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!isAdmin) return alert("Admin required.");
        if (!confirm(`Delete ${type} "${name}"? This will remove it from sounds.`)) return;
        renameBtn.disabled = true;
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Deleting...";
        try {
          const r = await fetch(`${endpointBase}/${encodeURIComponent(name)}`, {
            method: "DELETE",
            headers: { "X-Session-Id": sessionId }
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "Delete failed");
          await reloadSounds();
        } catch (err) {
          alert(err?.message || "Delete failed");
        } finally {
          deleteBtn.textContent = isAdmin ? "Delete" : "Admin only";
          renameBtn.disabled = !isAdmin;
          deleteBtn.disabled = !isAdmin;
        }
      };
    }
  });
}

function renderTaxonomies() {
  renderTaxonomy("category");
  renderTaxonomy("tag");
}

function attachMultiSuggest(input, type, onChange) {
  if (!input) return;
  const wrapper = document.createElement("div");
  wrapper.className = "admin-suggest";
  wrapper.style.display = "none";
  input.parentElement.appendChild(wrapper);

  function close() {
    wrapper.style.display = "none";
    wrapper.innerHTML = "";
  }

  function options() {
    return (type === "category" ? buildTaxonomy("category") : buildTaxonomy("tag")).map(x => x.name);
  }

  function insert(value) {
    const tokens = parseListInput(input.value);
    const exists = tokens.some(t => t.toLowerCase() === value.toLowerCase());
    const next = exists ? tokens.map(t => t.toLowerCase() === value.toLowerCase() ? value : t) : [...tokens, value];
    input.value = next.join(", ") + ", ";
    onChange?.();
    close();
    input.focus();
  }

  function open() {
    const parts = input.value.split(",");
    const query = (parts[parts.length - 1] || "").trim().toLowerCase();
    const opts = options()
      .filter(o => !query || o.toLowerCase().includes(query))
      .slice(0, 8);
    if (!opts.length) {
      close();
      return;
    }
    wrapper.innerHTML = opts.map(o => `<button type="button">${o}</button>`).join("");
    wrapper.style.display = "flex";
  }

  wrapper.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    insert(e.target.textContent);
  });
  input.addEventListener("input", open);
  input.addEventListener("focus", open);
  input.addEventListener("blur", () => setTimeout(close, 120));
}

function renderList() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = sounds.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.id.includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  adminList.innerHTML = filtered.map(s => `
    <div class="admin-item${previewingId === s.id && !previewAudio.paused ? " is-previewing" : ""}" data-id="${s.id}">
      <div class="admin-row">
        <strong>${s.title}</strong> <span class="muted">(${s.id})</span>
      </div>
      <div class="admin-row">
        <label>Title <input class="t" value="${s.title}"></label>
        <label>Category <input class="c" list="admin-category-list" value="${categoriesOf(s).join(", ")}"></label>
        <label>Tags (comma) <input class="g" list="admin-tag-list" value="${(s.tags||[]).join(", ")}"></label>
        <div class="admin-preview">
          <button class="preview-btn">${previewingId === s.id && !previewAudio.paused ? "Stop" : "Preview"}</button>
          <a class="file-link" href="${s.fileUrl}" target="_blank" rel="noreferrer">Open file</a>
        </div>
        <label>Volume <input class="v" type="range" min="0" max="2" step="0.01" value="${s.volume ?? 1}"><span class="vol-label">${Math.round((s.volume ?? 1)*100)}%</span></label>
        <div class="admin-status" aria-live="polite"></div>
        <button class="save"${hasUploadRole ? "" : " disabled"}>Save</button>
        ${isAdmin ? `<button class="delete danger">Delete</button>` : ""}
      </div>
    </div>
  `).join("");

  adminList.querySelectorAll(".admin-item").forEach(el => {
    const id = el.dataset.id;
    const sound = sounds.find(s => s.id === id);
    const statusEl = el.querySelector(".admin-status");
    const titleInput = el.querySelector(".t");
    const catInput = el.querySelector(".c");
    const tagsInput = el.querySelector(".g");
    const volInput = el.querySelector(".v");
    const saveBtn = el.querySelector(".save");

    function getCurrentInputs() {
      const categories = parseListInput(catInput.value);
      return {
        title: titleInput.value.trim(),
        category: categories[0] || "",
        categories,
        tags: parseListInput(tagsInput.value),
        volume: parseFloat(volInput.value)
      };
    }

    function isDirty() {
      if (!sound) return false;
      const vals = getCurrentInputs();
      const baseCats = categoriesOf(sound);
      const baseTags = parseListInput((sound.tags || []).join(","));
      const tagsChanged = baseTags.length !== vals.tags.length ||
        baseTags.some((t, i) => t !== vals.tags[i]);
      const catsChanged = baseCats.length !== vals.categories.length ||
        baseCats.some((c, i) => c !== vals.categories[i]);
      const baseVol = Number(sound.volume ?? 1);
      const inputVol = Number.isFinite(vals.volume) ? vals.volume : baseVol;
      return sound.title !== vals.title ||
        catsChanged ||
        tagsChanged ||
        baseVol !== inputVol;
    }

    function setStatus(text, type = "") {
      statusEl.textContent = text || "";
      statusEl.className = "admin-status" + (type ? ` ${type}` : "");
    }

    function refreshDirtyState() {
      const dirty = isDirty();
      el.classList.toggle("has-unsaved", dirty);
      if (dirty) {
        setStatus("Unsaved changes", "unsaved");
      } else {
        setStatus("");
      }
    }

    el.querySelector(".save").onclick = async () => {
      if (!hasUploadRole) return alert("Upload role required.");
      if (!sessionId) return alert("No session.");
      const { title, categories, tags, volume } = getCurrentInputs();
      const category = categories[0] || "";
      const id = el.dataset.id;
      try {
        setStatus("Saving...", "saving");
        saveBtn.disabled = true;
        await patchJSON(`/api/admin/sounds/${id}`, { title, category, categories, tags, volume });
        Object.assign(sound, { title, category, categories, tags, volume });
        el.classList.remove("has-unsaved");
        setStatus("Saved", "saved");
        setTimeout(() => {
          if (!isDirty()) setStatus("");
        }, 1400);
      } catch (e) {
        alert(e.message);
        setStatus("Save failed", "error");
        refreshDirtyState();
      } finally {
        saveBtn.disabled = false;
      }
    };

    el.querySelector(".preview-btn").onclick = () => previewSound(el.dataset.id);

    el.querySelector(".v").addEventListener("input", (e) => {
      const lbl = el.querySelector(".vol-label");
      lbl.textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
    });
    [titleInput, catInput, tagsInput, volInput].forEach(input => {
      input.addEventListener("input", refreshDirtyState);
      input.addEventListener("change", refreshDirtyState);
    });

    attachMultiSuggest(catInput, "category", refreshDirtyState);
    attachMultiSuggest(tagsInput, "tag", refreshDirtyState);

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

    refreshDirtyState();
  });

  updatePreviewUI();
  renderTaxonomies();
}

adminSearch.addEventListener("input", renderList);

await ensureUploader();
