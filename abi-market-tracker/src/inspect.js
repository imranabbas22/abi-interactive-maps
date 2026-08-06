// Inspect the DOM structure around price bars to find current class names
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

// dump the classes of all elements containing "價格" or price bars
const info = await page.evaluate(() => {
  const out = [];
  // find all elements with title attr containing 價格
  const withTitle = [...document.querySelectorAll('[title*="價格"]')];
  out.push(`elements with 價格 title: ${withTitle.length}`);
  if (withTitle.length) {
    const el = withTitle[0];
    out.push(`first: tag=${el.tagName} class="${el.className}" title="${el.getAttribute('title')}"`);
    // walk up to find the container structure
    let p = el.parentElement;
    let depth = 0;
    while (p && depth < 6) {
      out.push(`  parent[${depth}]: tag=${p.tagName} class="${p.className.slice(0, 120)}"`);
      p = p.parentElement;
      depth++;
    }
  }
  // also look for item names nearby
  const names = [...document.querySelectorAll("div,span,td,h5,h6,a")].filter(
    (e) => e.children.length === 0 && /子彈|彈匣|頭盔|防彈衣/.test(e.textContent || "") && (e.textContent || "").trim().length < 60
  );
  out.push(`\ncandidate name elements: ${names.length}`);
  names.slice(0, 8).forEach((e) => out.push(`  ${e.tagName}.${e.className.slice(0, 60)} = "${e.textContent.trim().slice(0, 50)}"`));
  return out.join("\n");
});
console.log(info);
await browser.close();
