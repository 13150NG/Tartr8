#!/bin/sh
# Runs a command against the LIVE database (Neon on Vercel).
# Fetches the connection details into a temporary file, runs the command, then deletes the file.
# Usage: sh scripts/with-live-db.sh node server/accounts.js
set -e
cd "$(dirname "$0")/.."
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
vercel env pull "$ENV_FILE" --environment=production --yes >/dev/null 2>&1
DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"
[ -n "$DATABASE_URL" ] || { echo "Couldn't read DATABASE_URL from Vercel. Run 'vercel login' and try again."; exit 1; }
DATABASE_URL="$DATABASE_URL" NODE_NO_WARNINGS=1 "$@"
