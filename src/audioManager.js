// src/audioManager.js
const fs = require("fs");
const path = require("path");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  demuxProbe,
} = require("@discordjs/voice");

const { SOUNDS_DIR, IDLE_VC_TIMEOUT_MS } = require("./config");
const { getSounds } = require("./sounds");

// ============================================================
// Helpers / file resolution (JSON categories without moving files)
// ============================================================

function resolveSoundPath(s, allSounds) {
  const rawCat = (s.category && String(s.category).trim()) || "uncategorized";
  const category = rawCat.toLowerCase();

  let filename = s.file && String(s.file).trim();

  if (!filename && s.fileUrl) {
    try { filename = path.basename(String(s.fileUrl)); } catch {}
  }

  if (!filename) filename = `${s.id}.mp3`;

  const candidates = [];

  if (category !== "uncategorized") {
    candidates.push(path.join(SOUNDS_DIR, rawCat, filename));
  }

  candidates.push(path.join(SOUNDS_DIR, filename));
  candidates.push(path.join(SOUNDS_DIR, "uncategorized", filename));

  const cats = Array.from(new Set(allSounds.map(x => x.category).filter(Boolean)));
  for (const c of cats) {
    candidates.push(path.join(SOUNDS_DIR, c, filename));
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return candidates[0] || path.join(SOUNDS_DIR, filename);
}

async function buildResource(soundId, volume = 0.5) {
  const sounds = getSounds();
  const s = sounds.find(x => x.id === soundId);
  if (!s) throw new Error(`Unknown sound: ${soundId}`);

  const filePath = resolveSoundPath(s, sounds);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for sound '${soundId}': ${filePath}`);
  }

  const stream = fs.createReadStream(filePath);
  const probe = await demuxProbe(stream);

  const resource = createAudioResource(probe.stream, {
    inputType: probe.type,
    inlineVolume: true,
  });

  resource.volume.setVolume(volume);
  return resource;
}

async function buildResourceFromFile(filePath, volume = 0.5) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stream = fs.createReadStream(filePath);
  const probe = await demuxProbe(stream);

  const resource = createAudioResource(probe.stream, {
    inputType: probe.type,
    inlineVolume: true,
  });

  resource.volume.setVolume(volume);
  return resource;
}

async function buildResourceForItem(item) {
  if (item.filePath) {
    return buildResourceFromFile(item.filePath, item.volume ?? 0.5);
  }
  return buildResource(item.soundId, item.volume ?? 0.5);
}

function cleanupItem(item) {
  if (!item || !item.cleanupPaths) return;
  for (const p of item.cleanupPaths) {
    if (!p) continue;
    fs.unlink(p, () => {});
  }
}

// ============================================================
// ONE CONNECTION PER GUILD ENFORCEMENT
// ============================================================

const guildActiveKey = new Map(); // guildId -> stateKey that currently owns voice

function stateKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function killOtherConnectionsInGuild(guildId, keepKey = null) {
  // stop normal states
  for (const [key, st] of states.entries()) {
    if (st.guild.id !== guildId) continue;
    if (key === keepKey) continue;
    cleanupState(key);
  }
  // stop loop states
  for (const [key, st] of loopStates.entries()) {
    if (st.guild.id !== guildId) continue;
    if (key === keepKey) continue;
    stopLoop(guildId, st.voiceChannel.id);
  }
}

// ============================================================
// Normal queue/interrupt states
// Keyed by `${guildId}:${channelId}`
// ============================================================

const states = new Map();

function ensureState(guild, voiceChannel) {
  const key = stateKey(guild.id, voiceChannel.id);
  if (states.has(key)) return states.get(key);

  // enforce single VC per guild
  killOtherConnectionsInGuild(guild.id, key);

  const connection = joinVoiceChannel({
    guildId: guild.id,
    channelId: voiceChannel.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const st = {
    key,
    guild,
    voiceChannel,
    connection,
    player,
    queue: [],
    playing: false,
    current: null,
    idleTimer: null,
  };

  player.on("stateChange", (oldS, newS) => {
    if (newS.status === AudioPlayerStatus.Idle) {
      cleanupItem(st.current);
      st.current = null;
      st.playing = false;
      playNext(st);
    }
  });

  connection.on("stateChange", (oldS, newS) => {
    if (newS.status === VoiceConnectionStatus.Disconnected) {
      cleanupState(key);
    }
  });

  states.set(key, st);
  guildActiveKey.set(guild.id, key);
  return st;
}

function clearIdleTimer(st) {
  if (st?.idleTimer) {
    clearTimeout(st.idleTimer);
    st.idleTimer = null;
  }
}

async function playNext(st) {
  if (st.playing) return;
  const next = st.queue.shift();
  if (!next) {
    clearIdleTimer(st);
    st.idleTimer = setTimeout(() => cleanupState(st.key), IDLE_VC_TIMEOUT_MS);
    return;
  }

  st.playing = true;
  st.current = next;
  const res = await buildResourceForItem(next);
  st.player.play(res);
}

function cleanupState(key) {
  const st = states.get(key);
  if (!st) return;
  clearIdleTimer(st);
  try { st.player.stop(); } catch {}
  try { st.connection.destroy(); } catch {}
  states.delete(key);

  if (guildActiveKey.get(st.guild.id) === key) {
    guildActiveKey.delete(st.guild.id);
  }
}

async function playSound({
  guild,
  voiceChannel,
  soundId,
  mode = "queue",
  volumeOverride = null,
  requestedBy = "unknown",
}) {
  // Validate the sound up front so we don't queue invalid items that would crash later
  const sounds = getSounds();
  const sound = sounds.find(x => x.id === soundId);
  if (!sound) {
    throw new Error(`Unknown sound: ${soundId}`);
  }
  const filePath = resolveSoundPath(sound, sounds);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for sound '${soundId}': ${filePath}`);
  }

  const st = ensureState(guild, voiceChannel);
  clearIdleTimer(st);
  const volume = volumeOverride ?? 0.5;

  if (mode === "interrupt") {
    st.queue = [];
    st.playing = true;
    cleanupItem(st.current);
    st.current = { soundId, volume };
    const res = await buildResource(soundId, volume);
    st.player.play(res);
    return;
  }

  st.queue.push({ soundId, volume, requestedBy });
  if (!st.playing) playNext(st);
}

function getQueue(guildId, channelId) {
  const key = stateKey(guildId, channelId);
  const st = states.get(key);
  return st ? st.queue : [];
}

function nudgeQueue(guildId, channelId) {
  const st = states.get(stateKey(guildId, channelId));
  if (st && !st.playing) {
    playNext(st);
  }
}

// ============================================================
// Loop channel states (independent player, but still 1 VC per guild)
// ============================================================

const loopStates = new Map();

function ensureLoopState(guild, voiceChannel) {
  const key = stateKey(guild.id, voiceChannel.id);
  if (loopStates.has(key)) return loopStates.get(key);

  // enforce single VC per guild (loop has priority)
  killOtherConnectionsInGuild(guild.id, key);

  const connection = joinVoiceChannel({
    guildId: guild.id,
    channelId: voiceChannel.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const st = {
    key,
    guild,
    voiceChannel,
    connection,
    player,
    running: false,
    soundId: null,
    volume: 0.5,
  };

  connection.on("stateChange", (oldS, newS) => {
    if (newS.status === VoiceConnectionStatus.Disconnected) {
      stopLoop(guild.id, voiceChannel.id);
    }
  });

  loopStates.set(key, st);
  guildActiveKey.set(guild.id, key);
  return st;
}

async function startLoop({ guild, voiceChannel, soundId, volume = 0.5 }) {
  const st = ensureLoopState(guild, voiceChannel);
  if (st.running && st.soundId === soundId) return;

  st.running = true;
  st.soundId = soundId;
  st.volume = volume;

  await entersState(st.connection, VoiceConnectionStatus.Ready, 20_000);

  const playOne = async () => {
    if (!st.running) return;
    try {
      const res = await buildResource(soundId, volume);
      st.player.play(res);
    } catch (e) {
      console.log("[LOOP] failed to play resource:", e.message);
      st.running = false;
    }
  };

  st.player.removeAllListeners("stateChange");
  st.player.on("stateChange", (oldS, newS) => {
    if (!st.running) return;
    if (newS.status === AudioPlayerStatus.Idle) {
      playOne();
    }
  });

  await playOne();
  console.log("[LOOP] started in", guild.id, voiceChannel.id, soundId);
}

function stopLoop(guildId, channelId) {
  const key = stateKey(guildId, channelId);
  const st = loopStates.get(key);
  if (!st) return;

  st.running = false;
  try { st.player.stop(); } catch {}
  try { st.connection.destroy(); } catch {}
  loopStates.delete(key);

  if (guildActiveKey.get(guildId) === key) {
    guildActiveKey.delete(guildId);
  }

  console.log("[LOOP] stopped in", guildId, channelId);
}

function isLooping(guildId, channelId) {
  return loopStates.has(stateKey(guildId, channelId));
}

function stopPlayback(guildId, channelId) {
  const key = stateKey(guildId, channelId);

  // stop loop if present
  const loop = loopStates.get(key);
  if (loop) stopLoop(guildId, channelId);

  const st = states.get(key);
  if (!st) return false;

  st.queue.forEach(cleanupItem);
  st.queue = [];
  cleanupItem(st.current);
  st.current = null;
  st.playing = false;
  try { st.player.stop(); } catch {}
  return true;
}

function skipCurrent(guildId, channelId) {
  const key = stateKey(guildId, channelId);
  const st = states.get(key);
  if (!st) return false;

  cleanupItem(st.current);
  st.current = null;
  st.playing = false;
  try { st.player.stop(); } catch {}
  return true;
}

module.exports = {
  ensureState,
  playSound,
  getQueue,
  nudgeQueue,
  startLoop,
  stopLoop,
  isLooping,
  stopPlayback,
  skipCurrent,
};
