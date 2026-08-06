#!/bin/bash
# Fix: move nginx config backups OUT of sites-enabled/ (they break
# `include sites-enabled/*` via duplicate limit_req_zone definitions),
# then test + reload.
set -euo pipefail

mkdir -p /home/ubuntu/nginx-backups
moved=0
for f in /etc/nginx/sites-enabled/*.bak-*; do
  [ -e "$f" ] || continue
  mv "$f" /home/ubuntu/nginx-backups/
  echo "Moved $f -> /home/ubuntu/nginx-backups/"
  moved=1
done
[ "$moved" = "1" ] || echo "No stray backups found."

echo "--- nginx config test ---"
nginx -t
echo "--- reload ---"
systemctl reload nginx
echo "DONE"
