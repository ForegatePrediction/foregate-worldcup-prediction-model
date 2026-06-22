# 🏆 ForeGate 世界盃 2026 預測模型

> English version: [README.md](README.md)

一套開源、透明、敢公示命中率的 2026 世界盃統計模型 —— **賽事加權 Elo → Dixon-Coles 雙變量
卜瓦松 → 蒙地卡羅全賽程模擬**。沒有機器學習黑箱,不把任何盤口當輸入;確定性、可重現、可稽核。

倉庫已附帶**真實資料**:官方 48 強名單與各隊當前國家隊 Elo(來自 World Football Elo,
[eloratings.net](https://www.eloratings.net))、官方 FIFA 分組,以及衍生自
[martj42 international results](https://github.com/martj42/international_results)(CC0)的真實比賽
歷史。賽事期間評級可每日刷新(見 [每日更新](#每日更新))。

---

## 快速開始

零相依套件,Node 18+。倉庫已內含真實評級,clone 後即可直接預測:

```bash
git clone https://github.com/<你>/foregate-worldcup-model.git
cd foregate-worldcup-model

node predict.mjs spain germany     # 單場 1X2 + 進球 + 驅動因素
node predict.mjs usa mexico usa    # 第三個參數 = 主場隊(主辦國加成)
node simulate.mjs 10000 2026       # 全賽程蒙地卡羅(奪冠 / 晉級機率)
node build.mjs                     # 產出 JSON + CSV 資料(供研報 / 資料卡 / API)
node backtest.mjs                  # 重現樣本外命中率
```

`predict.mjs` 會輸出勝/和/負、期望進球、大小球 2.5、雙方進球(BTTS)、最可能比分,以及簡短驅動因素。

---

## 方法論

### 1. 球隊實力評級(賽事加權 Elo) — `elo.mjs` + `calibrate.mjs`
每隊由長期實力先驗出發,在近期真實國際賽上逐場校準。更新規則吸收 World Football Elo 的精髓:

- **賽事重要性 K**:世界盃決賽圈 K=60 > 洲際盃賽 50 > 資格賽 40 > 國家聯賽 32 > 友誼賽 20。
- **淨勝球放大**:贏 2 球 ×1.5、3 球 ×1.75……大勝是更強的實力證據。
- **18 個月半衰期時間衰減**:近期狀態權重更高。
- **主辦國主場加成**:僅 US/MEX/CAN 於 2026 本土比賽時 +75 Elo。
- **70/30 收縮**:最終 = 0.7×校準值 + 0.3×先驗,壓制友誼賽雜訊。

### 2. 單場比賽(Dixon-Coles 雙卜瓦松) — `elo.mjs`
評級差 → 期望進球 λ(`1.35 + diff/350`,夾在 0.3–3.5)→ 雙卜瓦松枚舉 0–8 球聯合機率 →
勝/和/負、大小球、雙方進球(BTTS)、Top-N 比分。**Dixon-Coles τ 修正**(ρ = −0.13)校正一般
卜瓦松對 0-0、1-1 低比分和局的低估。

### 3. 全賽程蒙地卡羅 — `simulate.mjs`
2026 賽制:12 組 × 4 隊 → 每組前 2 + 8 個最佳第三 = 32 → 32 強淘汰賽 → 16 強 → 8 強 → 4 強 → 決賽。
- 預設 **10,000 次 seeded 模擬**(`mulberry32` 固定種子 → 同輸入永遠同輸出 = 可稽核)。
- 小組賽抽樣真實比分(允許和局);淘汰賽 `allowDraw=false`,和局按 Elo 機率做 PK 微調。
- **90 分鐘勝負(1X2)與晉級結果(含 PK)嚴格分離** —— 不拿晉級率當 90 分鐘勝率。
- 輸出每隊**晉級 / 16強 / 8強 / 4強 / 決賽 / 奪冠**機率 + 奪冠 95% 信賴區間。

### 4. 可解釋層 — `explain.mjs`
每個輸出附帶簡短「驅動因素」(實力差、主場、和局傾向、期望比分),可直接餵研報 / 資料卡。

---

## 回測與命中率公示 — `backtest.mjs`

走樣本外、**無未來資訊洩漏**:每場只用此前資料建立的評級預測,預測完再更新。報告命中率、
Brier、**RPS**(有序 1X2 的標準計分)、log-loss、**ECE 校準誤差**與可靠度曲線,並與基線對照。

在約 8,000 場真實國際賽(martj42 資料,2018 年起)上,模型勝平負命中率約 **57–58%**、校準極佳
(**ECE ≈ 1.6%**),Brier 與 RPS 遠勝均勻基線。誠實口徑:命中率與「直接選較高 Elo 方」幾乎
持平,模型真正的增值在機率校準;不宣稱戰勝博彩市場。失敗案例公開、不藏短;賽事進行中即時
滾動「已預測 X 場 / 命中 Y 場 / 當前命中率 Z%」。

---

## 交付物 — `build.mjs` → `outputs/`

| 檔案 | 內容 |
|---|---|
| `outputs/foregate-tournament.json` / `.csv` | 48 隊:各階段晉級 + 奪冠機率 + **信賴區間** + 驅動因素 |
| `outputs/foregate-matches.json` / `.csv` | 小組賽:1X2 + 大小球 + BTTS + Top 比分 + 驅動因素 |
| `data/elo-calibrated.json` | 48 隊校準 Elo |
| `data/tournament-odds.json` | 蒙地卡羅原始機率 |
| `data/model-backtest.json` | 回測指標(每次 `node backtest.mjs` 重算) |

欄位含隊/場 ID、各機率、信賴區間、驅動因素 —— 供研報 / 資料卡 / 落地頁 / widget / API 直接調用。

---

## 資料來源

- **球隊與 Elo** —— 官方 48 支晉級隊 + 各隊當前國家隊 Elo,取自
  [World Football Elo (eloratings.net)](https://www.eloratings.net)。以 `node data/import-elo.mjs`
  重新產生。(注意:ClubElo 是**俱樂部**足球、不含國家隊。)
- **分組** —— `data/groups.json` 為官方 FIFA 2026 分組(12 組 × 4)。
- **比賽歷史** —— `data/results.json`,衍生自
  [martj42 international results](https://github.com/martj42/international_results)(CC0)。重建:
  ```bash
  mkdir -p data/raw            # 已 gitignore,原始下載不入庫
  # 下載 results.csv 放到 data/raw/
  node data/import-real.mjs data/raw/results.csv 2018-01-01
  ```

### 進階路線
- 引入 xG 作更穩的實力訊號(FBref 經 [soccerdata](https://github.com/probberechts/soccerdata) 取;國家隊 xG 覆蓋有限)。
- 貝氏階層模型,產出帶區間的比分分布。

### 署名
Elo:World Football Elo(eloratings.net)。賽果:martj42(CC0)。各資料各自遵循其原始授權。

---

## 每日更新

國家隊 Elo 會隨賽事結果變動。`update-elo.mjs` 會抓取 eloratings.net 最新快照、重寫 48 隊評級,
並重跑模擬與資料產出:

```bash
node update-elo.mjs            # 刷新 Elo -> 模擬 -> 產出
```

附帶現成的 GitHub Actions 工作流(`.github/workflows/daily-update.yml`),每日自動執行一次並提交
更新後的 `data/` 與 `outputs/`。

---

## 檔案總覽

| 檔案 | 作用 |
|---|---|
| `elo.mjs` | 比賽模型:Elo、賽事加權 K、淨勝球放大、Dixon-Coles、雙卜瓦松、seeded RNG |
| `calibrate.mjs` | 時間衰減 + 重要性加權,建立校準 Elo |
| `backtest.mjs` | 走樣本外回測(命中率/Brier/RPS/log-loss/ECE) |
| `simulate.mjs` | 全賽程蒙地卡羅(奪冠 / 晉級機率) |
| `explain.mjs` | 可解釋驅動因素 |
| `predict.mjs` | 單場預測 CLI |
| `build.mjs` | 產出 JSON + CSV 交付資料 |
| `update-elo.mjs` | 從 eloratings.net 刷新 Elo,再重跑模擬與產出(供每日更新) |
| `data/import-elo.mjs` | 載入官方 48 隊 + 真實 Elo |
| `data/import-real.mjs` | 匯入真實國際賽資料(martj42 CSV → results.json) |

---

## 授權

MIT —— 見 [LICENSE](LICENSE)。內附資料各自遵循其原始授權(World Football Elo;martj42 CC0)。
非投注建議,機率為統計估計。
