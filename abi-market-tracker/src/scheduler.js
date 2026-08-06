// ABI Market Tracker — scheduler
// Runs the full 72-category sweep on an interval (default every 10 min),
// keeping a rolling history of snapshots in data/history/ AND a compact
// per-item time series in data/series.json (what the graph consumes).
//
// Usage:  node src/scheduler.js [--interval-min 10]
// Note:   use --single-shot to run once and exit (for cron/systemd on VPS)

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATEGORIES, MARKET_URL } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data");
const HIST_DIR = path.join(OUT_DIR, "history");
const SERIES_FILE = path.join(OUT_DIR, "series.json");
const LATEST_FILE = path.join(OUT_DIR, "latest.json");
const NAME_MAP_FILE = path.join(__dirname, "..", "item_names.json");
const MAX_HISTORY_FILES = 96; // 16h of 10-min snapshots, then prune

// ID -> English name map (mined from the game's official localization).
// The tracker site renders names in Traditional Chinese; we translate to
// English here so the graph shows readable names. Falls back to the
// scraped name for any item not in the map.
let NAME_MAP = {};
if (fs.existsSync(NAME_MAP_FILE)) {
  try {
    NAME_MAP = JSON.parse(fs.readFileSync(NAME_MAP_FILE, "utf8"));
    console.log(`Loaded ${Object.keys(NAME_MAP).length} English item names`);
  } catch {
    console.warn("item_names.json unreadable — keeping scraped names");
  }
}
const enName = (itemId, scraped) => NAME_MAP[itemId] || scraped;

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const INTERVAL_MIN = parseInt(argVal("--interval-min") || "10", 10);
const SINGLE_SHOT = args.includes("--single-shot");

const NAV_TIMEOUT = 30000;
const RETRIES = 3;

const EXTRACT_JS = `(() => {
  const items = [];
  for (const card of document.querySelectorAll('.market-item-card')) {
    const nameEl = card.querySelector('.market-item-name');
    const name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent || '').trim() : '';
    const itemId = card.getAttribute('data-item-id') || '';
    const lowestEl = card.querySelector('.market-item-lowest-value');
    const lowest = lowestEl ? parseInt((lowestEl.textContent || '').replace(/[^0-9]/g, ''), 10) : null;
    const countEl = card.querySelector('.market-item-count');
    const totalQty = countEl ? parseInt((countEl.textContent || '').replace(/[^0-9]/g, ''), 10) : null;
    const ladder = [];
    for (const row of card.querySelectorAll('.price-bar-row')) {
      const t = row.getAttribute('title') || '';
      const m = t.match(/價格 (\\d+) \\/ 數量 (\\d+)/);
      if (m) ladder.push({ price: +m[1], qty: +m[2] });
    }
    items.push({ itemId, name, lowest, totalQty, ladder });
  }
  const snap = document.querySelector('.market-item-snapshot-time');
  return JSON.stringify({
    count: items.length,
    snapshotTime: snap ? (snap.textContent || '').trim() : '',
    items,
  });
})()`;

async function waitForContent(page) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.market-item-card').length > 0,
      { timeout: NAV_TIMEOUT }
    );
    return true;
  } catch {
    return false;
  }
}

async function scrapeCategory(browser, cat) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    let ok = false;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      await page.goto(MARKET_URL(cat.minorId), {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      ok = await waitForContent(page);
      if (ok) break;
      if (attempt < RETRIES) await page.waitForTimeout(1500 * attempt);
    }
    if (!ok) return { minorId: cat.minorId, name: cat.name, error: "no content rendered" };
    await page.waitForTimeout(800);
    return { minorId: cat.minorId, name: cat.name, ...JSON.parse(await page.evaluate(EXTRACT_JS)) };
  } catch (err) {
    return { minorId: cat.minorId, name: cat.name, error: String(err).slice(0, 200) };
  } finally {
    await context.close();
  }
}

// Merge this sweep into the compact time series (data/series.json).
// Per item we store points only when the value CHANGES vs the previous point
// (or on the very first sighting), so flat tracker windows don't bloat the file.
function updateSeries(results, now) {
  let series = { updatedAt: now, items: {} };
  if (fs.existsSync(SERIES_FILE)) {
    try {
      series = JSON.parse(fs.readFileSync(SERIES_FILE, "utf8"));
    } catch {
      console.warn("series.json unreadable — rebuilding from scratch");
      series = { updatedAt: now, items: {} };
    }
  }
  let changed = 0;
  for (const cat of results) {
    if (!cat.items) continue;
    for (const it of cat.items) {
      if (it.lowest == null) continue;
      let entry = series.items[it.itemId];
      if (!entry) {
        entry = { name: enName(it.itemId, it.name), series: [] };
        series.items[it.itemId] = entry;
      } else if (!entry.name || /[\u4e00-\u9fff]/.test(entry.name)) {
        // upgrade an existing Chinese/legacy name to English
        entry.name = enName(it.itemId, entry.name);
        changed++;
      }
      const pts = entry.series;
      const last = pts.length ? pts[pts.length - 1] : null;
      if (last && last.lowest === it.lowest && last.qty === it.totalQty) continue; // no change
      pts.push({ t: now, lowest: it.lowest, qty: it.totalQty });
      changed++;
    }
  }
  series.updatedAt = now;
  fs.writeFileSync(SERIES_FILE, JSON.stringify(series));
  return changed;
}

// Keep the raw snapshot history bounded (each file is ~1.7MB).
function pruneHistory() {
  let files = [];
  try {
    files = fs.readdirSync(HIST_DIR)
      .filter((f) => f.startsWith("snapshot_") && f.endsWith(".json"))
      .sort();
  } catch {
    return 0;
  }
  let removed = 0;
  while (files.length > MAX_HISTORY_FILES) {
    const f = files.shift();
    fs.unlinkSync(path.join(HIST_DIR, f));
    removed++;
  }
  return removed;
}

async function runSweep(round) {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const started = Date.now();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const r = await scrapeCategory(browser, cat);
    results.push(r);
    console.log(
      `[round ${round}] [${i + 1}/${CATEGORIES.length}] ${cat.minorId} ${cat.name.padEnd(18)} items=${r.items ? r.items.length : 0}${r.error ? ` ERR:${r.error.slice(0, 40)}` : ""}`
    );
    if (i < CATEGORIES.length - 1) await new Promise((res) => setTimeout(res, 700));
  }
  await browser.close();

  fs.mkdirSync(HIST_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    generatedAt: new Date().toISOString(),
    round,
    source: "abi-tracker.azurewebsites.net/Market/View (DOM scrape)",
    categories: results,
    stats: {
      categories: results.length,
      errors: results.filter((r) => r.error).length,
      totalItems: results.reduce((a, r) => a + (r.items ? r.items.length : 0), 0),
      elapsedMs: Date.now() - started,
    },
  };
  const file = path.join(HIST_DIR, `snapshot_${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  fs.writeFileSync(LATEST_FILE, JSON.stringify(payload, null, 2));

  // Compact series for the graph — only changed prices append points
  const seriesChanged = updateSeries(results, Date.now());
  const pruned = pruneHistory();

  console.log(`\n[round ${round}] saved ${file}`);
  console.log(
    `stats: ${payload.stats.categories} categories, ${payload.stats.totalItems} items, ${payload.stats.errors} errors, ${(payload.stats.elapsedMs / 1000).toFixed(1)}s`
  );
  console.log(`series: +${seriesChanged} changed points, history pruned ${pruned} files`);
}

async function main() {
  let round = 1;
  if (SINGLE_SHOT) {
    await runSweep(round);
    process.exit(0);
  }
  console.log(`Scheduler: sweep every ${INTERVAL_MIN} min (history in data/history/, series in data/series.json). Ctrl+C to stop.`);
  await runSweep(round);
  setInterval(async () => {
    round++;
    try {
      await runSweep(round);
    } catch (err) {
      console.error(`[round ${round}] failed:`, err);
    }
  }, INTERVAL_MIN * 60 * 1000);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
