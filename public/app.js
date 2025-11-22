const grid = document.getElementById("grid");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const categoryFilter = document.getElementById("categoryFilter");
const tagFilter = document.getElementById("tagFilter");
const favoritesToggle = document.getElementById("favoritesToggle");

const guildSelect = document.getElementById("guildSelect");
const channelSelect = document.getElementById("channelSelect");
const refreshGuildsBtn = document.getElementById("refreshGuilds");
const modeSelect = document.getElementById("modeSelect");
const volumeRange = document.getElementById("volumeRange");
const volumeLabel = document.getElementById("volumeLabel");
const skipBtn = document.getElementById("skipBtn");
const stopBtn = document.getElementById("stopBtn");
const guildNameLabel = document.getElementById("guildNameLabel");
const guildAvatar = document.getElementById("guildAvatar");
const userAvatarEl = document.getElementById("userAvatar");
const uploadOnlyEls = Array.from(document.querySelectorAll(".upload-only"));

const queueBtn = document.getElementById("showQueueBtn");
const queueBox = document.getElementById("queueBox");
const voiceBar = document.getElementById("voiceBar");
const toggleVoiceBarBtn = document.getElementById("toggleVoiceBarBtn");
const voiceBlocker = document.getElementById("voiceBlocker");
const toastEl = document.getElementById("toast");

const useMyChannel = document.getElementById("useMyChannel");
useMyChannel.checked = true;

// YT modal elements (exist only in modal now)
const openYtModalBtn = document.getElementById("openYtModal");
const ytModal = document.getElementById("ytModal");
const ytUrl = document.getElementById("ytUrl");
const ytPlayBtn = document.getElementById("ytPlayBtn");
const ytStatus = document.getElementById("ytStatus");

// login UI bits
const loginTitle = document.getElementById("loginTitle");
const loginText = document.getElementById("loginText");
const loginMeta = document.getElementById("loginMeta");
const howToText = document.getElementById("howToText");
const getCodeBtn = document.getElementById("getCodeBtn");
const startSessionBtn = document.getElementById("startSessionBtn");
const codeDisplay = document.getElementById("codeDisplay");
const codeInput = document.getElementById("codeInput");
const pairingControls = document.getElementById("pairingControls");

// session
let sessionId = localStorage.getItem("sessionId") || null;

// preview
let previewAudio = new Audio();
let previewingId = null;
let currentPreviewVolume = null;

let sounds = [];
let filtered = [];
let guilds = [];
let channels = [];
let controlsLocked = true;
const AVATAR_FALLBACK = "https://cdn.discordapp.com/embed/avatars/0.png";
const SORT_KEY = "sort_state";
let favorites = new Set();
let favoritesOnly = false;
let isAdmin = false;
let voiceBarVisible = false;
let inVoiceChannel = false;
let voiceStatusKnown = false;
let currentUserId = localStorage.getItem("userId") || null;
let hasUploadRole = false;

loadFavorites().then(() => applyFilters());
updateVoiceBarUI();
updateUploadUI();

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("show");
  // force reflow so animation resets
  void toastEl.offsetWidth;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function updateUploadUI() {
  uploadOnlyEls.forEach(el => {
    el.style.display = hasUploadRole ? "" : "none";
  });
}

function setControlsEnabled(on) {
  controlsLocked = !on;
  const shell = document.getElementById("appShell");
  const overlay = document.getElementById("lockOverlay");
  if (shell) shell.classList.toggle("locked", !on);
  if (overlay) overlay.classList.toggle("show", !on);
  document.body.classList.toggle("locked-scroll", !on);

  const loginBox = document.getElementById("loginBox");
  const loginMount = document.getElementById("loginMount");
  const overlayMount = document.getElementById("overlayLoginMount");
  if (loginBox && loginMount && overlayMount) {
    if (on) {
      if (loginBox.parentElement !== loginMount) loginMount.appendChild(loginBox);
    } else {
      if (loginBox.parentElement !== overlayMount) overlayMount.appendChild(loginBox);
    }
  }

  const toToggle = [
    channelSelect, modeSelect, volumeRange,
    skipBtn, stopBtn, refreshGuildsBtn,
    queueBtn, toggleVoiceBarBtn, openYtModalBtn,
    sortSelect, categoryFilter, tagFilter, favoritesToggle, searchInput
  ].filter(Boolean);

  for (const el of toToggle) {
    el.disabled = !on;
    el.classList.toggle("disabled", !on);
  }
  updateVoiceBlockerUI();
  updateUploadUI();
}

function updateVoiceBarUI() {
  const canShow = isAdmin;
  const shouldShow = canShow && voiceBarVisible;

  if (voiceBar) {
    voiceBar.classList.toggle("hidden", !shouldShow);
  }

  if (toggleVoiceBarBtn) {
    toggleVoiceBarBtn.style.display = canShow ? "" : "none";
    toggleVoiceBarBtn.textContent = shouldShow ? "Hide Voice Controls" : "Show Voice Controls";
  }
}

toggleVoiceBarBtn?.addEventListener("click", () => {
  voiceBarVisible = !voiceBarVisible;
  updateVoiceBarUI();
});

function updateVoiceBlockerUI() {
  const block = useMyChannel.checked && !!sessionId && !inVoiceChannel;

  if (voiceBlocker) {
    voiceBlocker.classList.toggle("show", block);
  }

  const actionButtons = [queueBtn, skipBtn, stopBtn, openYtModalBtn];
  actionButtons.filter(Boolean).forEach(btn => {
    btn.disabled = block || controlsLocked;
    btn.classList.toggle("disabled", block || controlsLocked);
  });
}

function voiceGateActive() {
  const block = useMyChannel.checked && !!sessionId && !inVoiceChannel;
  if (block) updateVoiceBlockerUI();
  return block;
}

function setAvatar(el, url) {
  if (!el) return;
  el.src = url || AVATAR_FALLBACK;
  el.classList.remove("hidden");
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let txt = "";
    try { txt = await r.text(); } catch {}
    throw new Error(txt || r.statusText);
  }
  return r.json();
}

/* =========================
   MODAL SYSTEM
   ========================= */

function openModal(modalEl, src = null) {
  if (!modalEl) return;
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");

  if (src) {
    const frame = modalEl.querySelector(".modal-frame");
    if (frame && frame.src !== location.origin + src) {
      frame.src = src;
    }
  }
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
}

// open buttons (Upload / Import / Intros / Admin)
document.querySelectorAll(".modal-open").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const modalId = btn.dataset.modal;
    const src = btn.dataset.src;
    const modalEl = document.getElementById(modalId);
    openModal(modalEl, src);
  });
});

// close on backdrop + close button
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) {
      closeModal(modal);
    }
  });
});

// ESC closes topmost modal
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const openModals = Array.from(document.querySelectorAll(".modal.open"));
  if (!openModals.length) return;
  closeModal(openModals[openModals.length - 1]);
});

// YouTube modal open
openYtModalBtn?.addEventListener("click", () => openModal(ytModal));

/* =========================
   SOCKET / SOUNDS
   ========================= */

const socket = io();
socket.on("sounds:update", (list) => {
  sounds = list;
  refreshFilters();
  applyFilters();
});

/* =========================
   GUILDS / CHANNELS
   ========================= */

async function loadGuilds() {
  guilds = await fetchJSON("/api/guilds");
  guildSelect.innerHTML = guilds
    .map(g => `<option value="${g.id}">${g.name}</option>`)
    .join("");

  const savedGuild = localStorage.getItem("guildId");
  if (savedGuild && guilds.some(g => g.id === savedGuild)) {
    guildSelect.value = savedGuild;
  }
  updateGuildName();
  await onGuildChange();
}

function updateGuildName() {
  if (!guildNameLabel) return;
  const g = guilds.find(x => x.id === guildSelect.value);
  guildNameLabel.textContent = g ? g.name : "Server";
}

async function onGuildChange() {
  const guildId = guildSelect.value;
  localStorage.setItem("guildId", guildId);
  updateGuildName();

  channels = await fetchJSON(`/api/guilds/${guildId}/channels`);
  channelSelect.innerHTML = channels
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  const cfg = await fetchJSON(`/api/guilds/${guildId}/config`);
  if (cfg.defaultChannelId && channels.some(c => c.id === cfg.defaultChannelId)) {
    channelSelect.value = cfg.defaultChannelId;
  } else {
    const savedCh = localStorage.getItem("channelId");
    if (savedCh && channels.some(c => c.id === savedCh)) {
      channelSelect.value = savedCh;
    }
  }

  const vol = cfg.volume ?? 0.5;
  volumeRange.value = vol;
  volumeLabel.textContent = vol.toFixed(2);
}

guildSelect.addEventListener("change", onGuildChange);
channelSelect.addEventListener("change", () => {
  localStorage.setItem("channelId", channelSelect.value);
});
refreshGuildsBtn.addEventListener("click", loadGuilds);

volumeRange.addEventListener("input", () => {
  volumeLabel.textContent = Number(volumeRange.value).toFixed(2);
});

async function resolveChannelId() {
  let channelId = channelSelect.value;

  if (useMyChannel.checked && sessionId) {
    try {
      const r = await fetch("/api/me/voice", {
        headers: { "X-Session-Id": sessionId }
      });
      if (r.ok) {
        const j = await r.json();
        inVoiceChannel = !!j.channelId;
        voiceStatusKnown = true;
        if (j.channelId) channelId = j.channelId;
      } else {
        inVoiceChannel = false;
        voiceStatusKnown = true;
      }
    } catch {
      inVoiceChannel = false;
      voiceStatusKnown = true;
    } finally {
      updateVoiceBlockerUI();
    }
  } else {
    inVoiceChannel = true;
    voiceStatusKnown = true;
    updateVoiceBlockerUI();
  }

  return channelId;
}

/* =========================
   USE MY VC OVERRIDE
   ========================= */

function syncUseMyVcUI() {
  const on = useMyChannel.checked && !!sessionId;
  channelSelect.disabled = on;
  channelSelect.style.opacity = on ? "0.5" : "1";
  channelSelect.title = on ? "Overridden by your current voice channel" : "";
  if (on) {
    refreshVoiceStatus();
  } else {
    inVoiceChannel = false;
    voiceStatusKnown = true;
    updateVoiceBlockerUI();
  }
}
useMyChannel.addEventListener("change", syncUseMyVcUI);

async function refreshVoiceStatus() {
  if (!useMyChannel.checked || !sessionId) {
    inVoiceChannel = false;
    voiceStatusKnown = true;
    updateVoiceBlockerUI();
    return;
  }

  try {
    const r = await fetch("/api/me/voice", {
      headers: { "X-Session-Id": sessionId }
    });
    if (!r.ok) throw new Error("Voice check failed");
    const j = await r.json();
    inVoiceChannel = !!j.channelId;
    voiceStatusKnown = true;
  } catch {
    inVoiceChannel = false;
    voiceStatusKnown = true;
  } finally {
    updateVoiceBlockerUI();
  }
}

window.addEventListener("storage", async () => {
  sessionId = localStorage.getItem("sessionId") || null;
  if (sessionId) {
    useMyChannel.disabled = false;
    useMyChannel.title = "";
  } else {
    useMyChannel.checked = false;
    useMyChannel.disabled = true;
    useMyChannel.title = "Pair with Discord first to use this.";
  }
  syncUseMyVcUI();
  currentUserId = localStorage.getItem("userId") || null;
  await loadFavorites();
  await refreshLoginStatus();
});

/* =========================
   LOGIN / PAIRING
   ========================= */

getCodeBtn.addEventListener("click", async () => {
  try {
    const j = await fetchJSON("/api/auth/request-code", { method: "POST" });
    codeDisplay.style.display = "inline-block";
    codeDisplay.textContent = j.code;
    codeInput.value = j.code;

    loginText.innerHTML =
      `Run in Discord:<br/><code>/link code:${j.code}</code><br/>then click “Start session”.`;

    try {
      await navigator.clipboard.writeText(j.code);
      showToast("Code copied to clipboard");
    } catch {
      // clipboard might be blocked; ignore
    }
  } catch (e) {
    loginText.textContent = "Failed to get code: " + e.message;
  }
});

startSessionBtn.addEventListener("click", async () => {
  const code = codeInput.value.trim();
  if (!code) return;

  try {
    const j = await fetchJSON("/api/auth/start-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    sessionId = j.sessionId;
    currentUserId = j.userId || null;
    localStorage.setItem("sessionId", sessionId);
    if (currentUserId) localStorage.setItem("userId", currentUserId);
    localStorage.setItem("guildId", j.guildId);

    useMyChannel.disabled = false;
    useMyChannel.title = "";
    syncUseMyVcUI();
    setControlsEnabled(true);

    await loadFavorites();
    await loadGuilds();
    await refreshLoginStatus();
    applyFilters();
  } catch (e) {
    loginText.textContent = "Start session failed: " + e.message;
  }
});

async function refreshLoginStatus() {
  if (!sessionId) {
    loginTitle.textContent = "Log in";
    loginText.textContent = "Pair this browser with Discord.";
    loginMeta.innerHTML = "";
    howToText.style.display = "block";
    pairingControls.style.display = "block";
    setAvatar(guildAvatar, null);
    setAvatar(userAvatarEl, null);
    setControlsEnabled(false);
    await loadFavorites();
    return;
  }

  try {
    const j = await fetchJSON("/api/me/status", {
      headers: { "X-Session-Id": sessionId }
    });

    loginTitle.textContent = "Logged in";
    loginText.textContent = `${j.userTag} on ${j.guildName}`;
    currentUserId = j.userId || currentUserId;
    if (currentUserId) localStorage.setItem("userId", currentUserId);
    hasUploadRole = !!j.hasUploadRole;

    const uploadChip = j.hasUploadRole
      ? `<span class="role-chip ok">Upload role: yes</span>`
      : `<span class="role-chip no">Upload role: no (${j.uploadRoleName})</span>`;

    const adminChip = j.isAdmin
      ? `<span class="role-chip ok">Admin: yes</span>`
      : `<span class="role-chip no">Admin: no</span>`;

    loginMeta.innerHTML = `${uploadChip} ${adminChip}`;
    isAdmin = !!j.isAdmin;
    if (!isAdmin) voiceBarVisible = false;
    updateVoiceBarUI();
    updateUploadUI();
    await refreshVoiceStatus();
    setAvatar(guildAvatar, j.guildIcon);
    setAvatar(userAvatarEl, j.userAvatar);

    howToText.style.display = "none";
    pairingControls.style.display = "none";
    codeDisplay.style.display = "none";
    setControlsEnabled(true);
    await loadFavorites();
    applyFilters();
  } catch (err) {
    sessionId = null;
    localStorage.removeItem("sessionId");
    currentUserId = null;
    localStorage.removeItem("userId");

    loginTitle.textContent = "Log in";
    const msg = (err && err.message || "").toLowerCase();
    const notInServer = msg.includes("guild not found");
    loginText.textContent = notInServer
      ? "You must join the server before logging in."
      : "Session expired. Get a new code.";
    loginMeta.innerHTML = "";

    howToText.style.display = "block";
    pairingControls.style.display = "block";
    codeDisplay.style.display = "none";

    useMyChannel.checked = false;
    useMyChannel.disabled = true;
    useMyChannel.title = "Pair with Discord first to use this.";
    syncUseMyVcUI();
    setControlsEnabled(false);
    setAvatar(guildAvatar, null);
    setAvatar(userAvatarEl, null);
    isAdmin = false;
    voiceBarVisible = false;
    inVoiceChannel = false;
    voiceStatusKnown = true;
    hasUploadRole = false;
    updateVoiceBarUI();
    updateUploadUI();
    updateVoiceBlockerUI();
    await loadFavorites();
    applyFilters();
  }
}

/* =========================
   FILTERS / GRID
   ========================= */

function refreshFilters() {
  const cats = Array.from(new Set(sounds.map(s => s.category))).sort();
  categoryFilter.innerHTML =
    `<option value="all">All categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");

  const tags = Array.from(new Set(sounds.flatMap(s => s.tags || []))).sort((a,b)=>a.localeCompare(b));
  tagFilter.innerHTML =
    `<option value="all">All tags</option>` +
    tags.map(t => `<option value="${t}">${t}</option>`).join("");

  try {
    const savedSort = localStorage.getItem(SORT_KEY);
    if (savedSort && [...sortSelect.options].some(o => o.value === savedSort)) {
      sortSelect.value = savedSort;
    }
  } catch {}
}

function favoriteKey() {
  return `favorites_${currentUserId || "anon"}`;
}

async function loadFavorites() {
  // If logged in, fetch from server; fallback to local cache
  if (sessionId) {
    try {
      const j = await fetchJSON("/api/me/favorites", {
        headers: { "X-Session-Id": sessionId }
      });
      favorites = new Set(j.favorites || []);
      // mirror to local cache for quick reloads
      localStorage.setItem(favoriteKey(), JSON.stringify([...favorites]));
      return;
    } catch (err) {
      console.warn("Failed to fetch favorites from server, using local cache:", err.message);
    }
  }
  try {
    const raw = localStorage.getItem(favoriteKey());
    favorites = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    favorites = new Set();
  }
}

async function saveFavorites() {
  const list = [...favorites];
  try { localStorage.setItem(favoriteKey(), JSON.stringify(list)); } catch {}

  if (sessionId) {
    // fire-and-forget sync to server
    fetch("/api/me/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId
      },
      body: JSON.stringify({ favorites: list })
    }).catch(err => console.warn("Failed to save favorites to server:", err.message));
  }
}

function applyFilters() {
  if (searchInput.value.trim()) {
    sortSelect.value = "title";
  }
  localStorage.setItem(SORT_KEY, sortSelect.value);

  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const tagSel = tagFilter.value;

  filtered = sounds.filter(s => {
    const matchesQ =
      s.title.toLowerCase().includes(q) ||
      s.id.includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q));
    const matchesCat = cat === "all" || s.category === cat;
    const matchesTag = tagSel === "all" || (s.tags || []).includes(tagSel);
    const matchesFav = !favoritesOnly || favorites.has(s.id);
    return matchesQ && matchesCat && matchesTag && matchesFav;
  });

  const sortBy = sortSelect.value;
  filtered.sort((a, b) => {
    if (sortBy === "category") {
      return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    }
    if (sortBy === "tags") {
      const ta = (a.tags && a.tags[0]) ? a.tags[0].toLowerCase() : "";
      const tb = (b.tags && b.tags[0]) ? b.tags[0].toLowerCase() : "";
      return ta.localeCompare(tb) || a.title.localeCompare(b.title);
    }
    if (sortBy === "newest") {
      return (b.addedAt || 0) - (a.addedAt || 0);
    }
    return a.title.localeCompare(b.title);
  });

  render();
}

function render() {
  grid.innerHTML = filtered.map(s => `
    <div class="sound-card ${previewingId === s.id && !previewAudio.paused ? "is-previewing" : ""}"
         data-id="${s.id}">
      <div class="inner">
        <div class="card-top">
          <button class="fav-toggle ${favorites.has(s.id) ? "active" : ""}" data-id="${s.id}" aria-label="Toggle favorite">
            ${favorites.has(s.id) ? "★" : "☆"}
          </button>
   
         
        </div>
        <div class="sound-main">
          <div class="title truncated" title="${s.title}">${s.title}</div>
          <div class="meta">
            ${s.category}${s.tags?.length ? " • " + s.tags.join(", ") : ""}
          </div>

          <div class="sound-actions">
            <button class="preview-btn" data-id="${s.id}">
              ${previewingId === s.id && !previewAudio.paused ? "Stop" : "🎧"}
            </button>
            <span class="preview-indicator">
              ${previewingId === s.id && !previewAudio.paused ? "PLAYING" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".sound-card").forEach(card => {
    card.onclick = () => play(card.dataset.id);
  });

  grid.querySelectorAll(".fav-toggle").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      await saveFavorites();
      applyFilters();
    };
  });

  grid.querySelectorAll(".preview-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      preview(btn.dataset.id);
    };
  });
}

function preview(soundId) {
  if (voiceGateActive()) return;

  const s = sounds.find(x => x.id === soundId);
  if (!s) return;

  const url = s.fileUrl;

  if (previewingId === soundId && !previewAudio.paused) {
    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewingId = null;
    render();
    return;
  }

  previewingId = soundId;
  // apply sound volume if set, otherwise slider
  const vol = s.volume !== undefined ? s.volume : Number(volumeRange.value);
  if (currentPreviewVolume !== vol) {
    previewAudio.volume = Math.max(0, Math.min(1, vol));
    currentPreviewVolume = vol;
  }
  previewAudio.src = url;
  previewAudio.currentTime = 0;

  previewAudio.play()
    .then(() => render())
    .catch(() => {
      previewingId = null;
      render();
    });
}

previewAudio.addEventListener("ended", () => {
  previewingId = null;
  render();
});

async function play(soundId) {
  const guildId = guildSelect.value;
  const channelId = await resolveChannelId();
  if (voiceGateActive()) return;
  const mode = modeSelect.value;
  const volume = Number(volumeRange.value);

  await fetch("/api/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guildId, soundId, channelId, mode, volume })
  });
}

/* =========================
   YOUTUBE PLAY ONCE (inside modal)
   ========================= */

ytPlayBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const url = ytUrl.value.trim();
  if (!url) return;

  const channelId = await resolveChannelId();
  if (voiceGateActive()) return;
  const guildId = guildSelect.value;
  const volume = Number(volumeRange.value);

  ytStatus.textContent = "Downloading…";
  console.log("[YT] metadata request", url);

  try {
    const r = await fetch("/api/play-yt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId, channelId, url, volume })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "YouTube play failed.");

    ytStatus.innerHTML = `Now playing: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    ytUrl.value = "";
  } catch (err) {
    ytStatus.textContent = err.message;
  } finally {
    setTimeout(() => { ytStatus.textContent = ""; }, 6000);
  }
});

/* =========================
   QUEUE
   ========================= */

queueBtn.addEventListener("click", async () => {
  const guildId = guildSelect.value;
  const channelId = await resolveChannelId();
  if (voiceGateActive()) return;
  if (queueBox.dataset.visible === "true") {
    queueBox.dataset.visible = "false";
    queueBox.innerHTML = "";
    queueBox.style.display = "none";
    queueBtn.textContent = "Show Queue";
    return;
  }

  const q = await fetchJSON(`/api/queue/${guildId}?channelId=${channelId}`);
  queueBox.innerHTML = q.length
    ? q.map((x, i) => `<div>${i + 1}. ${x.soundId}</div>`).join("")
    : "<em>Queue empty</em>";
  queueBox.dataset.visible = "true";
  queueBox.style.display = "block";
  queueBtn.textContent = "Hide Queue";
});

skipBtn.addEventListener("click", async () => {
  const guildId = guildSelect.value;
  const channelId = await resolveChannelId();
  if (voiceGateActive()) return;
  if (!guildId || !channelId) return;
  await fetch("/api/skip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guildId, channelId })
  });
});

stopBtn.addEventListener("click", async () => {
  const guildId = guildSelect.value;
  const channelId = await resolveChannelId();
  if (voiceGateActive()) return;
  if (!guildId || !channelId) return;
  await fetch("/api/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guildId, channelId })
  });
});

searchInput.addEventListener("input", applyFilters);
sortSelect.addEventListener("change", applyFilters);
categoryFilter.addEventListener("change", applyFilters);
tagFilter.addEventListener("change", applyFilters);
favoritesToggle.addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  favoritesToggle.classList.toggle("active", favoritesOnly);
  favoritesToggle.textContent = favoritesOnly ? "★ Favorites" : "☆ Favorites";
  applyFilters();
});

loadGuilds();
refreshFilters();
applyFilters();
refreshLoginStatus();
syncUseMyVcUI();
setControlsEnabled(!!sessionId);
