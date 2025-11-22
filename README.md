# Upgraded Discord Soundbot + Web Soundboard

Includes:
- Web soundboard with search/sort/categories
- Upload any FFmpeg-supported audio (server converts to mp3)
- YouTube import: primary Piped API, fallback to local yt-dlp
- Waveform trimming UI (WaveSurfer.js)
- Local preview before save
- Intro/Outro sounds for every user
- Upload/import restricted to role "Karen-Manager"
- Admin metadata editor (paired session, optional admin whitelist)
- Slash commands for play/stop/skip/queue/volume/default channel/link/tunnel URL
- Optional loop channel: join a specific VC to auto-loop a sound
 - Optional Cloudflare tunnel auto-start (posts URL to your default bot channel; requires `cloudflared` in PATH)
 - Temp cleaner: clears `/tmp` on startup and every 5h (configurable)

## Important notes
### yt-dlp fallback
This zip does **not** include yt-dlp binary.  
If you want fallback to work, download yt-dlp and place it here:

- Windows: `bin/yt-dlp.exe`
- Linux/Mac: `bin/yt-dlp`

Get it from the official repo releases.

The app will automatically use it if Piped fails.

## Setup

```bash
npm install
cp .env.example .env
# fill .env with DISCORD_TOKEN, CLIENT_ID, DEFAULT_BOT_CHANNEL_ID, etc.
# install cloudflared and ensure it is on PATH if you want the tunnel feature
npm run deploy-commands
npm start
```

Web UI:
- Main soundboard: http://localhost:3000/
- Upload sounds: http://localhost:3000/upload
- YouTube import: http://localhost:3000/import
- Intro/Outro for users: http://localhost:3000/intros
- Admin metadata: http://localhost:3000/admin
  - Title/category/tags + per-sound volume (0–200%)

## Pairing / sessions
Pages that change data require you to link your Discord user:
1. Click "Get code"
2. Run `/link code:XXXXXX` in Discord
3. Click "Start session"

Upload/import additionally checks you have the `UPLOAD_ALLOWED_ROLE`.

Intro/outro page is open to everyone but still needs a session to know who you are.

## Loop channel (optional)
Configure in `.env`:
- `LOOP_CHANNEL_NAME` — voice channel name to watch
- `LOOP_SOUND_ID` — sound id to loop when someone joins
- `LOOP_VOLUME` — loop playback volume (0.0–1.0)
- `IDLE_VC_TIMEOUT_MS` — how long to stay in VC after last track ends (default 180000ms = 3min)
- `TMP_CLEAN_INTERVAL_HOURS` / `TMP_MAX_FILE_AGE_HOURS` — temp cleanup schedule and age threshold (default 5h)
