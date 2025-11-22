// src/sounds.js
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { SOUNDS_DIR, META_FILE } = require("./config");

const DEFAULT_CATEGORY = "uncategorized";

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

function sanitizeCategoryName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCategories(input, fallback = DEFAULT_CATEGORY) {
  let list = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === "string") {
    list = input.split(",").map(x => x.trim()).filter(Boolean);
  } else if (input) {
    list = [String(input)];
  }

  const cleaned = Array.from(new Set(
    list
      .map(sanitizeCategoryName)
      .filter(Boolean)
  ));

  if (cleaned.length === 0 && fallback) return [sanitizeCategoryName(fallback) || DEFAULT_CATEGORY];
  return cleaned;
}

function normalizeTags(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : String(input).split(",");
  return Array.from(new Set(
    list
      .map(t => String(t || "").trim())
      .filter(Boolean)
  ));
}

function applyMetaNormalization(entry, fallbackCategory = DEFAULT_CATEGORY) {
  const categories = normalizeCategories(entry.categories ?? entry.category, fallbackCategory);
  entry.categories = categories;
  entry.category = categories[0] || fallbackCategory;
  entry.tags = normalizeTags(entry.tags);
  if (entry.volume !== undefined) {
    entry.volume = Number(entry.volume);
  }
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
      const fallbackCategory = sanitizeCategoryName(folderCategory || DEFAULT_CATEGORY) || DEFAULT_CATEGORY;

      // Seed JSON if missing
      if (!existing) {
        meta[id] = {
          title: item.name.replace(ext, ""),
          categories: [fallbackCategory],
          category: fallbackCategory,
          tags: []
        };
        metaDirty = true;
      }

      const m = meta[id];
      const before = JSON.stringify(m);
      applyMetaNormalization(m, fallbackCategory);
      if (!metaDirty && JSON.stringify(m) !== before) metaDirty = true;

      out.push({
        id,
        title: m.title || item.name.replace(ext, ""),
        filePath: fullPath,
        category: m.category,
        categories: m.categories,
        tags: m.tags,
        volume: m.volume,
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
        categories: s.categories,
        tags: s.tags,
        volume: s.volume,
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
  meta[id] = meta[id] || { title: id, categories: [DEFAULT_CATEGORY], category: DEFAULT_CATEGORY, tags: [] };

  if (patch.title !== undefined) meta[id].title = patch.title;
  if (patch.categories !== undefined) meta[id].categories = normalizeCategories(patch.categories);
  if (patch.category !== undefined) meta[id].categories = normalizeCategories(patch.category);
  if (patch.tags !== undefined) meta[id].tags = normalizeTags(patch.tags);
  if (patch.volume !== undefined) meta[id].volume = patch.volume;

  applyMetaNormalization(meta[id]);

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

function renameCategory(oldName, newName) {
  const from = sanitizeCategoryName(oldName);
  const to = sanitizeCategoryName(newName);
  if (!from || !to) return false;

  loadMeta();
  let changed = false;

  for (const id of Object.keys(meta)) {
    const entry = meta[id];
    const categories = normalizeCategories(entry.categories ?? entry.category);
    const next = [];
    categories.forEach(cat => {
      const normalized = sanitizeCategoryName(cat);
      if (!normalized) return;
      if (normalized.toLowerCase() === from.toLowerCase()) {
        if (!next.some(x => x.toLowerCase() === to.toLowerCase())) next.push(to);
        changed = true;
      } else if (!next.some(x => x.toLowerCase() === normalized.toLowerCase())) {
        next.push(normalized);
      }
    });
    if (next.length === 0) next.push(DEFAULT_CATEGORY);
    entry.categories = next;
    applyMetaNormalization(entry);
  }

  if (changed) {
    saveMeta();
    scanSounds();
  }
  return changed;
}

function deleteCategory(name, fallback = DEFAULT_CATEGORY) {
  const target = sanitizeCategoryName(name);
  if (!target) return false;

  loadMeta();
  let changed = false;

  for (const id of Object.keys(meta)) {
    const entry = meta[id];
    const categories = normalizeCategories(entry.categories ?? entry.category);
    const next = categories.filter(c => c.toLowerCase() !== target.toLowerCase());
    if (next.length !== categories.length) changed = true;
    if (next.length === 0) next.push(fallback);
    entry.categories = next;
    applyMetaNormalization(entry);
  }

  if (changed) {
    saveMeta();
    scanSounds();
  }
  return changed;
}

function renameTag(oldTag, newTag) {
  const from = String(oldTag || "").trim();
  const to = String(newTag || "").trim();
  if (!from || !to) return false;

  loadMeta();
  let changed = false;

  for (const id of Object.keys(meta)) {
    const entry = meta[id];
    const tags = normalizeTags(entry.tags);
    const next = tags.map(t => t.toLowerCase() === from.toLowerCase() ? to : t);
    if (next.join("|") !== tags.join("|")) changed = true;
    entry.tags = Array.from(new Set(next));
  }

  if (changed) {
    saveMeta();
    scanSounds();
  }
  return changed;
}

function deleteTag(tag) {
  const target = String(tag || "").trim();
  if (!target) return false;

  loadMeta();
  let changed = false;

  for (const id of Object.keys(meta)) {
    const entry = meta[id];
    const tags = normalizeTags(entry.tags);
    const next = tags.filter(t => t.toLowerCase() !== target.toLowerCase());
    if (next.length !== tags.length) changed = true;
    entry.tags = next;
  }

  if (changed) {
    saveMeta();
    scanSounds();
  }
  return changed;
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
  normalizeId,
  normalizeCategories,
  normalizeTags,
  renameCategory,
  deleteCategory,
  renameTag,
  deleteTag
};
