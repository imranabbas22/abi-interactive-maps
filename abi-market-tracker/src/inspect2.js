// Find the item NAME element inside market-item-card
import { chromium } from "playwright";
import { MARKET_URL } from "./categories.js";

const url = MARKET_URL("20210");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const card = document.querySelector(".market-item-card");
  if (!card) return "no card found";
  const out = ["=== first market-item-card full HTML ==="];
  out.push(card.outerHTML.slice(0, 3000));
  return out.join("\n");
});
console.log(info);
await browser.close();
