#!/usr/bin/env bash
# Deploy the email tracker to the openclaw Oracle server.
#
#   ./deploy.sh            # rsync + npm ci + restart + health check
#
# Server layout (see README "Self-hosted deployment"):
#   code      /home/opc/email-tracker
#   service   email-tracker.service  (systemd, /usr/bin/node, port 3005)
#   database  mongod on 127.0.0.1:27017, db "email-tracker"
#   public    https://jaydenszeto.me/email-tracker/  (Caddy handle_path → :3005)
set -euo pipefail

HOST="${DEPLOY_HOST:-openclaw}"
REMOTE_DIR="${DEPLOY_DIR:-/home/opc/email-tracker}"
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://jaydenszeto.me/email-tracker}"

cd "$(dirname "$0")"

echo "▶ running tests"
npm test --silent

echo "▶ syncing to $HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .DS_Store \
  --exclude chrome-extension.zip --exclude tracking-data.json --exclude .env \
  ./ "$HOST:$REMOTE_DIR/"

echo "▶ installing deps + restarting service"
ssh "$HOST" "cd $REMOTE_DIR && npm ci --omit=dev --silent && sudo systemctl restart email-tracker && sleep 2 && systemctl is-active email-tracker"

echo "▶ health"
curl -fsS "$PUBLIC_URL/health"; echo
