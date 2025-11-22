// src/tunnel.js
const fs = require("fs");
const { spawn } = require("child_process");
const { TUNNEL_FILE } = require("./config");

let current = null;
let proc = null;
const listeners = [];

function loadSavedTunnel() {
  try {
    const raw = fs.readFileSync(TUNNEL_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data && data.url) {
      try {
        data.url = new URL(data.url).origin;
      } catch {}
      current = data;
      return data;
    }
  } catch {}
  return null;
}

function persist(url) {
  current = { url, timestamp: Date.now() };
  try {
    fs.writeFileSync(TUNNEL_FILE, JSON.stringify(current, null, 2));
  } catch (err) {
    console.warn("[TUNNEL] failed to write tunnel file:", err.message);
  }
  listeners.forEach(fn => {
    try { fn(current); } catch (e) { console.warn("[TUNNEL] listener error:", e.message); }
  });
}

function parseUrl(line) {
  // capture the trycloudflare URL anywhere in the line
  const match = line.match(/https?:\/\/[\w.-]+\.trycloudflare\.com\S*/i);
  if (!match) return null;
  const raw = match[0].trim();
  try {
    // Normalize to origin only so bot messages stay clean
    return new URL(raw).origin;
  } catch {
    // fallback: strip path manually
    const withoutPath = raw.split("/").slice(0, 3).join("/");
    return withoutPath || raw;
  }
}

function handleLine(line) {
  // chunk may contain multiple lines; scan each
  const parts = line.split(/\r?\n/);
  for (const part of parts) {
    const url = parseUrl(part);
    if (url) {
      console.log("[TUNNEL URL]", url);
      persist(url);
    }
  }
}

function startTunnel(targetUrl = "http://localhost:3000") {
  if (proc) return proc;
  loadSavedTunnel();

  console.log("[TUNNEL] launching cloudflared for", targetUrl);

  try {
    proc = spawn("cloudflared", ["tunnel", "--url", targetUrl], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    console.log("[TUNNEL] cloudflared pid:", proc.pid);
  } catch (err) {
    console.warn("[TUNNEL] failed to spawn cloudflared:", err.message);
    return null;
  }

  proc.stdout.on("data", d => {
    const line = d.toString();
    console.log("[TUNNEL OUT]", line.trim());
    handleLine(line);
  });
  proc.stderr.on("data", d => {
    const line = d.toString();
    console.log("[TUNNEL ERR]", line.trim());
    handleLine(line);
  });

  proc.on("close", code => {
    proc = null;
    console.log("[TUNNEL] cloudflared exited with code", code);
  });

  return proc;
}

function stopTunnel() {
  if (!proc) return;
  try { proc.kill("SIGTERM"); } catch {}
  proc = null;
}

function onTunnelUrl(cb) {
  if (current && current.url) cb(current);
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function getCurrentTunnel() {
  return current;
}

// prime cached value if persisted
loadSavedTunnel();

module.exports = {
  startTunnel,
  stopTunnel,
  onTunnelUrl,
  getCurrentTunnel,
  loadSavedTunnel,
};
