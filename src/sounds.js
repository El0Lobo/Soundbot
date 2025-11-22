// src/sounds.js
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { SOUNDS_DIR, META_FILE } = require("./config");

// Any audio file types you want to allow/scan
const AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm"
]);

let meta = {};   // data/sounds.json content
let index = [];  // scanned files + resolved meta

function loadMeta() {
  try {
    meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch {
    meta = {};
  }
}

function saveMeta() {
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf8");
}

function normalizeId(filenameOrTitle) {
  return filenameOrTitle
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")     // drop extension if present
    .replace(/[^a-z0-9-_]/g, "_") // normalize
    .replace(/_+/g, "_")          // collapse repeats
    .replace(/^_+|_+$/g, "");     // trim underscores
}

/**
 * JSON-FIRST CATEGORY LOGIC:
 * - If JSON has category => use it.
 * - Else directory name (legacy fallback) => seed JSON with it.
 * - Else "uncategorized" => seed JSON with it.
 *
 * Files are NEVER moved automatically.
 */
function scanSounds() {
  loadMeta();
  const out = [];
  let metaDirty = false;

  function walk(dir, folderCategory = null) {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        walk(fullPath, item.name);
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;

      const id = normalizeId(item.name);
      const existing = meta[id];

      // fallback category only used if JSON missing
      const fallbackCategory = folderCategory || "uncategorized";

      // Seed JSON if missing
      if (!existing) {
        meta[id] = {
          title: item.name.replace(ext, ""),
          category: fallbackCategory,
          tags: []
        };
        metaDirty = true;
      }

      const m = meta[id];

      out.push({
        id,
        title: m.title || item.name.replace(ext, ""),
        filePath: fullPath,
        // JSON category wins always
        category: m.category || fallbackCategory,
        tags: Array.isArray(m.tags) ? m.tags : [],
        ext,
        addedAt: fs.statSync(fullPath).birthtimeMs || Date.now()
      });
    }
  }

  if (!fs.existsSync(SOUNDS_DIR)) {
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
  }

  walk(SOUNDS_DIR);

  if (metaDirty) saveMeta();

  index = out;
  return getSounds();
}

/**
 * Return lightweight list for UI/autocomplete.
 * Includes fileUrl that points to the REAL file path,
 * not a guessed /category/id.mp3 path.
 */
function getSounds() {
  return index
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(s => {
      const fileName = path.basename(s.filePath);

      // Compute relative path from SOUNDS_DIR so preview works for:
      // - flat files in sounds/
      // - nested folders
      const relDir = path.relative(SOUNDS_DIR, path.dirname(s.filePath));
      const relPath = relDir === ""
        ? fileName
        : path.join(relDir, fileName);

      // Use forward slashes for URLs on Windows
      const urlPath = relPath.split(path.sep).map(encodeURIComponent).join("/");

      return {
        id: s.id,
        title: s.title,
        category: s.category,
        tags: s.tags,
        ext: s.ext,
        addedAt: s.addedAt,

        // ✅ always correct preview URL
        fileUrl: `/sound-files/${urlPath}`
      };
    });
}

function getSoundById(id) {
  return index.find(s => s.id === id);
}

/**
 * Updates JSON metadata only (no moving/renaming files).
 */
function updateSoundMeta(id, patch) {
  loadMeta();
  meta[id] = meta[id] || { title: id, category: "uncategorized", tags: [] };

  if (patch.title !== undefined) meta[id].title = patch.title;
  if (patch.category !== undefined) meta[id].category = patch.category;
  if (patch.tags !== undefined) meta[id].tags = patch.tags;
  if (patch.volume !== undefined) meta[id].volume = patch.volume;

  saveMeta();
  scanSounds();
}

function deleteSound(id) {
  const sound = getSoundById(id);
  if (!sound) return false;

  try {
    if (fs.existsSync(sound.filePath)) {
      fs.unlinkSync(sound.filePath);
    }
  } catch (e) {
    // swallow file errors; we still clean meta/index
    console.error("Failed to delete sound file", sound.filePath, e);
  }

  loadMeta();
  delete meta[id];
  saveMeta();
  scanSounds();
  return true;
}

/**
 * Watches SOUNDS_DIR and rescans on changes.
 */
function watchSounds(onChange) {
  const watcher = chokidar.watch(SOUNDS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: true
  });

  const refresh = () => {
    scanSounds();
    onChange?.(getSounds());
  };

  watcher.on("add", refresh);
  watcher.on("unlink", refresh);
  watcher.on("addDir", refresh);
  watcher.on("unlinkDir", refresh);
  return watcher;
}

module.exports = {
  scanSounds,
  getSounds,
  getSoundById,
  updateSoundMeta,
  deleteSound,
  watchSounds,
  normalizeId
};
