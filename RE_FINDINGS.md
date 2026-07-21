# ABI Player Tracker — Reverse Engineering Findings
> Date: July 9, 2026  
> Status: In Progress — broker WebSocket reachable, protobuf schema pending

## Server Infrastructure
```
Domain                                          IP              Role
───                                             ──              ────
sg.intlgame.com                                 43.153.253.165  Level Infinite main API
sg-dr.intlgame.com                              101.32.113.182  Game API gateway (binary protocol)
broker-ws-prod-cag-sg.vasdgame.com              101.33.48.30   WebSocket broker (player data)
prod-tconnd.arenabreakoutinfinite.com           ?               Lobby/connection server
sg.tdatamaster.com                              101.32.171.190  Analytics
sg.voice.gcloudcs.com                           43.156.40.86    Voice chat
sg.jupiterlauncher.com                          43.134.152.122  Launcher API (HTTP REST)
data-aws-na.intlgame.com                        52.9.151.213    Data service (DSR/query)
cdn-client.arenabreakoutinfinite.com            ?               CDN (billing resources)
hwconfig.gcloudcs.com                           170.106.118.60  Hardware config
ms.singaporepaya.com                            ?               Payment/billing
down.anticheatexpert.com                        ?               Anti-cheat downloads
```

## Protocol Architecture
```
Game Client
  │
  ├─► sg.jupiterlauncher.com (HTTP REST)
  │     /api/v1/fleet.auth.game.AuthSvr/Login
  │     /api/v1/fleet.repo.game.RepoSVC/GetVersion
  │
  ├─► broker-ws-prod-cag-sg.vasdgame.com:443 (WebSocket wss://)
  │     └─ Player search, profile data, real-time status
  │     └─ Uses protobuf messages over WebSocket
  │     └─ Application-layer encryption: crypto-js AES
  │
  └─► sg-dr.intlgame.com:443 (Custom binary over TLS)
        └─ Game lobbies, match data
        └─ NOT HTTP — 12 exchanges captured: 80B header + payload + 32B trailer
        └─ All bytes encrypted with crypto-js AES
```

## Key Constants
- **Game ID:** 30061
- **Channel ID:** 131
- **OS Code:** 5 (Windows)
- **Session file:** `%LOCALAPPDATA%\ABInfinite\Saved\...\TSF4G2\{UID}_sess.txt`
  - Contains: `uid`, `session_id`, `ticket`, `key`, `url`
- **DevTools Port:** 7777 (not active in release build)

## Binary Analysis
### UAGame.exe (194MB)
- Webpack bundle at offset ~181,700,000
- Source files: `cgi_socket.ts`, `cgi_mgr.ts`, `rpc_mgr.ts`, `settings.ts`
- Contains: crypto-js, protobuf runtime, Gamelet/Pandora system
- Source: `src/network/sockets/cgi_socket.ts` — WebSocket broker connection
- Source: `src/managers/cgi/cgi_mgr.ts` — CGI request manager

### GameLoaderBase.dll (28MB)
- Contains AES S-box (CRYPTOGAMS implementation)
- Multiple AES variants: AES-NI, SSSE3, x86_64
- OpenSSL static linked

### INTLGameNative.dll (542KB)
- `getURL actionPath:%s, paramsString:%s, postBody:%s` — URL builder
- `sessionId:%d, ret:%d, respBody:%s, len:%d` — Response logger
- `intlgn::INTLAPICaller::LogCallAPIResult` — API call wrapper
- Source: `D:\devops\GameNative\INTLGameNative\SDK\INTLGameNative\intl_api_caller.cpp`

## CGI Socket Module (Extracted)
Key variables from the obfuscated webpack bundle:
```
wss://              — WebSocket Secure (broker connection)
ws://               — Plain WebSocket (fallback)
mBrokerAddr         — Broker address
mBrokerPort         — Broker port
mBrokerCapIP1/2     — Broker capacity IPs
mFaasAddr           — FaaS (Function as a Service) address
isWss               — Use secure WebSocket flag
encryptedData        — Addresses may be encrypted
alternateAddrsFile   — alternate_addrs.dat (fallback)
parseBrokerAddrsMixed / parseBrokerAddrsAppOnly — Address parsers
requestCGIViaPandora  — Main CGI entry point
```

## Files Captured
| File | Size | Description |
|------|------|-------------|
| `sslkeys.log` | 112KB | TLS session keys (106 CLIENT_RANDOM entries) |
| `game_capture_xxx.pcapng` | 30MB | Full game session packet capture |
| `sg-dr-outbound.bin` | 95KB | Decrypted outbound payloads (game → server) |
| `sg-dr-inbound.bin` | 125KB | Decrypted inbound payloads (server → game) |

## Working Tools
- `scripts/scrape-player.mjs` — Playwright scraper for abi-tracker (8s)
- `src/app/api/player-search/route.ts` — Next.js API route
- `src/app/tracker/players/page.tsx` — Search UI

## Remaining Work
1. Extract protobuf message schema from obfuscated webpack bundle
2. Extract crypto-js AES key derivation algorithm
3. Implement direct broker WebSocket calls
4. Ghidra decompilation of GameLoaderBase.dll (AES code)
