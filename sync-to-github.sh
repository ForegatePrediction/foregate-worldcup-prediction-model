#!/usr/bin/env bash
# One-command sync of THIS local folder to your GitHub repo.
# Handles everything automatically: added, changed and deleted files.
# Run on your own Mac, inside this folder:
#   bash sync-to-github.sh
#   bash sync-to-github.sh "your commit message"   # optional custom message
set -e
cd "$(dirname "$0")"

REPO="https://github.com/ForegatePrediction/foregate-worldcup-prediction-model.git"

rm -f .git/index.lock 2>/dev/null || true
[ -d .git ] || git init
git branch -M main 2>/dev/null || true
git config user.name  "$(git config user.name  || echo Dave)" >/dev/null 2>&1 || true
git config user.email "$(git config user.email || echo davewell@gphtech.com)" >/dev/null 2>&1 || true
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO"

git add -A
echo "=== Changes to be pushed (raw data stays gitignored) ==="
git status --short
echo

MSG="${1:-Update ForeGate model and add prediction API (server + serverless)}"
git commit -m "$MSG" || echo "(nothing to commit)"

# Overwrite GitHub with this local version (local is now the source of truth).
git push -u origin main --force

echo
echo "Done. After the first push, enable the daily updater on GitHub:"
echo "  Settings -> Actions -> General -> Workflow permissions -> 'Read and write permissions' -> Save"
echo "  (the .github/workflows/daily-update.yml job then runs once a day)"
