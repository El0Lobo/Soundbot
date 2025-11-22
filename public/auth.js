export async function ensureSession() {
  let sessionId = localStorage.getItem("sessionId");
  if (sessionId) return sessionId;

  const codeBox = document.getElementById("codeBox");
  const getCodeBtn = document.getElementById("getCodeBtn");
  const startSessionBtn = document.getElementById("startSessionBtn");

  getCodeBtn.onclick = async () => {
    const r = await fetch("/api/auth/request-code", { method:"POST", headers:{ "Content-Type":"application/json" }, body:"{}" });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "failed");
    codeBox.innerHTML = `Code: <strong>${j.code}</strong> (run /link code:${j.code} in Discord)`;
    startSessionBtn.disabled = false;
    startSessionBtn.dataset.code = j.code;
  };

  startSessionBtn.onclick = async () => {
    const code = startSessionBtn.dataset.code;
    const r = await fetch("/api/auth/start-session", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ code })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "failed");
    localStorage.setItem("sessionId", j.sessionId);
    localStorage.setItem("sessionGuildId", j.guildId);
    codeBox.innerHTML = "Session active.";
    sessionId = j.sessionId;
  };

  return null;
}
