const { chromium } = require('playwright');

async function searchPlayer(searchType, keyword) {
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();
    
    await page.goto('https://abi-tracker.azurewebsites.net/Player/Search', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    
    if (searchType === 'UID') {
      await page.click('text=以UID查詢');
      await page.waitForTimeout(500);
    }
    
    const input = page.locator('input[required]').first();
    await input.fill(keyword);
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    
    const playerName = await page.locator('h3').first().textContent().catch(() => '');
    const errorText = await page.locator('text=找不到').textContent().catch(() => '');
    
    if (errorText || !playerName || playerName === '查詢玩家資訊') {
      return { success: false, error: errorText || `Not found: ${keyword}` };
    }
    
    const bodyText = await page.locator('main').innerText();
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    
    const result = {
      success: true,
      data: {
        name: playerName,
        uid: '',
        level: 0,
        rank: '',
        online: false,
        lastLogin: '',
        lastLogout: '',
        status: '',
        inParty: false,
        inCombat: false,
        partySize: '',
        overview: null,
      },
    };
    
    // Parse fields
    const findValue = (prefix) => {
      for (const line of lines) {
        if (line.includes(prefix)) return line.replace(prefix, '').trim();
      }
      return '';
    };
    
    result.data.uid = findValue('UID：');
    result.data.level = parseInt(findValue('等級：')) || 0;
    result.data.rank = findValue('目前段位：');
    result.data.online = findValue('是否在線上：') === '是';
    result.data.lastLogin = findValue('上次登入時間：');
    result.data.lastLogout = findValue('上次登出時間：');
    result.data.status = findValue('狀態：');
    result.data.inParty = findValue('是否在隊伍中：') === '是';
    result.data.inCombat = findValue('是否在戰鬥中：') === '是';
    result.data.partySize = findValue('隊伍人數：');
    
    // Click Overview tab
    const overviewTab = page.locator('button:has-text("概覽")');
    if (await overviewTab.isVisible()) {
      await overviewTab.click();
      await page.waitForSelector('text=遊戲天數', { timeout: 5000 });
      await page.waitForTimeout(500);
      
      const ovText = await page.locator('main').innerText();
      const ovLines = ovText.split('\n').map(l => l.trim()).filter(Boolean);
      
      const ov = {
        currentRank: '',
        seasonHighest: '',
        historicalHighest: '',
        registrationDate: '',
        loginRegion: '',
        gameDays: 0,
        onlineHours: 0,
        warehouseValue: '',
        collectionValue: '',
        collectionItems: '',
        reputationLevel: 0,
        totalMatches: 0,
        quickExtractions: 0,
        outstandingActions: 0,
        kills: 0,
        avgSurvival: '',
      };
      
      for (let i = 0; i < ovLines.length; i++) {
        const line = ovLines[i];
        const next = ovLines[i + 1] || '';
        if (line === '目前段位') ov.currentRank = next;
        else if (line === '賽季最高') ov.seasonHighest = next;
        else if (line === '歷史最高') ov.historicalHighest = next;
        else if (line === '註冊時間') ov.registrationDate = next;
        else if (line === '登入地區') ov.loginRegion = next;
        else if (line === '遊戲天數') ov.gameDays = parseInt(next) || 0;
        else if (line === '在線時長') ov.onlineHours = parseFloat(next) || 0;
        else if (line === '倉庫總價值') ov.warehouseValue = next;
        else if (line.includes('收藏庫價值')) {
          const parts = next.split('|');
          ov.collectionValue = (parts[0] || '').trim();
          ov.collectionItems = (parts[1] || '').trim();
        }
        else if (line === '信譽等級') ov.reputationLevel = parseInt(next) || 0;
        else if (line === '對局數') ov.totalMatches = parseInt(next) || 0;
        else if (line === '匆匆撤離') ov.quickExtractions = parseInt(next) || 0;
        else if (line === '傑出行動') ov.outstandingActions = parseInt(next) || 0;
        else if (line === '擊殺數') ov.kills = parseInt(next) || 0;
        else if (line === '平均存活') ov.avgSurvival = next;
      }
      
      result.data.overview = ov;
    }
    
    return result;
  } finally {
    await browser.close();
  }
}

// CLI
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(JSON.stringify({ error: 'Usage: node scrape-player.js name|uid <keyword>' }));
    process.exit(1);
  }
  
  const [type, keyword] = args;
  const result = await searchPlayer(type, keyword);
  console.log(JSON.stringify(result, null, 2));
})().catch(e => {
  console.log(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
