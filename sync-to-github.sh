#!/usr/bin/env bash
# One-command sync of THIS local folder to your GitHub repo.
# It handles everything automatically: updated files, the 4 deleted files (market.mjs,
# market-snapshot.json, make-groups.mjs, gen-results.mjs), and the new .github workflow.
# Run on your own Mac, inside this folder:  bash sync-to-github.sh
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

git commit -m "Real 48 teams + official FIFA groups; remove market comparison; MIT license; daily Elo update" || echo "(nothing to commit)"

# Overwrite GitHub with this local version (local is now the source of truth).
git push -u origin main --force

echo
echo "Done. After the first push, enable the daily updater on GitHub:"
echo "  Settings -> Actions -> General -> Workflow permissions -> 'Read and write permissions' -> Save"
echo "  (the .github/workflows/daily-update.yml job then runs once a day)"
