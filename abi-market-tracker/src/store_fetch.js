// ABI Helper Store Price Fetcher — official vasdgame IDE API
// Chart 100011807 (QueryMarketPrice) returns the current lowest market price
// per item, straight from the game's own backend (the same API the Helper
// Store web page uses). No DOM scraping, no middleman tracker.
//
// Uses the curl binary for requests — verified 2026-08-02 that this chart
// rejects non-curl HTTP clients (httpx/urllib get ret=190001) but curl works.
// Rate limit ~2 calls/token/2.5s, so we pace at 1.4s between calls.
//
// Usage:
//   node src/store_fetch.js                 # full sweep of tracked items
//   node src/store_fetch.js --batch 20      # override batch size (default 20, HARD MAX 20)
//   node src/store_fetch.js --items a,b,c   # specific item IDs only
//
// Writes:
//   data/store_prices.json  — latest snapshot {generatedAt, source, prices:{itemId:price}}
//   data/store_series.json  — time series  {updatedAt, items:{itemId:{name, series:[{t,lowest}]}}}
//   (series appends a point on EVERY sweep — each 30-min update is a data
//   point even if the price is unchanged — capped at MAX_POINTS per item)

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data");
const CONFIG_FILE = path.join(__dirname, "..", "store_config.json");
const SERIES_FILE = path.join(OUT_DIR, "store_series.json");
const PRICES_FILE = path.join(OUT_DIR, "store_prices.json");
const LOCK_FILE = path.join(OUT_DIR, ".store_fetch.lock");
// ~5 days of 30-min sweeps (48/day) per item; older points are pruned so the
// file stays bounded (1707 items × 240 pts ≈ 8-12 MB worst case)
const MAX_POINTS = 240;
// VERIFIED 2026-08-07 (in-game cross-check): chart 100011807 returns prices
// with a built-in 10% markup over the real in-game market price (the store
// shows buyer cost incl. fee; the game shows seller list price). Every price
// fetched is divided by 1.1 so the graph shows the TRUE in-game price.
// User-verified: Motel Main Guest Room Key API 4,867,474 ÷ 1.1 = 4,424,976 ✓
const PRICE_CORRECTION = 1.1;

// Simple lock — fast (watchlist) and full sweeps both write store_series.json,
// so a second concurrent instance skips instead of corrupting the file.
function acquireLock() {
  try {
    const st = fs.statSync(LOCK_FILE);
    // stale lock after 10 min (a sweep never runs longer than ~3 min)
    if (Date.now() - st.mtimeMs < 10 * 60 * 1000) {
      console.error("another store_fetch instance is running — skipping this run");
      process.exit(0);
    }
  } catch {}
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}
function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(130); });
process.on("SIGTERM", () => { releaseLock(); process.exit(143); });

const IDE_URL = "https://sg-apps.vasdgame.com/ide/";
const CHART_ID = "100011807";
const CHART_TOKEN = "VYEmxk";
const INSTANCE_ID = "4009844";
const GAME_ID = "30061";

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const BATCH = Math.min(parseInt(argVal("--batch") || "20", 10), 20); // hard max 20
const SPECIFIC = argVal("--items"); // comma-separated
const WATCHLIST = argVal("--watchlist"); // "t5" or "keys" or "t5,keys" — fast-refresh subsets from watchlist.json
const CALL_GAP_MS = 1500;
const MAX_RETRIES = 3;

function loadWatchlist() {
  const p = path.join(__dirname, "..", "watchlist.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

// ── config: token + openid (fresh from a store login session) ──
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error("store_config.json not found — create it with {token, openid}");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

// ── curl POST to the IDE API (chart rejects non-curl clients) ──
function ideCall(bodyObj) {
  const enc = new URLSearchParams();
  for (const [k, v] of Object.entries(bodyObj)) enc.append(k, v);
  const args = [
    "-s", "--max-time", "20", "-X", "POST", IDE_URL,
    "-H", "Content-Type: application/x-www-form-urlencoded",
    "-H", "Origin: https://www.arenabreakoutinfinite.com",
    "-H", "Referer: https://www.arenabreakoutinfinite.com/",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "--data", enc.toString(),
  ];
  return JSON.parse(execFileSync("curl", args, { encoding: "utf8" }));
}

function fetchPrices(cfg, itemIds) {
  const body = {
    iChartId: CHART_ID,
    sIdeToken: CHART_TOKEN,
    sLanguage: "en",
    openid: cfg.openid,
    token: cfg.token,
    gameid: GAME_ID,
    instanceid: INSTANCE_ID,
    os: "3",
    channelid: "131",
    sArea: "1",
    sPlatId: "0",
    params: JSON.stringify({ itemIds: itemIds.map((id) => ({ item_id: id, num: 1 })) }, null, 0)
      .replace(/\s+/g, ""),
  };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const data = ideCall(body);
    const ret = data.ret;
    if (ret === 0) return data.jData?.item_price_datas || {};
    if (ret === 101) {
      // Token dead — flag it immediately so the graph asks for a new token.
      // Don't retry; every call will fail the same way.
      markTokenDead(data.sMsg || "please log in first");
      throw new Error("token invalid/expired (ret=101) — refresh token in store_config.json");
    }
    if (ret === 107 || ret === 190001 || ret === 110001) {
      const wait = 3000 * attempt;
      console.warn(`  ret=${ret} (${data.sMsg || "busy"}) — retry ${attempt} in ${wait / 1000}s`);
      const t0 = Date.now();
      while (Date.now() - t0 < wait) { /* busy wait */ }
      continue;
    }
    throw new Error(`IDE ret=${ret} ${data.sMsg || ""}`);
  }
  throw new Error("IDE busy after retries");
}

// Write data/token_status.json with state=dead so graph.html shows the
// token-input form immediately (no waiting for the daily watchdog).
function markTokenDead(reason) {
  try {
    const statusPath = path.join(OUT_DIR, "token_status.json");
    const status = {
      checkedAt: new Date().toISOString(),
      tokenOk: false,
      ret: 101,
      reason: reason || "",
      state: "dead",
      message: "TOKEN DEAD — store prices stopped. Paste a new token in the graph to resume.",
    };
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
    console.error("TOKEN DEAD — flagged token_status.json; graph will ask for a new token");
  } catch (err) {
    console.error("could not write token_status.json:", err.message);
  }
}

function loadSeries() {
  if (!fs.existsSync(SERIES_FILE)) return { updatedAt: 0, items: {} };
  try {
    return JSON.parse(fs.readFileSync(SERIES_FILE, "utf8"));
  } catch {
    return { updatedAt: 0, items: {} };
  }
}

function main() {
  const cfg = loadConfig();
  if (!cfg.token || !cfg.openid) {
    console.error("store_config.json missing token/openid");
    process.exit(1);
  }
  acquireLock();

  // collect item IDs to query
  let ids;
  if (SPECIFIC) {
    ids = SPECIFIC.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (WATCHLIST) {
    const wl = loadWatchlist() || {};
    const want = WATCHLIST.split(",").map((s) => s.trim()).filter(Boolean);
    ids = [];
    for (const w of want) {
      const list = wl[w];
      if (Array.isArray(list)) ids.push(...list);
    }
    if (!ids.length) {
      console.error(`--watchlist '${WATCHLIST}' matched nothing in watchlist.json (have: ${Object.keys(wl).join(", ")})`);
      process.exit(1);
    }
  } else {
    const series = loadSeries();
    ids = Object.keys(series.items);
    if (!ids.length) {
      // first run: seed from the game localization name map (item universe)
      const nameMap = (() => {
        try {
          return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "item_names.json"), "utf8"));
        } catch { return {}; }
      })();
      ids = Object.keys(nameMap);
    }
  }
  console.log(`querying ${ids.length} items in batches of ${BATCH} (${CALL_GAP_MS}ms gap)`);

  const series = loadSeries();
  const prices = {};
  let changed = 0;
  const started = Date.now();
  const nameMap = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "item_names.json"), "utf8"));
    } catch { return {}; }
  })();

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const got = fetchPrices(cfg, chunk);
      for (const [id, rawPrice] of Object.entries(got)) {
        // strip the API's built-in 10% markup → true in-game price
        const price = Math.round(rawPrice / PRICE_CORRECTION);
        let entry = series.items[id];
        if (!entry) {
          entry = { name: nameMap[id] || id, series: [] };
          series.items[id] = entry;
        }
        const pts = entry.series;
        // Record EVERY sweep as a point (not just price changes) so the graph
        // shows a continuous line at each 30-min update. Cap keeps the file bounded.
        pts.push({ t: Date.now(), lowest: price });
        if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
        changed++;
        prices[id] = price;
      }
      process.stdout.write(`  [${Math.min(i + BATCH, ids.length)}/${ids.length}] ${chunk.length} items -> ${Object.keys(got).length} prices\r`);
    } catch (err) {
      console.error(`\n  batch ${i}-${i + BATCH} failed: ${err.message}`);
    }
    if (i + BATCH < ids.length) {
      const t0 = Date.now();
      while (Date.now() - t0 < CALL_GAP_MS) { /* sync pace — keeps curl calls sequential */ }
    }
  }

  console.log(`\nsweep done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${Object.keys(prices).length} prices, ${changed} points recorded (every sweep appended)`);
  series.updatedAt = Date.now();
  fs.writeFileSync(SERIES_FILE, JSON.stringify(series));
  fs.writeFileSync(PRICES_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "sg-apps.vasdgame.com/ide/ chart 100011807 (Helper Store API)",
    prices,
  }));
  console.log(`saved ${PRICES_FILE} (${Object.keys(prices).length} items) + ${SERIES_FILE}`);
}

main();
