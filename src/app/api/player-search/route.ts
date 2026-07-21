import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const uid = searchParams.get('uid');

  if (!name && !uid) {
    return Response.json({ success: false, error: 'Provide ?name=xxx or ?uid=xxx' }, { status: 400 });
  }

  const searchType = name ? 'name' : 'uid';
  const keyword = name || uid!;

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
    const page = await ctx.newPage();
    await page.goto('https://abi-tracker.azurewebsites.net/Player/Search', { waitUntil: 'domcontentloaded', timeout: 15000 });

    if (searchType === 'uid') {
      await page.click('text=以UID查詢');
      await page.waitForTimeout(300);
      await page.waitForSelector('input[required]:visible', { timeout: 3000 });
    }

    const input = page.locator('input[required]:visible').first();
    await input.fill(keyword);
    await input.press('Enter');
    await page.waitForLoadState('networkidle');

    const playerName = await page.locator('h3').first().textContent().catch(() => '');
    if (!playerName || playerName === '查詢玩家資訊') {
      return Response.json({ success: false, error: `Player not found: ${keyword}` });
    }

    const lines = (await page.locator('main').innerText()).split('\n').map((l: string) => l.trim()).filter(Boolean);
    const findV = (p: string) => { for (const l of lines) if (l.includes(p)) return l.replace(p, '').trim(); return ''; };

    const result: any = {
      success: true,
      data: {
        name: playerName, uid: findV('UID：'), level: parseInt(findV('等級：')) || 0,
        rank: findV('目前段位：'), online: findV('是否在線上：') === '是',
        lastLogin: findV('上次登入時間：'), lastLogout: findV('上次登出時間：'),
        status: findV('狀態：'), inParty: findV('是否在隊伍中：') === '是',
        inCombat: findV('是否在戰鬥中：') === '是', partySize: findV('隊伍人數：'),
        overview: null,
      },
    };

    const ovTab = page.locator('button:has-text("概覽")');
    if (await ovTab.isVisible()) {
      await ovTab.click();
      await page.waitForSelector('text=遊戲天數', { timeout: 5000 });
      await page.waitForTimeout(500);
      const ovLines = (await page.locator('main').innerText()).split('\n').map((l: string) => l.trim()).filter(Boolean);
      const ov: any = {};
      for (let i = 0; i < ovLines.length; i++) {
        const l = ovLines[i], n = ovLines[i + 1] || '';
        if (l === '目前段位') ov.currentRank = n;
        else if (l === '賽季最高') ov.seasonHighest = n;
        else if (l === '歷史最高') ov.historicalHighest = n;
        else if (l === '註冊時間') ov.registrationDate = n;
        else if (l === '登入地區') ov.loginRegion = n;
        else if (l === '遊戲天數') ov.gameDays = parseInt(n) || 0;
        else if (l === '在線時長') ov.onlineHours = parseFloat(n) || 0;
        else if (l === '倉庫總價值') ov.warehouseValue = n;
        else if (l.includes('收藏庫價值')) {
          const p = n.split('|'); ov.collectionValue = (p[0] || '').trim(); ov.collectionItems = (p[1] || '').trim();
        } else if (l === '信譽等級') ov.reputationLevel = parseInt(n) || 0;
        else if (l === '對局數') ov.totalMatches = parseInt(n) || 0;
        else if (l === '匆匆撤離') ov.quickExtractions = parseInt(n) || 0;
        else if (l === '傑出行動') ov.outstandingActions = parseInt(n) || 0;
        else if (l === '擊殺數') ov.kills = parseInt(n) || 0;
        else if (l === '平均存活') ov.avgSurvival = n;
      }
      result.data.overview = ov;
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ success: false, error: String(err) });
  } finally {
    await browser.close();
  }
}
