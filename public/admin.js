import { ensureSession } from "./auth.js";
await ensureSession();

const adminSearch = document.getElementById("adminSearch");
const adminList = document.getElementById("adminList");

let sessionId = localStorage.getItem("sessionId");
let sounds = [];
let hasUploadRole = false;
let isAdmin = false;

const socket = io();
socket.on("sounds:update", (list) => {
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

function renderList() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = sounds.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.id.includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  adminList.innerHTML = filtered.map(s => `
    <div class="admin-item" data-id="${s.id}">
      <div class="admin-row">
        <strong>${s.title}</strong> <span class="muted">(${s.id})</span>
      </div>
      <div class="admin-row">
        <label>Title <input class="t" value="${s.title}"></label>
        <label>Category <input class="c" value="${s.category}"></label>
        <label>Tags (comma) <input class="g" value="${(s.tags||[]).join(", ")}"></label>
        <label>Volume <input class="v" type="range" min="0" max="2" step="0.01" value="${s.volume ?? 1}"><span class="vol-label">${Math.round((s.volume ?? 1)*100)}%</span></label>
        <button class="save"${hasUploadRole ? "" : " disabled"}>Save</button>
        ${isAdmin ? `<button class="delete danger">Delete</button>` : ""}
      </div>
    </div>
  `).join("");

  adminList.querySelectorAll(".admin-item").forEach(el => {
    el.querySelector(".save").onclick = async () => {
      if (!hasUploadRole) return alert("Upload role required.");
      if (!sessionId) return alert("No session.");
      const id = el.dataset.id;
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
}

adminSearch.addEventListener("input", renderList);

await ensureUploader();
