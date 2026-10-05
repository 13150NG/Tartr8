#!/bin/bash
# Deploys the TARTR8 app from the cPanel Git repository into the Node.js app folder.
# Run by cPanel via .cpanel.yml (working directory = repository root).
#
# Settings (defaults suit most cPanel hosts; override in the "Environment variables"
# of cPanel's Setup Node.js App, or edit the defaults below):
#   APP_DIR   Node.js app root, as entered in Setup Node.js App   (default: ~/tartr8)
#
# The SQLite database is never touched: it should live outside APP_DIR (set DB_FILE
# in Setup Node.js App, e.g. /home/<user>/tartr8-data/tartr8.db), and server/data
# is excluded from the copy anyway.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_DIR:-$HOME/tartr8}"
LOG() { echo "[tartr8-deploy $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

LOG "Source: $SRC"
LOG "Target: $APP_DIR"
mkdir -p "$APP_DIR"

# 1. Copy the app. --delete removes files deleted from git, but never the excluded paths.
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude 'server/data' \
  --exclude 'tmp' \
  --exclude 'public' \
  --exclude 'test' \
  --exclude '.env*' \
  --exclude '.vercel' \
  --exclude '.agents' --exclude '.claude' --exclude 'skills-lock.json' \
  --exclude 'stderr.log' \
  "$SRC/" "$APP_DIR/"
LOG "Files copied"

# 2. Install production dependencies inside the Node.js virtual environment that
#    cPanel's Setup Node.js App created (~/nodevenv/<app-folder>/<node-version>/).
APP_NAME="$(basename "$APP_DIR")"
ACTIVATE="$(ls -d "$HOME"/nodevenv/"$APP_NAME"/*/bin/activate 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -n "$ACTIVATE" ]; then
  # CloudLinux's activate script reads variables that may be unset, so relax `set -u` while sourcing it.
  set +u
  # shellcheck disable=SC1090
  source "$ACTIVATE"
  set -u
  LOG "Node $(node -v) from $(dirname "$(dirname "$ACTIVATE")")"
  cd "$APP_DIR"
  npm install --omit=dev --no-audit --no-fund
  LOG "Dependencies installed"
else
  LOG "WARNING: no Node.js environment found at ~/nodevenv/$APP_NAME/."
  LOG "Create the app in cPanel > Setup Node.js App (Application root: $APP_NAME), then deploy again."
  exit 1
fi

# 3. Restart the app (Phusion Passenger watches this file).
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"
LOG "App restarted. Deployment complete."
