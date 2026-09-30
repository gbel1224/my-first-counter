#!/usr/bin/env bash
# Publish Palm City to the GitHub Pages root. The original game stays at /v1/ and the very first
# prototype at /classic/; nothing else at the root survives a deploy.
#   bash tools/deploy.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")/.."
GAME="$(pwd)"
REPO="$(git rev-parse --show-toplevel)"
MSG="${1:-Deploy Palm City}"
cd "$REPO"
git fetch -q origin gh-pages
rm -rf /tmp/ghp
git worktree add -q /tmp/ghp FETCH_HEAD
cd /tmp/ghp
for f in $(ls -A); do
  case "$f" in .git|.nojekyll|classic|v1) ;; *) rm -rf "$f" ;; esac
done
cp -r "$GAME/index.html" "$GAME/style.css" "$GAME/src" "$GAME/vendor" "$GAME/assets" .
# old /next/ links keep working
mkdir -p next && printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../"><title>Palm City</title><a href="../">Palm City</a>\n' > next/index.html
touch .nojekyll
git add -A
git commit -qm "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FL9KhQiSFWN4JQnGay646q" || echo "nothing to commit"
git push -q origin HEAD:gh-pages
cd "$REPO"
git worktree remove --force /tmp/ghp || true
echo deployed
