#!/bin/bash
# ABI Market Tracker — token endpoint nginx setup (run with sudo)
# Adds the /abi-market-token/ location (proxy → 127.0.0.1:3104 token server)
# to the syedimransolutions site, tests, and reloads. Idempotent.
set -euo pipefail

CONF=/etc/nginx/sites-enabled/syedimransolutions
MARKER="# ABI Market Tracker - static JSON snapshots (every 10 min) + graph"

if grep -q "location /abi-market-token/" "$CONF"; then
  echo "OK: /abi-market-token/ already present — nothing to do."
else
  mkdir -p /home/ubuntu/nginx-backups
  cp "$CONF" "/home/ubuntu/nginx-backups/syedimransolutions.bak-$(date +%Y%m%d-%H%M%S)"
  echo "Backup written: /home/ubuntu/nginx-backups/syedimransolutions.bak-*"

  python3 - "$CONF" "$MARKER" <<'PYEOF'
import sys
conf, marker = sys.argv[1], sys.argv[2]
with open(conf) as f:
    text = f.read()
block = """    # ABI Market Tracker - token update endpoint (POST new session token)
    location /abi-market-token/ {
        proxy_pass http://127.0.0.1:3104/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
"""
assert marker in text, "marker not found in config!"
text = text.replace(marker, block + "\n" + marker, 1)
with open(conf, "w") as f:
    f.write(text)
print("Inserted /abi-market-token/ location before: " + marker)
PYEOF
fi

echo "--- nginx config test ---"
nginx -t
echo "--- reload ---"
systemctl reload nginx
echo "DONE: /abi-market-token/ now proxies to the token server on 127.0.0.1:3104"
