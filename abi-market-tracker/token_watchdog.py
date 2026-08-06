#!/usr/bin/env python3
"""
ABI Store token watchdog — keeps the official IDE API token alive.

Every day (cron):
1. Calls the IDE market endpoint with ONE item to verify the token is alive.
2. Checks token_expire_time from store_config.json and computes days left.
3. Writes data/token_status.json — the graph reads this to show
   a green/yellow/red banner ("token expires in X days" / "token dead").
4. If token is dead (ret=101) or <7 days left, appends a loud line to
   data/token_alert.log AND writes a clear flag so the graph header shows it.

The refresh itself stays a 2-minute manual step (login at the Helper Store
on your home browser, paste the new token into store_config.json) UNLESS a
credential-free refresh endpoint is found — the watchdog then gets upgraded.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = BASE                                   # abi-market-tracker/ (watchdog lives in root)
CONFIG_PATH = os.path.join(ROOT, "store_config.json")
STATUS_PATH = os.path.join(ROOT, "data", "token_status.json")
ALERT_LOG = os.path.join(ROOT, "data", "token_alert.log")
IDE_URL = "https://sg-apps.vasdgame.com/ide/"
WARN_DAYS = 7

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

def load_cfg():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)

def check_token(cfg):
    """One IDE market call — cheapest liveness probe (1 item)."""
    body = {
        "iChartId": "100011807",
        "sIdeToken": "VYEmxk",
        "sLanguage": "en",
        "openid": cfg["openid"],
        "token": cfg["token"],
        "gameid": "30061",
        "instanceid": "4009844",
        "os": "3",
        "channelid": "131",
        "sArea": "1",
        "sPlatId": "0",
        "params": '{"itemIds":[{"item_id":"101010001","num":1}]}',
    }
    args = ["curl", "-s", "--max-time", "20", "-X", "POST", IDE_URL,
            "-H", "Content-Type: application/x-www-form-urlencoded",
            "-H", "Origin: https://www.arenabreakoutinfinite.com",
            "-H", "Referer: https://www.arenabreakoutinfinite.com/",
            "--data", "&".join(f"{k}={v}" for k, v in body.items())]
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=30).stdout
        data = json.loads(out)
    except Exception as e:
        return {"ok": False, "reason": f"probe error: {e}", "ret": None}
    return {"ok": data.get("ret") == 0, "ret": data.get("ret"), "reason": data.get("sMsg", "")}

def main():
    cfg = load_cfg()
    probe = check_token(cfg)

    expire_ts = cfg.get("token_expire_ts") or 0
    days_left = (expire_ts - time.time()) / 86400 if expire_ts else None

    status = {
        "checkedAt": now_iso(),
        "tokenOk": probe["ok"],
        "ret": probe.get("ret"),
        "reason": probe.get("reason", ""),
        "expireTs": expire_ts,
        "daysLeft": round(days_left, 1) if days_left is not None else None,
        "state": "ok",
    }
    if not probe["ok"]:
        status["state"] = "dead"
        status["message"] = "TOKEN DEAD — store prices stopped. Re-login at the Helper Store and update store_config.json"
    elif days_left is not None and days_left < WARN_DAYS:
        status["state"] = "expiring"
        status["message"] = f"Store token expires in {status['daysLeft']} days — refresh soon (Helper Store login)"
    else:
        status["message"] = f"Token OK — {status['daysLeft']} days left" if days_left is not None else "Token OK"

    os.makedirs(os.path.dirname(STATUS_PATH), exist_ok=True)
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)

    print(f"[{now_iso()}] state={status['state']} ret={status.get('ret')} daysLeft={status.get('daysLeft')} {status['message']}")

    # loud alert line when bad
    if status["state"] != "ok":
        with open(ALERT_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{now_iso()}] {status['message']}\n")

if __name__ == "__main__":
    sys.exit(main())
