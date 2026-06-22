# Pre-publish checklist / 發布前檢查清單 (ForeGate World Cup model)

## Data & teams / 資料與球隊
- [x] Official 48 qualified teams + real Elo (eloratings.net) via `data/import-elo.mjs`
      / 官方 48 強 + 真實 Elo
- [x] Official FIFA group draw in `data/groups.json` / 官方分組
- [x] `data/results.json` derived from martj42 (CC0); raw CSV stays in gitignored `data/raw/`
      / 真實賽果(martj42 CC0),原始 CSV 不入庫
- [ ] Refresh Elo snapshot date if needed (`SNAPSHOT_DATE` in `data/import-elo.mjs`) or rely on
      `update-elo.mjs` / 視需要刷新 Elo 快照

## Compliance / 合規
- [x] License = MIT (`LICENSE`, `package.json`) / 協議為 MIT
- [x] No external-market / odds comparison features / 無市場對照功能
- [x] No competitor named in docs or code / 文件與程式碼不點名競品
- [ ] No keys / tokens in the repo (`git grep -iE "api[_-]?key|secret|token|password"` empty)
      / 無密鑰
- [x] Attribution: eloratings.net + martj42 in README / 已署名

## Verify build / 跑通驗證
```bash
node data/import-elo.mjs
node simulate.mjs && node build.mjs && node backtest.mjs
```
- [ ] `outputs/` JSON/CSV refreshed / `outputs/` 已刷新

## Daily updates / 每日更新
- [x] `update-elo.mjs` (fetch eloratings -> simulate -> build) / 刷新腳本
- [x] `.github/workflows/daily-update.yml` (scheduled, auto-commit) / 定時工作流
- [ ] After first push, enable Actions and grant write permission to the workflow
      (Settings → Actions → General → Workflow permissions → Read and write)
      / 首次推送後在 Settings 開啟 Actions 並授予寫入權限

## Repo metadata / 倉庫資訊
- [ ] Description + Topics (`world-cup-2026 elo dixon-coles monte-carlo soccer predictions sports-analytics`)
- [ ] Disclaimer: not betting advice / 免責:非投注建議

## Git
- [ ] On your own Mac, in this folder: `bash git-init.sh` (init + first commit), then push
      / 在本機執行 `bash git-init.sh` 後推送
