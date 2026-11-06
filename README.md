<div align="center">
  <img src="assets/avater.png" width="200" style="border-radius: 32px;" />
</div>

# 👑 榮勾絲揪拉麵精靈

哼嗯，這是偶，國王熊熊榮勾絲揪的 Telegram Bot。怕的是他。

偶現在住在 [Telegram Serverless](https://core.telegram.org/bots/serverless)，不用養主機，很ㄅㄧㄤˋ吧。

## ✨ 功能

- **/number [號碼]**：查五之神目前叫號。帶號碼就訂閱，叫到會在同一個聊天室喊你，順便告訴你預估幾點叫到。預估剩不到 10 分鐘時，偶會先提醒你一次，叫你準備往店門口移動。
- **/vote [主題] [不吃選項]**：揪團投票，看大家要不要ㄘ。
- **/voteramen [主題] [不吃選項]**：限定拉麵點餐，統計單點、加蛋、超值各幾份。
- **/app**：打開 Mini App，看投票紀錄、叫號預測和模型準確度。
- **年度回顧**：每年十二月到一月，Mini App 會出現群組的年度回顧，看誰最常揪、大家最愛點什麼。

Mini App 只會顯示你目前還在的群組。每次讀取群組資料前，偶都會用 `getChatMember` 確認身分（結果快取十分鐘）。

## 🧱 架構

| 位置 | 內容 |
| --- | --- |
| `src/` | Bot 程式碼（TypeScript）。`pnpm build:cloud` 會編譯到 `tgcloud/`，也就是平台實際執行的 JS 模組。 |
| `src/handlers/` | Telegram update handler，檔名就是 update 類型，例如 `message`、`poll_answer`。 |
| `src/endpoints/` | Mini App 呼叫的 API。`tick` 和 `importHistory` 只接受 `tgcloud run`，Mini App 呼叫會被拒絕。 |
| `src/lib/` | 共用邏輯。`predict`、`poll`、`retro`、`queue`、`subscription`、`time`、`voice` 不依賴 SDK，可直接用 `node --test` 測。`voice` 是偶所有的台詞，每句由幾段子句隨機組合，想加說法就往對應的陣列加。 |
| `web/` | Mini App 前端，build 到 `dist/`，由 tgcloud 一起部署。 |
| `worker/` | Cloudflare Worker，週五到週日 10:00–21:59 每分鐘觸發一次 `endpoints/tick`。五之神只在這幾天用叫號看板。 |
| `scripts/` | 歷史資料匯入，以及打包 Worker 用的模組原始碼。 |

Telegram Serverless 沒有排程功能，所以由 Worker 定時呼叫 tgcloud 的 `/run` API。`/run` 只執行請求裡附上的原始碼、不讀已部署的版本，所以 Worker 部署時會把 `tgcloud/` 的編譯結果一起打包進去。每次改完 bot 都要用 `pnpm run deploy` 一起部署，Worker 才不會跑舊版程式。

### 叫號預測

每分鐘的 tick 會讀叫號看板，並記下看板自己回報的換號時間（`UpdDate`）。所以就算一分鐘才看一次，時間點仍然準確。

五之神分午場和晚場，每場開始前會把看板歸零成 1000，再從 1001 重新叫。所以號碼一往回掉，偶就當成新的一場，每場各自是一條叫號曲線。每天收攤後，當天每一場的曲線會併入模型，並跟前幾天的歷史比對、算出準確度。Mini App 顯示的就是最近 60 場的結果。

換場時，上一場還沒叫到的訂閱會被取消，不然晚場從頭叫的時候會誤報。在上一場叫完之後才訂的不算，會留給下一場。

上一場叫完、還沒換場的時候，看板會一直停在最後一號。看板超過 30 分鐘沒動，`/number` 就會接受比看板小的號碼，當成下一場的號碼牌。這種訂閱要等換場後的那一場叫到才通知，換場之前也不算預估時間。

看板停超過 45 分鐘（開店前、午休、前一天留下的號碼）不算在叫號，所以每一場會再切成幾段「連續叫號」，預測只在同一段裡面算。

預測時，偶會去找歷史上每一段在同一個時鐘時間的狀況：當時看板停在幾號，再往後叫同樣多號花了多久。這些時間加權取中位數，同星期、同類型營業日（五六日限定）、越近的日子權重越高。用時鐘時間而不是號碼對齊，是因為每一場都從 1001 重叫，晚場的 1020 號跟午場的 1020 號節奏完全不同。看板還停在 1000、還沒開叫的時候，就改看歷史上這一場第幾號通常幾點叫到。

準確度也照使用者實際查詢的方式算：在每一段叫號期間每 3 分鐘問一次「再 5、10、20、40 號是幾點」，跟實際叫到的時間比。

## 🛠️ 開發

需要 Node.js 22.18 以上（直接執行 `.ts`）和 pnpm。

```bash
pnpm install
pnpm test        # 純邏輯測試
pnpm typecheck
pnpm dev:web     # 在一般瀏覽器開 Mini App，會用假資料
```

## 🚀 第一次部署

0. 先停掉舊的 Docker bot 和 number-monitor。`tgcloud push` 會幫 bot 設定 webhook，舊版的長輪詢會跟它衝突。
1. 在 @BotFather 開啟這個 bot 的 Serverless，到 Settings → Serverless → CLI Access 拿 access token（格式 `app<id>:<secret>`，跟 bot token 不同）。
2. 在 repo 根目錄登入，token 會存在 git-ignored 的 `.tgcloud/`：

   ```bash
   pnpm exec tgcloud login
   ```

3. 編譯並推上去，再套用資料表：

   ```bash
   pnpm build && pnpm exec tgcloud push
   ```

   ```bash
   pnpm exec tgcloud migrate
   ```

4. 匯入舊 Docker 版的歷史資料。第一個參數是 number-monitor 的 CSV 資料夾，第二個是舊 bot 的 `data/` 資料夾。先用 `--dry-run` 看筆數：

   ```bash
   pnpm import-history <monitor-csv-dir> <bot-data-dir> --dry-run
   ```

   匯入時會清掉不可靠的資料：只保留至少 15 次換號、時間跨度兩小時以上的營業日，並排除私訊裡的測試投票和沒人投的投票。重複執行不會產生重複資料。

5. 設定 Worker 的 token，然後部署 Worker：

   ```bash
   pnpm exec wrangler secret put TGCLOUD_TOKEN -c worker/wrangler.jsonc
   ```

   ```bash
   pnpm deploy:worker
   ```

6. 在 @BotFather 把 `tgcloud push` 印出的網址設成這個 bot 的 Main Mini App，`/app` 的按鈕才打得開。

之後每次更新只要：

```bash
pnpm run deploy
```

改到 `src/schema.ts` 時，`push` 只會列出待套用的變更，記得再跑一次 `pnpm exec tgcloud migrate`。

---

_Zzz ～怕的是他～ Zzz ～_
