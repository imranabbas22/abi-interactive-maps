// Debug: navigate to one market category and dump page state
import { chromium } from "playwright";
import { MARKET_URL } from "./categories.js";

const url = MARKET_URL("20210");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
});
const page = await context.newPage();
page.on("console", (msg) => console.log(`[console.${msg.type()}]`, msg.text().slice(0, 200)));
page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 300)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(6000);

console.log("URL:", page.url());
console.log("TITLE:", await page.title());
console.log("BODY class:", await page.evaluate(() => document.body.className));
console.log("BODY text (first 800):", (await page.evaluate(() => document.body.innerText)).slice(0, 800));
console.log("\nitem-name count:", await page.evaluate(() => document.querySelectorAll('.item-name').length));
console.log("price-bar count:", await page.evaluate(() => document.querySelectorAll('.price-bar-row').length));
console.log("table rows:", await page.evaluate(() => document.querySelectorAll('tr').length));

// screenshot
await page.screenshot({ path: "data/debug_20210.png", fullPage: false });
console.log("\nscreenshot saved");
await browser.close();
