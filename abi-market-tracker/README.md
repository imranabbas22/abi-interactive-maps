# ABI Market Price Tracker

Live market price tracker for **Arena Breakout Infinite** — collects official
prices for all ~1,700 marketable items straight from the game's own backend,
keeps a time series, and renders an interactive price-history graph.

**Live demo:** https://syedimransolutions.info/abi-market/graph.html

```
official game API (sg-apps.vasdgame.com/ide/)
        │
        ├─► store_series.json  (price history, change-only points)
        ├─► store_prices.json  (latest snapshot)
        │
        ├─► graph.html         (interactive chart + token input)
        │
        └─► token watchdog ──► token_status.json ──► token panel in graph
```

**Single source:** prices come exclusively from the game's official backend
(the same endpoint the ABI Helper Store web page uses). No third-party scraping.

---

## What this is / how we got here

Multi-session reverse-engineering effort. The prize: the official event-store
page config (`amside/page/4009844_AKMpZj`) maps every chart's sIdeToken →
chart ID, revealing **chart 100011807 (`QueryMarketPrice`)** — the current
lowest market price per item, in Koen, straight from the game servers.

An earlier version also scraped a community market tracker site (72 categories)
as a comparison line and quantity source. That dependency has been **completely
removed** — the official API is the only source, and the DOM scraper + its cron
were deleted. No third-party site is touched.

### Key implementation details (verified in production)

| Constraint | Verified value |
|---|---|
| IDE API batch size | **max 20 itemIds per call** (21+ → `ret=-5000 invalid vector`) |
| IDE API rate limit | ~2 calls/token/2.5s; safe sustained pace = **1.5s gap** (86 calls, 0 rejections) |
| Full sweep | 1,707 items in **~165s** (86 batched calls) |
| Fast sweep | **52 items (T5 ammo + keys) in ~4.5s** — every 2 min |
| Price history | Point on **every** sweep (each 30-min/2-min update recorded, capped at 240 pts/item) |
| Data freshness | Full catalog every 30 min (cron `9,39 * * * *`); T5 ammo + keys every 2 min (`*/2`) |
| Quantity/count | NOT available from the official API (verified: `num` param is a pure price multiplier, no count in any response; no market-depth chart exists among the 16 IDE charts) |

---

## What is actually working (verified, as of 2026-08-07)

- ✅ Official API integration — 1,707/1,707 items priced in ~165s, zero errors
- ✅ English names — 100% coverage (item ID → name map from game localization)
- ✅ Time-series history (change-only points)
- ✅ Interactive graph: search, 4h/12h/1d/7d/30d filters, stat cards, auto-refresh
- ✅ **Token self-service** — when the session token dies, the graph itself shows
  a "paste new token" form; the token server validates it against the API and
  resumes collection. No SSH needed.
- ✅ Token watchdog — daily liveness probe + expiry countdown + alert log
- ✅ VPS deployment — cron sweeps, PM2 token server, nginx static serving,
  graph live at /abi-market/
- ✅ No third-party scraper dependency (removed 2026-08-07)

---

## Setup & run

```bash
npm install                      # (no runtime deps beyond node built-ins; playwright NOT needed)
cp store_config.example.json store_config.json   # then fill in your token
```

### One-shot commands

```bash
# Full official-API sweep → data/store_prices.json + data/store_series.json
node src/store_fetch.js --batch 20

# Token liveness check
python3 token_watchdog.py

# Token server (local test)
node token_server.js    # then: curl http://127.0.0.1:3104/status
```

### Scheduled mode (VPS cron — matches production)

```cron
*/2 * * * *   cd ~/abi-market-tracker && node src/store_fetch.js --watchlist t5,keys
9,39 * * * *  cd ~/abi-market-tracker && node src/store_fetch.js --batch 20
0 6 * * *     cd ~/abi-market-tracker && python3 token_watchdog.py
```

The `--watchlist t5,keys` fast sweep (52 items: 9 T5 ammo + 43 keys) runs every
2 minutes for near-real-time prices on combat-relevant items; the full catalog
sweep runs every 30 minutes. A lock file (`data/.store_fetch.lock`) prevents the
two from colliding on the shared series file. The watchlist is editable in
`watchlist.json` (T5 ammo = PenetrationFactor 50-59 per game data).

### Nginx

```nginx
location /abi-market/ {                       # static data + graph
    alias /home/ubuntu/abi-market-tracker/data/;
    add_header Access-Control-Allow-Origin *;
    default_type application/json;
}
location /abi-market-token/ {                 # token update endpoint
    proxy_pass http://127.0.0.1:3104/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

`setup_nginx.sh` (data) and `setup_token_nginx.sh` (token endpoint) apply these
safely (backup → insert → `nginx -t` → reload). Both idempotent.

---

## Token management (how the market keeps itself alive)

The IDE API is **account-bound** — every call needs a session token for the
account whose data you want. Tokens expire **~30 days after login**
(`ret=101 "please log in first"` when dead).

**The flow when a token expires:**
1. The next store sweep hits `ret=101` → `store_fetch.js` immediately writes
   `token_status.json` with `state=dead`
2. The graph's next refresh sees it → **a red panel appears in the page**:
   "⛔ Store token expired — market paused" with a token input
3. You log into the ABI Helper Store on your **home browser** (the login page
   only answers to residential IPs), grab the fresh token (F12 → Console →
   the milo_intl_cookie snippet below), paste it into the graph panel
4. The token server (`token_server.js`, PM2, proxied at `/abi-market-token/`)
   validates the token against the live API **before saving** — a bad token is
   rejected, a good one is persisted to `store_config.json` and the dead flag
   is cleared
5. The graph reloads, the panel disappears, collection resumes

**Grabbing a token from the Helper Store (F12 → Console on the logged-in page):**
```js
JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => /token|session|user/i.test(k))))
```
From `milo_intl_cookie`: `token` (40 hex), `openid`, `token_expire_time` (unix s).

**Why not fully automatic?** The auth API (`li-sg.intlgame.com/v2/auth/login`)
exists and our recovered signature passes, but the login backend requires the
full SDK handshake (device fingerprint / captcha / verification flows).
Automating account login from a datacenter IP risks flagging the account, so a
paste-a-token flow + automated watchdog is the deliberate choice — 2 minutes
once a month, and the graph tells you exactly when.

---

## File layout

```
abi-market-tracker/
├── src/store_fetch.js        # official IDE API fetcher (batch 20, 1.5s pace)
├── graph.html                # interactive graph + token-input panel
├── token_server.js           # validates + persists new tokens (PM2, :3104)
├── token_watchdog.py         # daily liveness + expiry watchdog
├── setup_nginx.sh            # nginx /abi-market/ static serving
├── setup_token_nginx.sh      # nginx /abi-market-token/ proxy
├── fix_nginx_backup.sh       # cleanup for the sites-enabled backup pitfall
├── item_names.json           # game localization (14,690 IDs → English names)
├── store_config.example.json # token config template (real one is gitignored)
├── package.json              # no runtime deps needed
└── .gitignore
```

Generated at runtime (not committed): `data/` (series, prices, status),
`store_config.json` (live token).

---

## Reverse-engineering notes

The vasdgame IDE API work is documented in the `abi-reverse-engineering` skill
references:
- `2026-08-02-vasdgame-chart-map-and-market-api.md` — chart map + market API
- `2026-08-06-ide-market-batch-limit-token-refresh.md` — batch limit + token refresh
- `2026-08-06-token-lifetime-auth-api-probes.md` — auth API surface, signature recipes
