const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const { z } = require("zod");

const {
  getSounds,
  updateSoundMeta,
  scanSounds,
  normalizeId,
  deleteSound,
  normalizeCategories,
  normalizeTags,
  renameCategory,
  deleteCategory,
  renameTag,
  deleteTag
} = require("./sounds");
const { playSound, getQueue, stopPlayback, skipCurrent } = require("./audioManager");
const { getGuildConfig } = require("./guildStore");
const { setIntro, setOutro, getUserConfig, setFavorites, getFavorites } = require("./userStore");
const { downloadYoutubeAudio, fetchPipedMetadata } = require("./youtube");
const { convertToMp3, trimAudio } = require("./ffmpeg");
const { playYoutubeOnce } = require("./ytPlay");
const { startMovePoll } = require("./movePoll");
const { ADMIN_USER_IDS, UPLOAD_ALLOWED_ROLE, SOUNDS_DIR, TMP_DIR, DEFAULT_BOT_CHANNEL_ID } = require("./config");

function createWebServer(client, port = 3000, onSoundsChange) {
  const app = express();
  app.use(express.json());
  // serve lowpoly as module from public (module script in index.html)
  app.use("/src", express.static(__dirname, {
    extensions: ["js"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) res.type("application/javascript");
    }
  }));

  app.use("/sound-files", express.static(SOUNDS_DIR));
  app.use(express.static(path.join(__dirname, "..", "public")));

  const server = http.createServer(app);
  const io = new Server(server);

  function broadcastSounds() { io.emit("sounds:update", getSounds()); }
  onSoundsChange(() => broadcastSounds());

  io.on("connection", socket => {
    socket.emit("sounds:update", getSounds());
  });

  // --- pairing / sessions ---
  const pendingCodes = new Map(); // code -> { userId, guildId, expiresAt }
  const sessions = new Map(); // sid -> { userId, guildId }

  const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));
  const randomSession = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  app.post("/api/auth/request-code", (req, res) => {
    const code = randomCode();
    pendingCodes.set(code, { userId: null, guildId: null, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.json({ code, expiresAt: pendingCodes.get(code).expiresAt });
  });

  app.post("/api/auth/start-session", (req, res) => {
    const { code } = req.body || {};
    const entry = pendingCodes.get(code);
    if (!entry || entry.expiresAt < Date.now() || !entry.userId) {
      return res.status(400).json({ error: "Not confirmed yet" });
    }
    const sid = randomSession();
    sessions.set(sid, { userId: entry.userId, guildId: entry.guildId });
    pendingCodes.delete(code);
    res.json({ sessionId: sid, userId: entry.userId, guildId: entry.guildId });
  });

  function requireSession(req, res, next) {
    const sid = req.headers["x-session-id"];
    if (!sid || !sessions.has(sid)) return res.status(401).json({ error: "Unauthorized" });
    req.session = sessions.get(sid);
    next();
  }

  function requireAdmin(req, res, next) {
    const sid = req.headers["x-session-id"];
    if (!sid || !sessions.has(sid)) return res.status(401).json({ error: "Unauthorized" });
    const sess = sessions.get(sid);
    if (ADMIN_USER_IDS.length && !ADMIN_USER_IDS.includes(sess.userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.session = sess;
    next();
  }

  async function requireUploadRole(req, res, next) {
    const { userId, guildId } = req.session;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(400).json({ error: "Guild not found for session. Pair from target server." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(403).json({ error: "Member not found." });

    const hasRole = member.roles.cache.some(r => r.name === UPLOAD_ALLOWED_ROLE);
    if (!hasRole) return res.status(403).json({ error: `You need role ${UPLOAD_ALLOWED_ROLE} to upload/import.` });

    req.member = member;
    next();
  }

  // --- basic api ---
  app.get("/api/sounds", (req, res) => res.json(getSounds()));

  app.get("/api/guilds", async (req, res) => {
    res.json(client.guilds.cache.map(g => ({ id: g.id, name: g.name })));
  });

  app.get("/api/guilds/:guildId/channels", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });

    const chans = guild.channels.cache
      .filter(c => c.isVoiceBased())
      .map(c => ({ id: c.id, name: c.name }));

    res.json(chans);
  });

  app.get("/api/guilds/:guildId/config", (req, res) => {
    res.json(getGuildConfig(req.params.guildId));
  });

  // play from UI
  const PlaySchema = z.object({
    guildId: z.string(),
    soundId: z.string(),
    channelId: z.string().optional(),
    mode: z.enum(["queue", "interrupt"]).optional(),
    volume: z.number().min(0).max(1).optional()
  });

  app.post("/api/play", async (req, res) => {
    const parsed = PlaySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { guildId, soundId, channelId, mode, volume } = parsed.data;

    try {
      const guild = await client.guilds.fetch(guildId);
      const cfg = getGuildConfig(guildId);
      const vcId = channelId || cfg.defaultChannelId;
      if (!vcId) throw new Error("No voice channel selected or default set.");

      const voiceChannel = await guild.channels.fetch(vcId);
      if (!voiceChannel || !voiceChannel.isVoiceBased()) throw new Error("Invalid voice channel.");

      await playSound({
        guild,
        voiceChannel,
        soundId,
        mode: mode || "queue",
        volumeOverride: volume ?? null,
        requestedBy: "web"
      });

      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.get("/api/queue/:guildId", (req, res) => {
    const { guildId } = req.params;
    const channelId = req.query.channelId;
    if (!channelId) return res.json([]);
    res.json(getQueue(guildId, channelId));
  });

  const ControlSchema = z.object({
    guildId: z.string(),
    channelId: z.string()
  });

  app.post("/api/stop", (req, res) => {
    const parsed = ControlSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { guildId, channelId } = parsed.data;

    const ok = stopPlayback(guildId, channelId);
    if (!ok) return res.status(404).json({ ok: false, error: "No active playback found." });
    res.json({ ok: true });
  });

  app.post("/api/skip", (req, res) => {
    const parsed = ControlSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { guildId, channelId } = parsed.data;

    const ok = skipCurrent(guildId, channelId);
    if (!ok) return res.status(404).json({ ok: false, error: "No active playback found." });
    res.json({ ok: true });
  });

  // user's current VC
  app.get("/api/me/voice", requireSession, async (req, res) => {
    try {
      const { userId, guildId } = req.session;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in session.");

      const member = await guild.members.fetch(userId);
      const vc = member.voice.channel;

      res.json({
        ok: true,
        channelId: vc?.id || null,
        channelName: vc?.name || null
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // members in current VC
  app.get("/api/me/voice-members", requireSession, async (req, res) => {
    try {
      const { userId, guildId } = req.session;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in session.");

      const member = await guild.members.fetch(userId);
      const vc = member.voice.channel;
      if (!vc) return res.status(400).json({ error: "You are not in a voice channel." });

      const members = vc.members
        .filter(m => !m.user.bot && m.id !== userId)
        .map(m => ({ id: m.id, name: m.displayName }));

      res.json({
        channelId: vc.id,
        channelName: vc.name,
        members
      });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  // ✅ NEW: session + role status for UI
  app.get("/api/me/status", requireSession, async (req, res) => {
    try {
      const { userId, guildId } = req.session;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in session.");

      const member = await guild.members.fetch(userId);
      const userTag = member.user?.tag || member.user?.username || String(userId);
      const userAvatar = member.user?.displayAvatarURL?.({ size: 128 }) || null;
      const guildIcon = guild.iconURL?.({ size: 128 }) || null;

      const hasUploadRole = member.roles.cache.some(r => r.name === UPLOAD_ALLOWED_ROLE);
      const isAdmin = ADMIN_USER_IDS.length ? ADMIN_USER_IDS.includes(userId) : false;

      res.json({
        ok: true,
        userId,
        userTag,
        guildId,
        guildName: guild.name,
        userAvatar,
        guildIcon,
        hasUploadRole,
        uploadRoleName: UPLOAD_ALLOWED_ROLE,
        isAdmin
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // favorites per user (persisted)
  app.get("/api/me/favorites", requireSession, (req, res) => {
    const favs = getFavorites(req.session.userId);
    res.json({ favorites: favs });
  });

  const FavoritesSchema = z.object({
    favorites: z.array(z.string())
  });

  app.post("/api/me/favorites", requireSession, (req, res) => {
    const parsed = FavoritesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    setFavorites(req.session.userId, parsed.data.favorites);
    res.json({ ok: true });
  });

  // play yt once
  const PlayYTSchema = z.object({
    guildId: z.string(),
    channelId: z.string(),
    url: z.string().min(5),
    volume: z.number().min(0).max(1).optional()
  });

  app.post("/api/play-yt", async (req, res) => {
    const parsed = PlayYTSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.message });
    }

    const { guildId, channelId, url, volume } = parsed.data;

    try {
      const guild = await client.guilds.fetch(guildId);
      const voiceChannel = await guild.channels.fetch(channelId);

      if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        throw new Error("Invalid voice channel.");
      }

      await playYoutubeOnce({
        guild,
        voiceChannel,
        url,
        volume: volume ?? getGuildConfig(guildId).volume ?? 0.5
      });

      // Notify the configured bot text channel, if provided
      if (DEFAULT_BOT_CHANNEL_ID) {
        try {
          const textChannel = client.channels.cache.get(DEFAULT_BOT_CHANNEL_ID) ||
            await client.channels.fetch(DEFAULT_BOT_CHANNEL_ID).catch(() => null);
          if (textChannel && textChannel.isTextBased()) {
            await textChannel.send(`Now playing: ${url}`);
          }
        } catch (err) {
          console.warn("[PLAY-YT] failed to send now playing message:", err?.message);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Move-by-vote into loop channel
  const MovePollSchema = z.object({
    targetId: z.string()
  });

  app.post("/api/vc/move-poll", requireSession, async (req, res) => {
    const parsed = MovePollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    try {
      const { userId, guildId } = req.session;
      const guild = await client.guilds.fetch(guildId);
      const result = await startMovePoll({
        guild,
        requesterId: userId,
        targetId: parsed.data.targetId
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  // --- Admin metadata patch ---
  const CategoriesField = z.union([z.string(), z.array(z.string())]);

  const PatchSchema = z.object({
    title: z.string().optional(),
    category: CategoriesField.optional(),
    categories: CategoriesField.optional(),
    tags: z.array(z.string()).optional(),
    volume: z.number().optional()
  });

  app.patch("/api/admin/sounds/:id", requireSession, requireUploadRole, (req, res) => {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const body = parsed.data;
    const patch = {
      title: body.title,
      tags: body.tags,
      volume: body.volume
    };
    if (body.categories !== undefined) {
      patch.categories = normalizeCategories(body.categories);
    } else if (body.category !== undefined) {
      patch.categories = normalizeCategories(body.category);
    }

    updateSoundMeta(req.params.id, patch);
    broadcastSounds();
    res.json({ ok: true });
  });

  app.delete("/api/admin/sounds/:id", requireAdmin, (req, res) => {
    const ok = deleteSound(req.params.id);
    if (!ok) return res.status(404).json({ error: "Sound not found" });
    broadcastSounds();
    res.json({ ok: true });
  });

  const RenameFieldSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1)
  });

  app.post("/api/admin/categories/rename", requireAdmin, (req, res) => {
    const parsed = RenameFieldSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const ok = renameCategory(parsed.data.from, parsed.data.to);
    broadcastSounds();
    res.json({ ok });
  });

  app.delete("/api/admin/categories/:name", requireAdmin, (req, res) => {
    const target = req.params.name;
    const removed = deleteCategory(target);
    broadcastSounds();
    res.json({ ok: true, removed });
  });

  app.post("/api/admin/tags/rename", requireAdmin, (req, res) => {
    const parsed = RenameFieldSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const ok = renameTag(parsed.data.from, parsed.data.to);
    broadcastSounds();
    res.json({ ok });
  });

  app.delete("/api/admin/tags/:name", requireAdmin, (req, res) => {
    const target = req.params.name;
    const removed = deleteTag(target);
    broadcastSounds();
    res.json({ ok: true, removed });
  });

  // --- Uploads ---
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const upload = multer({
    dest: TMP_DIR,
    limits: { fileSize: 20 * 1024 * 1024 }
  });

  const UploadSchema = z.object({
    title: z.string().min(1),
    category: CategoriesField.optional(),
    categories: CategoriesField.optional(),
    tags: z.string().optional()
  }).refine((data) => {
    const raw = data.categories ?? data.category;
    return normalizeCategories(raw, "").length > 0;
  }, {
    message: "Category is required"
  });

  app.post("/api/upload-file", requireSession, requireUploadRole, upload.single("file"), async (req, res) => {
    try {
      const parsed = UploadSchema.safeParse(req.body);
      if (!parsed.success) throw new Error(parsed.error.message);
      if (!req.file) throw new Error("No file uploaded.");

      const { title, tags } = parsed.data;
      const categories = normalizeCategories(parsed.data.categories ?? parsed.data.category);
      const outDir = SOUNDS_DIR;
      fs.mkdirSync(outDir, { recursive: true });

      const idBase = normalizeId(title);
      const outPath = path.join(outDir, `${idBase}.mp3`);
      await convertToMp3(req.file.path, outPath);

      updateSoundMeta(idBase, {
        title,
        categories,
        tags: normalizeTags(tags)
      });

      scanSounds();
      broadcastSounds();

      res.json({ ok: true, soundId: idBase });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    } finally {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
    }
  });

  // --- YouTube metadata ---
  app.get("/api/youtube/metadata", requireSession, requireUploadRole, async (req, res) => {
    try {
      const url = req.query.url;
      if (!url) throw new Error("Missing url");

      let meta = null;
      let warning = null;

      try {
        meta = await fetchPipedMetadata(url);
      } catch (err) {
        warning = err?.message || "Piped metadata failed";
        const id = require("./youtube").getVideoId(url);
        meta = {
          title: url,
          duration: 0,
          audioStreams: [],
          embedUrl: id ? `https://www.youtube.com/embed/${id}` : null
        };
      }

      return res.json({ ok: true, meta, warning });
    } catch (e) {
      console.error("[YT-META] error", e.message);
      const id = require("./youtube").getVideoId(req.query.url || "");
      return res.json({
        ok: true,
        meta: {
          title: req.query.url || "unknown",
          duration: 0,
          audioStreams: [],
          embedUrl: id ? `https://www.youtube.com/embed/${id}` : null
        },
        warning: e.message || "metadata unavailable"
      });
    }
  });

  // Download + trim from YouTube
  const YTTrimSchema = z.object({
    url: z.string().min(5),
    start: z.number().min(0),
    end: z.number().min(0),
    title: z.string().min(1),
    category: CategoriesField.optional(),
    categories: CategoriesField.optional(),
    tags: z.string().optional()
  }).refine((data) => {
    const raw = data.categories ?? data.category;
    return normalizeCategories(raw, "").length > 0;
  }, {
    message: "Category is required"
  });

  app.post("/api/youtube/import", requireSession, requireUploadRole, async (req, res) => {
    let tmpFile = null;
    try {
      const parsed = YTTrimSchema.safeParse(req.body);
      if (!parsed.success) throw new Error(parsed.error.message);

      const { url, start, end, title, tags } = parsed.data;
      const categories = normalizeCategories(parsed.data.categories ?? parsed.data.category);
      if (end <= start) throw new Error("End must be after start.");

      const dl = await downloadYoutubeAudio(url);
      tmpFile = dl.tmpFile;

      const outDir = SOUNDS_DIR;
      fs.mkdirSync(outDir, { recursive: true });

      const idBase = normalizeId(title);
      const outPath = path.join(outDir, `${idBase}.mp3`);

      await trimAudio(tmpFile, outPath, start, end);

      updateSoundMeta(idBase, {
        title,
        categories,
        tags: normalizeTags(tags)
      });

      scanSounds();
      broadcastSounds();

      res.json({ ok: true, soundId: idBase, via: dl.via });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    } finally {
      if (tmpFile) fs.unlink(tmpFile, () => {});
    }
  });

  // --- Intros / outros for everyone ---
  const IntroSchema = z.object({
    intro: z.string().nullable().optional(),
    outro: z.string().nullable().optional()
  });

  app.get("/api/me/intros", requireSession, (req, res) => {
    const cfg = getUserConfig(req.session.userId);
    res.json({ ok: true, cfg });
  });

  app.post("/api/me/intros", requireSession, (req, res) => {
    const parsed = IntroSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.message });

    if (parsed.data.intro !== undefined) setIntro(req.session.userId, parsed.data.intro);
    if (parsed.data.outro !== undefined) setOutro(req.session.userId, parsed.data.outro);

    res.json({ ok: true });
  });

  // Pages routing
  app.get("/upload", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "upload.html")));
  app.get("/import", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "import.html")));
  app.get("/intros", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "intros.html")));
  app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin.html")));

  server.listen(port, () => console.log(`Web UI on http://localhost:${port}`));

  return { app, server, io, pendingCodes };
}

module.exports = { createWebServer };
