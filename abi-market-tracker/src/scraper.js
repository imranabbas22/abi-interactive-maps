// ABI Market Tracker — headless Playwright scraper
// Navigates every category page on abi-tracker, extracts price/quantity ladders
// from the rendered DOM (the tracker decrypts GetPrices in-browser), saves JSON.
//
// Usage:  npm run scrape [-- --category 20210] [-- --out data/market.json]
//         --category: scrape only one minorId (test mode)
//         --out:      output path (default data/market_YYYYMMDD_HHMMSS.json)

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CATEGORIES, MARKET_URL } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data");

// --- CLI args ---
const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const ONLY_CATEGORY = argVal("--category");
const OUT_FILE = argVal("--out");

const NAV_TIMEOUT = 30000; // page load + render budget per category
const RETRIES = 3;

// Extract snippet — walks the rendered DOM for item names + price bars
// Current DOM (2026-08-05): .market-item-card > .market-item-left > .market-item-name
//   + .market-item-lowest-value (lowest price), .market-item-count (total qty),
//   .market-item-price-bars > .price-bar-row[title="價格 X / 數量 Y"]
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

// Wait for the page to actually render market content (item names appear).
async function waitForContent(page) {
  try {
    await page.waitForFunction(
      () => {
        const els = document.querySelectorAll('.market-item-card');
        return els.length > 0;
      },
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
    if (!ok) {
      return { minorId: cat.minorId, name: cat.name, error: "no content rendered" };
    }
    // small settle for lazy-rendered bars
    await page.waitForTimeout(800);
    const raw = await page.evaluate(EXTRACT_JS);
    const parsed = JSON.parse(raw);
    return {
      minorId: cat.minorId,
      name: cat.name,
      count: parsed.count,
      items: parsed.items,
    };
  } catch (err) {
    return { minorId: cat.minorId, name: cat.name, error: String(err).slice(0, 200) };
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cats = ONLY_CATEGORY
    ? CATEGORIES.filter((c) => c.minorId === ONLY_CATEGORY)
    : CATEGORIES;
  if (!cats.length) {
    console.error(`Category ${ONLY_CATEGORY} not found in map`);
    process.exit(1);
  }

  console.log(
    `Launching headless Chromium — ${cats.length} categor${cats.length === 1 ? "y" : "ies"}`
  );
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const started = Date.now();

  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const r = await scrapeCategory(browser, cat);
    results.push(r);
    const items = r.items ? r.items.length : 0;
    const err = r.error ? ` ERR: ${r.error.slice(0, 60)}` : "";
    console.log(
      `[${i + 1}/${cats.length}] ${cat.minorId} ${cat.name.padEnd(18)} items=${items}${err}`
    );
    // polite delay between categories
    if (i < cats.length - 1) await new Promise((res) => setTimeout(res, 700));
  }
  await browser.close();

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = OUT_FILE || path.join(OUT_DIR, `market_${ts}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "abi-tracker.azurewebsites.net/Market/View (DOM scrape)",
    categories: results,
    stats: {
      categories: results.length,
      errors: results.filter((r) => r.error).length,
      totalItems: results.reduce((a, r) => a + (r.items ? r.items.length : 0), 0),
      elapsedMs: Date.now() - started,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nSaved: ${outPath}`);
  console.log(
    `Stats: ${payload.stats.categories} categories, ${payload.stats.totalItems} items, ${payload.stats.errors} errors, ${(payload.stats.elapsedMs / 1000).toFixed(1)}s`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
