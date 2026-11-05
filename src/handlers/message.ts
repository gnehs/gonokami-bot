import { api } from "sdk";
import { handleNumberCommand } from "../lib/number.ts";
import { rememberChat, rememberUser } from "../lib/store.ts";
import { parseCommand, type Message } from "../lib/telegram.ts";
import { handleVoteCommand } from "../lib/votes.ts";

let botUsername: string | null = null;

async function getBotUsername(): Promise<string> {
  botUsername ??= (await api.getMe()).username as string;
  return botUsername;
}

async function sendAppButton(message: Message) {
  const username = await getBotUsername();
  // A main Mini App link works in groups too, unlike web_app buttons; start_param tells it which chat to open.
  const startParam = message.chat.type === "private" ? "" : `=c${-message.chat.id}`;
  const button = { text: "📊 打開投票紀錄", url: `https://t.me/${username}?startapp${startParam}` };
  await api.sendMessage({
    chat_id: message.chat.id,
    text: "👑 投票紀錄、叫號預測、年度回顧都在這裡，怕的是他。",
    reply_markup: { inline_keyboard: [[button]] },
  });
}

export default async function (message: Message) {
  const command = parseCommand(message.text);
  if (!command || !message.from) return;
  if (command.botName && command.botName.toLowerCase() !== (await getBotUsername()).toLowerCase()) return;

  await Promise.all([rememberChat(message.chat), rememberUser(message.from)]);

  switch (command.command) {
    case "start":
      if (message.chat.type !== "private") return;
      await api.sendMessage({
        chat_id: message.chat.id,
        text: "安安，榮勾斯揪來了，怕的是他。有事嗎？\n想訂閱叫號可以打 /number 你的號碼，偶會幫你記著，很ㄅㄧㄤˋ吧 ✨。",
      });
      return sendAppButton(message);
    case "number":
      return handleNumberCommand(message, command.args[0]);
    case "vote":
      return handleVoteCommand(message, "vote", command.args);
    case "voteramen":
      return handleVoteCommand(message, "ramen", command.args);
    case "app":
      return sendAppButton(message);
  }
}
