// ABI Store Token Server — lets the graph page update the session token
// when it expires, without SSH. Listens on 127.0.0.1:3104 (nginx proxies
// /abi-market-token/ → here).
//
//   GET  /status            → current token state + days left
//   POST /update            → body {token, openid?, token_expire_ts?}
//                             validates the token against the IDE API;
//                             on success writes store_config.json
//
// Run:  node token_server.js   (or pm2 start token_server.js --name abi-token-server)

import http from "http";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "store_config.json");
const STATUS_FILE = path.join(__dirname, "data", "token_status.json");
const IDE_URL = "https://sg-apps.vasdgame.com/ide/";
const PORT = parseInt(process.env.TOKEN_SERVER_PORT || "3104", 10);

const BODY = (token, openid) => ({
  iChartId: "100011807",
  sIdeToken: "VYEmxk",
  sLanguage: "en",
  openid,
  token,
  gameid: "30061",
  instanceid: "4009844",
  os: "3",
  channelid: "131",
  sArea: "1",
  sPlatId: "0",
  params: '{"itemIds":[{"item_id":"101010001","num":1}]}',
});

function probeToken(token, openid) {
  // validate against the real IDE API (1 item) — curl required (chart rejects httpx)
  const body = BODY(token, openid);
  const qs = Object.entries(body).map(([k, v]) => `${k}=${v}`).join("&");
  const args = [
    "-s", "--max-time", "20", "-X", "POST", IDE_URL,
    "-H", "Content-Type: application/x-www-form-urlencoded",
    "-H", "Origin: https://www.arenabreakoutinfinite.com",
    "-H", "Referer: https://www.arenabreakoutinfinite.com/",
    "--data", qs,
  ];
  const out = execFileSync("curl", args, { encoding: "utf8" });
  return JSON.parse(out);
}

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function readConfig() { return readJSON(CONFIG_FILE, {}); }
function readStatus() { return readJSON(STATUS_FILE, {}); }

function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { send(res, 204, {}); return; }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const route = url.pathname;

  if (req.method === "GET" && route === "/status") {
    const cfg = readConfig();
    const st = readStatus();
    send(res, 200, {
      ok: true,
      tokenSet: !!cfg.token,
      state: st.state || "unknown",
      daysLeft: st.daysLeft ?? null,
      message: st.message || "",
    });
    return;
  }

  if (req.method === "POST" && route === "/update") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 8192) req.destroy(); });
    req.on("end", () => {
      let input;
      try { input = JSON.parse(raw || "{}"); } catch { send(res, 400, { ok: false, error: "invalid JSON" }); return; }
      const token = (input.token || "").trim();
      const openid = (input.openid || "").trim() || "15314206484085228867";
      if (!/^[0-9a-fA-F]{40}$/.test(token)) {
        send(res, 400, { ok: false, error: "token must be 40 hex chars (from milo_intl_cookie)" });
        return;
      }
      // validate against the live API before saving
      let probe;
      try { probe = probeToken(token, openid); } catch (e) { send(res, 502, { ok: false, error: "probe failed: " + e.message }); return; }
      if (probe.ret !== 0) {
        send(res, 400, { ok: false, error: `token rejected by API (ret=${probe.ret} ${probe.sMsg || ""})` });
        return;
      }
      // save
      const cfg = readConfig();
      const expire = parseInt(input.token_expire_ts || "0", 10) || (Math.floor(Date.now() / 1000) + 30 * 86400);
      const next = {
        token,
        openid,
        token_expire_ts: expire,
        note: "updated via token server",
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
      // clear the dead flag
      try { fs.unlinkSync(STATUS_FILE); } catch {}
      console.log(`[${new Date().toISOString()}] token updated (openid=${openid}, expires ${new Date(expire * 1000).toISOString()})`);
      send(res, 200, { ok: true, tokenSet: true, expireTs: expire });
    });
    return;
  }

  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ABI token server on http://127.0.0.1:${PORT} (status/update)`);
});
