
PS C:\Users\Lobo\Desktop\Soundbot> npm start
Debugger listening on ws://127.0.0.1:63001/ca835382-22a8-47dc-8e8c-ece8319ad577
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.

> discord-soundbot-web-soundboard-upgraded@2.0.0 start
> node src/index.js

Debugger listening on ws://127.0.0.1:63009/c9d36a40-4d96-4d73-b64b-6885db03dc98
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.
[dotenv@17.2.3] injecting env (12) from .env -- tip: 🔐 prevent committing .env to code: https://dotenvx.com/precommit
[VOICE] libsodium ready
[FFMPEG] C:\Users\Lobo\Desktop\Soundbot\node_modules\ffmpeg-static\ffmpeg.exe
[TUNNEL] launching cloudflared for http://localhost:3000
[TUNNEL] cloudflared pid: 9700
Web UI on http://localhost:3000
[TUNNEL ERR] 2025-11-22T04:40:21Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps
2025-11-22T04:40:21Z INF Requesting new quick Tunnel on trycloudflare.com...
Logged in as Joseph Smith#7971
(node:13112) DeprecationWarning: The ready event has been renamed to clientReady to distinguish it from the gateway READY event and will only emit under that name in v15. Please use clientReady instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
[CMD] Cleared guild commands in 353.Gaming (699157188589125632)
[CMD] Cleared guild commands in test (1438972721085284414)
[TUNNEL ERR] 2025-11-22T04:40:25Z INF +--------------------------------------------------------------------------------------------+
2025-11-22T04:40:25Z INF |  Your quick Tunnel has been created! Visit it at (it may take some 
time to be reachable):  |
2025-11-22T04:40:25Z INF |  https://measuring-dynamic-benz-peterson.trycloudflare.com
                        |
[TUNNEL URL] https://measuring-dynamic-benz-peterson.trycloudflare.com
[TUNNEL ERR] 2025-11-22T04:40:25Z INF +--------------------------------------------------------------------------------------------+
2025-11-22T04:40:25Z INF Cannot determine default configuration path. No file [config.yml config.yaml] in [~/.cloudflared ~/.cloudflare-warp ~/cloudflare-warp]
2025-11-22T04:40:25Z INF Version 2025.8.1 (Checksum b5d598b00cc3a28cabc5812d9f762819334614bae452db4e7f23eefe7b081556)
2025-11-22T04:40:25Z INF GOOS: windows, GOVersion: go1.24.2, GoArch: amd64
2025-11-22T04:40:25Z INF Settings: map[ha-connections:1 protocol:quic url:http://localhost:3000]
[TUNNEL ERR] 2025-11-22T04:40:25Z INF cloudflared will not automatically update on Windows systems.
[TUNNEL ERR] 2025-11-22T04:40:25Z INF Generated Connector ID: ed2a6536-bfe2-4b90-bdef-a5fceecc09e8
[TUNNEL ERR] 2025-11-22T04:40:25Z INF Initial protocol quic
[TUNNEL ERR] 2025-11-22T04:40:25Z INF ICMP proxy will use 192.168.178.52 as source for IPv4
[TUNNEL ERR] 2025-11-22T04:40:25Z INF ICMP proxy will use 2a02:8071:8183:be0:2674:b970:13ee:9ace in zone Ethernet 2 as source for IPv6
[TUNNEL ERR] 2025-11-22T04:40:25Z ERR Cannot determine default origin certificate path. No file cert.pem in [~/.cloudflared ~/.cloudflare-warp ~/cloudflare-warp]. You need to specify the origin certificate path by specifying the origincert option in the configuration file, or set TUNNEL_ORIGIN_CERT environment variable originCertPath=
[TUNNEL ERR] 2025-11-22T04:40:25Z INF cloudflared does not support loading the system root certificate pool on Windows. Please use --origin-ca-pool <PATH> to specify the path to the certificate pool
[TUNNEL ERR] 2025-11-22T04:40:25Z INF ICMP proxy will use 192.168.178.52 as source for IPv4
[TUNNEL ERR] 2025-11-22T04:40:25Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=0 event=0 ip=198.41.200.233
[TUNNEL ERR] 2025-11-22T04:40:25Z INF ICMP proxy will use 2a02:8071:8183:be0:2674:b970:13ee:9ace in zone Ethernet 2 as source for IPv6
[TUNNEL ERR] 2025-11-22T04:40:26Z INF Starting metrics server on 127.0.0.1:20241/metrics
[TUNNEL ERR] 2025-11-22T04:40:26Z INF Registered tunnel connection connIndex=0 connection=aa583ddf-0591-417e-97af-f85329f64bc1 event=0 ip=198.41.200.233 location=fra13 protocol=quic       
(node:13112) Warning: Supplying "ephemeral" for interaction response options is deprecated. Utilize flags instead.
Waiting for the debugger to disconnect...
C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\util\loader.js:12
  throw new Error(errorLog.join('\n'));
        ^

Error: Error: Cannot find module 'C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\opus\prebuild\node-v108-napi-v3-win32-x64-unknown-unknown\opus.node'
Require stack:
- C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\opus\lib\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\util\loader.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\voice\dist\index.js
- C:\Users\Lobo\Desktop\Soundbot\src\audioManager.js
- C:\Users\Lobo\Desktop\Soundbot\src\bot.js
- C:\Users\Lobo\Desktop\Soundbot\src\index.js
Error: Cannot find module 'node-opus'
Require stack:
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\util\loader.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\voice\dist\index.js
- C:\Users\Lobo\Desktop\Soundbot\src\audioManager.js
- C:\Users\Lobo\Desktop\Soundbot\src\bot.js
- C:\Users\Lobo\Desktop\Soundbot\src\index.js
Error: Cannot find module 'opusscript'
Require stack:
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\util\loader.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\index.js
- C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\voice\dist\index.js
- C:\Users\Lobo\Desktop\Soundbot\src\audioManager.js
- C:\Users\Lobo\Desktop\Soundbot\src\bot.js
- C:\Users\Lobo\Desktop\Soundbot\src\index.js
    at Object.loader [as require] (C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\util\loader.js:12:9)
    at loadOpus (C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js:17:17)
    at new OpusStream (C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js:46:10)
    at new Encoder (C:\Users\Lobo\Desktop\Soundbot\node_modules\prism-media\src\opus\Opus.js:149:5)
    at Object.transformer (C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\voice\dist\index.js:2807:47)
    at C:\Users\Lobo\Desktop\Soundbot\node_modules\@discordjs\voice\dist\index.js:3036:58     
    at Array.map (<anonymous>)
index.js:3036:39)
    at buildResource (C:\Users\Lobo\Desktop\Soundbot\src\audioManager.js:67:20)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)

Node.js v18.3.0
Waiting for the debugger to disconnect...
PS C:\Users\Lobo\Desktop\Soundbot> ^C
PS C:\Users\Lobo\Desktop\Soundbot> npm install
Debugger listening on ws://127.0.0.1:63052/4f6ecf74-72eb-46e3-ac78-1cc8684ba77a
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: 'undici@6.21.3',
npm WARN EBADENGINE   required: { node: '>=18.17' },
npm WARN EBADENGINE   current: { node: 'v18.3.0', npm: '9.2.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@discordjs/voice@0.19.0',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v18.3.0', npm: '9.2.0' }
npm WARN EBADENGINE }

up to date, audited 221 packages in 4s

32 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Waiting for the debugger to disconnect...
PS C:\Users\Lobo\Desktop\Soundbot> 

C:\Windows\System32\cmd.exe /k "cd /d C:\Users\Lobo\Documents\GitHub\Soundbot && npm run start"




Install a current Node 22 (e.g., nvm install 22.13.0 && nvm use 22.13.0).
From the project folder, clean and reinstall:
rmdir /s /q node_modules
npm install
npm run start
If it still complains about Opus, explicitly add it then reinstall:
npm install @discordjs/opus
(With Node 22+, the prebuilt @discordjs/opus binary should download cleanly on Windows and the error will go away.)