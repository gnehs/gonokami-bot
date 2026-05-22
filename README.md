<div align="center">
  <img src="assets/avater.png" width="200" style="border-radius: 32px;" />
</div>

# 👑 榮勾斯揪拉麵精靈

哼嗯，這是偶，國王熊熊榮勾斯揪的 Telegram Bot。怕的是他。

這個 Bot 很ㄅㄧㄤ ˋ，可以幫你做很多事，不像那些 LKK 的 Bot，很遜。

## ✨ Kira Kira 的功能

- **/number [號碼]**: 查詢五之神拉麵的目前叫號，你也可以直接訂閱，偶會幫你盯著，叫到再跟你說。很 Hito 吧。
- **/vote [主題]**: 肚子餓了？用這個指令來揪團投票，看大家要ㄘ什麼。
- **/voteramen [主題]**: 限定拉麵點餐專用，直接統計好誰要單點、誰要加蛋、誰要超值。哇賽！

## 🛠️ 安裝與設定

想讓偶為你服務？哼嗯，算你識貨。照著下面做，不要兩光。

1. **把偶的城堡複製回去：**

   ```bash
   git clone https://github.com/gnehs/gonokami-bot.git
   cd gonokami-bot
   ```

2. **安裝需要的東西：** 偶只用 pnpm，其他的偶看不上眼，很 SPP。

   ```bash
   pnpm install
   ```

   需要 Node.js 22.18 以上，因為偶會直接執行 `.ts` 檔。

3. **設定你的秘密鑰匙：** 建一個 `.env` 檔案放你的 Telegram Bot Token。

   ```env
   BOT_TOKEN=你的機器人Token
   ```

---

## 🚀 啟動偶（開發模式）

好了嗎？好了就啟動偶，讓大家看看偶的 je ne sais quoi。

```bash
pnpm start
```

或是，如果你想讓偶一直在背景曬太陽（開發模式）：

```bash
pnpm dev
```

## 🐳 用 Docker 部署偶

覺得上面的方法很遜？哼嗯，偶也懂 Docker，怕的是他。

1.  **把偶打包起來（新版 Node 會直接執行 TypeScript）:**

    ```bash
    docker build -t gonokami-bot .
    ```

2.  **讓偶開始曬太陽：**
    記得把你的秘密鑰匙 (`BOT_TOKEN`) 傳給偶，不然偶會森七七。

    ```bash
    docker run -d --name gonokami-bot -e BOT_TOKEN="你的機器人Token" --restart always gonokami-bot
    ```

> ⚠️ 若你使用 _node:22-alpine_ / _node:24-alpine_ 等新版映像，或在啟動時看到 `Network request for 'getMe' failed!`、`ETIMEDOUT` 等訊息，很可能是壞掉的 IPv6 造成連線失敗。可以在 `docker run` 時加上一行，直接關閉 container 內的 IPv6：

```bash
docker run -d --name gonokami-bot \
  -e BOT_TOKEN="你的機器人Token" \
  --sysctl net.ipv6.conf.all.disable_ipv6=1 \
  --restart always gonokami-bot
```

---

_Zzz ～怕的是他～ Zzz ～_

## 🏭 Production 啟動

```bash
NODE_ENV=production pnpm start
```
