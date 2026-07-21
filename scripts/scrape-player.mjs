#!/usr/bin/env node
/**
 * ABI Player Scraper - v1.0
 * Scrapes player data from abi-tracker.azurewebsites.net via Playwright
 * 
 * Usage:
 *   node scripts/scrape-player.mjs name <player_name>
 *   node scripts/scrape-player.mjs uid  <player_uid>
 * 
 * Output: JSON to stdout
 * Exit codes: 0=success, 1=usage error, 2=player not found, 3=network error
 */

import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(JSON.stringify({ 
    success: false, 
    error: "Usage: node scrape-player.mjs name|uid <keyword>",
    usage: { name: "node scrape-player.mjs name FriedPickles", uid: "node scrape-player.mjs uid 7772809883323245300" }
  }));
  process.exit(1);
}

const searchType = args[0].toLowerCase();
const keyword = args[1];

if (!["name", "uid"].includes(searchType)) {
  console.log(JSON.stringify({ success: false, error: "Search type must be 'name' or 'uid'" }));
  process.exit(1);
}

const TIMEOUT = 20000;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ 
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1280, height: 720 }
  });
  const page = await ctx.newPage();

  // Navigate to search page
  await page.goto("https://abi-tracker.azurewebsites.net/Player/Search", { 
    waitUntil: "domcontentloaded", 
    timeout: TIMEOUT 
  });

  // Switch to UID tab if needed
  if (searchType === "uid") {
    const uidTab = page.locator("text=以UID查詢");
    await uidTab.click();
    await page.waitForSelector("input[required]:visible", { timeout: 5000 });
  }

  // Fill and submit search
  const input = page.locator("input[required]:visible").first();
  await input.fill(keyword);
  await input.press("Enter");
  
  // Wait for navigation and content
  try {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  } catch {
    // Sometimes networkidle never resolves on this site
  }

  // Check if we got results or error
  const pageTitle = await page.title();
  if (pageTitle.includes("錯誤")) {
    const errorMsg = await page.locator("main").innerText().catch(() => "Unknown error");
    console.log(JSON.stringify({ success: false, error: errorMsg.trim() }));
    process.exit(2);
  }

  // Extract player name from heading
  const playerName = await page.locator("h3").first().textContent().catch(() => "");
  if (!playerName || playerName === "" || playerName === "-" || playerName.includes("查詢")) {
    console.log(JSON.stringify({ success: false, error: `Player not found: "${keyword}"` }));
    process.exit(2);
  }

  // Parse basic info
  const mainText = await page.locator("main").innerText();
  const lines = mainText.split("\n").map(l => l.trim()).filter(Boolean);
  
  const find = (prefix) => {
    for (const l of lines) {
      if (l.startsWith(prefix)) return l.slice(prefix.length).trim();
    }
    return "";
  };

  const result = {
    success: true,
    data: {
      name: playerName,
      uid: find("UID："),
      level: parseInt(find("等級：")) || 0,
      rank: find("目前段位："),
      online: find("是否在線上：") === "是",
      lastLogin: find("上次登入時間："),
      lastLogout: find("上次登出時間："),
      status: find("狀態："),
      inParty: find("是否在隊伍中：") === "是",
      inCombat: find("是否在戰鬥中：") === "是",
      partySize: find("隊伍人數："),
      overview: null
    }
  };

  // Click Overview tab for detailed stats
  const overviewTab = page.locator("button", { hasText: "概覽" });
  if (await overviewTab.isVisible().catch(() => false)) {
    await overviewTab.click();
    try {
      await page.waitForSelector("text=遊戲天數", { timeout: 5000 });
      await page.waitForTimeout(300);
      
      const ovText = await page.locator("main").innerText();
      const ovLines = ovText.split("\n").map(l => l.trim()).filter(Boolean);
      
      const overview = {};
      for (let i = 0; i < ovLines.length - 1; i++) {
        const label = ovLines[i];
        const value = ovLines[i + 1];
        
        if (label === "目前段位") overview.currentRank = value;
        else if (label === "賽季最高") overview.seasonHighest = value;
        else if (label === "歷史最高") overview.historicalHighest = value;
        else if (label === "上次解禁時間") overview.lastUnban = value;
        else if (label === "註冊時間") overview.registrationDate = value;
        else if (label === "登入地區") overview.loginRegion = value;
        else if (label === "遊戲天數") overview.gameDays = parseInt(value) || 0;
        else if (label === "在線時長") overview.onlineHours = parseFloat(value) || 0;
        else if (label === "倉庫總價值") overview.warehouseValue = value;
        else if (label.includes("收藏庫價值")) {
          const parts = value.split("|");
          overview.collectionValue = (parts[0] || "").trim();
          overview.collectionCount = (parts[1] || "").trim();
        }
        else if (label === "信譽等級") overview.reputationLevel = parseInt(value) || 0;
        else if (label === "對局數") overview.totalMatches = parseInt(value) || 0;
        else if (label === "匆匆撤離") overview.quickExtractions = parseInt(value) || 0;
        else if (label === "傑出行動") overview.outstandingActions = parseInt(value) || 0;
        else if (label === "擊殺數") overview.kills = parseInt(value) || 0;
        else if (label === "平均存活") overview.avgSurvivalSeconds = value;
      }
      result.data.overview = overview;
    } catch {
      result.data.overview = { error: "Overview tab failed to load" };
    }
  }

  console.log(JSON.stringify(result, null, 2));

} catch (err) {
  console.log(JSON.stringify({ 
    success: false, 
    error: `Network/connection error: ${err.message}` 
  }));
  process.exit(3);
} finally {
  if (browser) await browser.close().catch(() => {});
}
