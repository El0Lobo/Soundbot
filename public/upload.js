import { ensureSession } from "./auth.js";

const form = document.getElementById("uploadForm");
const status = document.getElementById("status");
const preview = document.getElementById("preview");

await ensureSession();

form.file.onchange = () => {
  const f = form.file.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  preview.src = url;
  preview.style.display = "block";
};

form.onsubmit = async (e) => {
  e.preventDefault();
  const sessionId = localStorage.getItem("sessionId");
  if (!sessionId) return alert("Link Discord first.");

  const fd = new FormData(form);
  status.textContent = "Uploading...";
  const r = await fetch("/api/upload-file", {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: fd
  });
  const j = await r.json();
  if (!r.ok) {
    status.textContent = j.error || "Upload failed.";
    return;
  }
  status.textContent = `Saved as soundId: ${j.soundId}`;
  form.reset();
  preview.style.display = "none";
};
