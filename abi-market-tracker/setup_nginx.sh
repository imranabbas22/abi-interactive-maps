#!/bin/bash
# ABI Market Tracker — nginx setup (run with sudo)
# Inserts the /abi-market/ static location into the syedimransolutions site,
# tests the config, and reloads nginx. Safe to re-run (idempotent).
set -euo pipefail

CONF=/etc/nginx/sites-enabled/syedimransolutions
MARKER="# V2Ray VLESS+WebSocket (Discord tunnel)"

if grep -q "location /abi-market/" "$CONF"; then
  echo "OK: /abi-market/ already present — nothing to do."
else
  mkdir -p /home/ubuntu/nginx-backups
  cp "$CONF" "/home/ubuntu/nginx-backups/syedimransolutions.bak-$(date +%Y%m%d-%H%M%S)"
  echo "Backup written: /home/ubuntu/nginx-backups/syedimransolutions.bak-*"

  python3 - "$CONF" "$MARKER" <<'PYEOF'
import sys
conf, marker = sys.argv[1], sys.argv[2]
with open(conf) as f:
    text = f.read()
block = """    # ABI Market Tracker - static JSON snapshots (every 10 min) + graph
    location /abi-market/ {
        alias /home/ubuntu/abi-market-tracker/data/;
        add_header Access-Control-Allow-Origin *;
        default_type application/json;
    }
"""
assert marker in text, "marker not found in config!"
text = text.replace(marker, block + "\n" + marker, 1)
with open(conf, "w") as f:
    f.write(text)
print("Inserted /abi-market/ location before: " + marker)
PYEOF
fi

echo "--- nginx config test ---"
nginx -t
echo "--- reload ---"
systemctl reload nginx
echo "DONE: https://syedimransolutions.info/abi-market/latest.json should now work"
