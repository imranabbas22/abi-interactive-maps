// Debug Port Keys (40506) — check if category exists / what it renders
import { chromium } from "playwright";
import { MARKET_URL } from "./categories.js";

const url = MARKET_URL("40506");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(15000);
console.log("URL:", page.url());
console.log("cards:", await page.evaluate(() => document.querySelectorAll('.market-item-card').length));
console.log("body tail:", (await page.evaluate(() => document.body.innerText)).slice(-400));
await page.screenshot({ path: "data/debug_40506.png" });
await browser.close();
