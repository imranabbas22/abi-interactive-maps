# ABI Market Price Tracker

Live market price tracker for **Arena Breakout Infinite** — collects prices for
all ~1,700 marketable items from two independent sources, keeps a time series,
and renders an interactive price-history graph.

**Live demo:** https://syedimransolutions.info/abi-market/graph.html

```
Source A (OFFICIAL) ──► sg-apps.vasdgame.com/ide/  (game's own backend API)
                          └─► store_series.json ──┐
Source B (community)  ──► market tracker site DOM ──► series.json ──► graph.html
                                                          │
                          token_watchdog.py (daily) ──► token_status.json ──┘
```

---

## What this is / what we built

This is the result of a multi-session reverse-engineering effort. We went from
"the market tracker site shows prices but there's no public API" to running our
own collector that reads prices from **the game's official backend itself**.

### The two data sources

**Source A — Official game API (primary, gold line on the graph)**
`POST https://sg-apps.vasdgame.com/ide/` — chart **100011807** (`QueryMarketPrice`)
with sIdeToken `VYEmxk`. This is the exact endpoint the official ABI Helper Store
web page uses. Returns the current lowest market price per item, in Koen,
straight from the game's own servers. Discovered by:
1. Finding the event-store page config (`amside/page/4009844_AKMpZj`) which maps
   every chart's sIdeToken → chart ID
2. Verifying the request format and response shape live

Requires a per-account session `token` + `openid` (see Token management below).

**Source B — Community tracker site (secondary, gray dashed line on the graph)**
Headless-Chromium DOM scrape of the market tracker's public market pages
(72 categories). Included as a second opinion / comparison line — the official
price and the tracker's cached snapshot often differ by several percent.

### Key implementation details (all verified in production)

| Constraint | Verified value |
|---|---|
| IDE API batch size | **max 20 itemIds per call** (21+ → `ret=-5000 invalid vector`) |
| IDE API rate limit | ~2 calls/token/2.5s; safe sustained pace = **1.5s gap** (86 calls, 0 rejections) |
| Full sweep | 1,707 items in **~165s** (86 batched calls) |
| Full DOM scrape | 72 categories, 1,759 items, ~6 min |
| Tracker refresh cadence | ~30 min server-side (so the 10-min cron catches each refresh quickly) |
| Price history | Change-only points (flat windows don't bloat the series) |

**Notable finding:** official prices run **~10% above** the tracker's numbers
consistently (e.g. AKM 8,276 vs 7,524; H416 221,971 vs 201,792), but not at a
fixed ratio — they're genuinely independent market readings. When they diverge
widely, the tracker snapshot is stale and the official number is the one to trust.

### The graph (graph.html)

- Interactive Chart.js page, dark + gold theme matching the ABI tools
- Searchable item picker (1,707 items, English names via the game's own
  localization map)
- **Time-range filters: 4h / 12h / 1d / 7d / 30d**
- Two price lines: official (gold, solid) vs tracker (gray, dashed)
- Stat cards: current price (prefers official), change in window, lowest,
  highest, data points
- Quantity bars on a secondary axis (toggleable)
- Auto-refresh every 2 min
- **Token status in the header** — "Token 30d" green, "⚠️ expires in Xd"
  (<7 days), "⛔ TOKEN DEAD" — fed by the daily watchdog

---

## What is actually working (verified, as of 2026-08-06)

- ✅ Official API integration — 1,707/1,707 items priced in 165s, zero errors
- ✅ DOM scrape — 72 categories / 1,759 items (1 category empty server-side)
- ✅ English names — 100% coverage (item ID → name map from game localization)
- ✅ Time-series history (change-only points) for both sources
- ✅ Interactive graph with filters, dual source lines, quantity toggle
- ✅ Token watchdog — daily liveness probe + expiry countdown + alert log
- ✅ VPS deployment — cron (10-min tracker sweep, 30-min store sweep, daily
  watchdog), nginx static serving with CORS, graph live at /abi-market/
- ✅ Live URL verified: graph + all 5 JSON endpoints return 200

---

## Setup & run

```bash
npm install
npx playwright install chromium        # needed for Source B (DOM scrape)
cp store_config.example.json store_config.json   # then fill in your token
```

### One-shot commands

```bash
# Full DOM scrape (72 categories) → data/market_<ts>.json
npm run scrape

# Official API sweep (all tracked items) → data/store_prices.json + store_series.json
node src/store_fetch.js --batch 20

# Single category DOM test
node src/scraper.js --category 20210

# Token liveness check
python3 token_watchdog.py
```

### Scheduled mode (VPS cron — matches production)

```cron
*/10 * * * *   cd ~/abi-market-tracker && node src/scheduler.js --single-shot
9,39 * * * *   cd ~/abi-market-tracker && node src/store_fetch.js --batch 20
0 6 * * *      cd ~/abi-market-tracker && python3 token_watchdog.py
```

### Nginx (serves the data dir + graph)

```nginx
location /abi-market/ {
    alias /home/ubuntu/abi-market-tracker/data/;
    add_header Access-Control-Allow-Origin *;
    default_type application/json;
}
```

`setup_nginx.sh` applies this safely (backup → insert → `nginx -t` → reload).
**Pitfall (fixed):** never back up nginx configs inside `sites-enabled/` — the
`include sites-enabled/*` glob picks up the backup as a second config and
`nginx -t` fails with `limit_req_zone already bound`.

---

## Token management (the official API needs a session)

The IDE API is **account-bound** — every call needs a session token for the
account whose data you want (one token = one player's market view). Tokens
expire **~30 days after login** (`ret=101 "please log in first"` when dead).

**Refresh procedure (2 minutes, monthly):**
1. Open the ABI Helper Store page in your **home browser** (the login page only
   answers to residential IPs — datacenter/cloud IPs time out) and log in.
2. F12 → Console:
   ```js
   JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => /token|session|user/i.test(k))))
   ```
3. From the `milo_intl_cookie` object copy `token` (40 hex) + `openid`, and
   note `token_expire_time` (unix seconds).
4. Update `store_config.json`:
   ```json
   { "token": "<new>", "openid": "<openid>", "token_expire_ts": <expire_time> }
   ```
5. Verify: `python3 token_watchdog.py` → "Token OK — 30 days left"

**Why not fully automatic?** The auth API (`li-sg.intlgame.com/v2/auth/login`)
exists and our recovered signature passes, but the login backend requires the
full SDK handshake (device fingerprint / captcha / verification flows).
Automating account login from a datacenter IP risks flagging the account, so a
manual monthly refresh + automated watchdog is the deliberate choice.

---

## File layout

```
abi-market-tracker/
├── src/
│   ├── categories.js      # 72 market category IDs + names
│   ├── scraper.js         # DOM scrape (one-shot, full or single category)
│   ├── scheduler.js       # DOM scrape scheduler (cron-friendly --single-shot)
│   ├── store_fetch.js     # Official IDE API fetcher (batch 20, 1.5s pace)
│   ├── debug.js / debug_port.js / inspect.js / inspect2.js   # selector debug tools
├── graph.html             # interactive price graph (Chart.js, dark+gold)
├── token_watchdog.py      # daily token liveness + expiry watchdog
├── setup_nginx.sh         # idempotent nginx /abi-market/ setup
├── fix_nginx_backup.sh    # cleanup for the sites-enabled backup pitfall
├── store_config.example.json   # token config template (real one is gitignored)
├── package.json           # node deps (playwright)
└── .gitignore
```

Generated at runtime (not committed): `data/` (snapshots, series, status),
`store_config.json` (live token).

---

## Reverse-engineering notes

The vasdgame IDE API work (chart discovery, request signing, token refresh
hunt) is documented in the `abi-reverse-engineering` skill references:
- `2026-08-02-vasdgame-chart-map-and-market-api.md` — chart map + market API
- `2026-08-06-ide-market-batch-limit-token-refresh.md` — batch limit + token refresh
- `2026-08-06-token-lifetime-auth-api-probes.md` — auth API surface, signature recipes
