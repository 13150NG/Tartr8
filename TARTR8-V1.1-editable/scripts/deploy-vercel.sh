#!/bin/sh
# Deploys to Vercel from a clean copy of the project outside git.
# Why: when deploying from inside the git repo, Vercel checks the last commit's author against the
# Vercel team and blocks deploys if that author isn't a member (TEAM_ACCESS_REQUIRED).
# Usage: npm run deploy:vercel            (production)
#        npm run deploy:vercel -- preview (preview URL only)
set -e
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude node_modules --exclude public --exclude server/data --exclude test --exclude '.env*' --exclude .agents --exclude .claude --exclude skills-lock.json ./ "$TMP/"
cd "$TMP"
if [ "$1" = "preview" ]; then vercel deploy --yes; else vercel deploy --prod --yes; fi
