import "dotenv/config";
import { Bot, Context } from "grammy";
import {
  safeReply,
  safeSendMessage,
  hash,
  pickRandom,
} from "./utils/telegram.js";
import JsonFileDb from "./utils/db.js";
import fs from "fs";
import { generateText } from "ai";
import { getCurrentNumber } from "./utils/number.js";
import { z } from "zod";
import { openwebui } from "./providers/openwebui.js";

// ----------------- Environment Validation -----------------
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN environment variable is missing! Bot will exit.");
  process.exit(1);
}

let botUsername: null | string;
async function getBotUsername(ctx: Context) {
  if (!botUsername) {
    const me = await ctx.api.getMe();
    botUsername = me.username;
  }
  return botUsername;
}

const bot = new Bot(process.env.BOT_TOKEN!);

// Global error handler – prevent crashes
bot.catch((err) => {
  console.error("[Bot Error]", err);
});

// salt moved to utils/telegram.js

const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const voteData = new JsonFileDb("votes.json");
const subData = new JsonFileDb("subscriptions.json");
const usageLog = new JsonFileDb("usage.json");
const historyData = new JsonFileDb("chatHistories.json");
const usageQuotaDb = new JsonFileDb("usageQuota.json");

interface UsageStats {
  users: Record<number, { date: string; count: number }>;
  groups: Record<number, { date: string; count: number }>;
  global?: { date: string; count: number };
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function checkAndIncrementQuota(ctx: Context): boolean {
  const today = getTodayDate();
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  let stats: UsageStats = (usageQuotaDb.get("stats") as UsageStats) ?? {
    users: {},
    groups: {},
  };

  // Ensure global counter exists
  if (!stats.global) {
    stats.global = { date: today, count: 0 };
  }

  // Reset global counter if date changed
  if (stats.global.date !== today) {
    stats.global = { date: today, count: 0 };
  }

  // Check global quota (1000 messages per day)
  if (stats.global.count >= 1000) {
    usageQuotaDb.set("stats", stats); // persist any cleanup
    return false;
  }

  // ---- Cleanup older than 7 days ----
  for (const [uid, entry] of Object.entries(stats.users)) {
    if (now - new Date(entry.date).getTime() > sevenDaysMs) {
      delete stats.users[Number(uid)];
    }
  }
  for (const [gid, entry] of Object.entries(stats.groups)) {
    if (now - new Date(entry.date).getTime() > sevenDaysMs) {
      delete stats.groups[Number(gid)];
    }
  }
  // -----------------------------------

  if (ctx.chat.type === "private") {
    const id = ctx.from!.id;
    let entry = stats.users[id] ?? { date: today, count: 0 };
    if (entry.date !== today) entry = { date: today, count: 0 };

    if (entry.count >= 30) {
      usageQuotaDb.set("stats", stats); // persist cleanup even if over quota
      return false;
    }

    entry.count += 1;
    stats.users[id] = entry;
  } else {
    const id = ctx.chat.id;
    let entry = stats.groups[id] ?? { date: today, count: 0 };
    if (entry.date !== today) entry = { date: today, count: 0 };

    if (entry.count >= 50) {
      usageQuotaDb.set("stats", stats);
      return false;
    }

    entry.count += 1;
    stats.groups[id] = entry;
  }

  // Increment global counter after individual checks pass
  stats.global.count += 1;

  usageQuotaDb.set("stats", stats);
  return true;
}

// -------- Quota limit messages & helper --------
const LIMIT_MSGS = [
  "😴 斯揪累累要睡覺了，明天再聊喔～",
  "🛌 斯揪要去蓋被被曬太陽了，明天再跟你 LDS～",
  "⏰ 斯揪先休息，kira kira 明天見！",
  "🍯 蜂蜜吃完了，斯揪沒電啦，明天再說 886～",
  "😴 斯揪累累要睡覺了，明天再嗨吧～",
  "🛌 斯揪去王國午休，明天再來 KUSO～",
  "🍯 蜂蜜耗盡，斯揪要充電，這裡今天先到此為止 886～",
];

// pickRandom moved to utils/telegram.js
// ---------------------------------------------

const OPENWEBUI_MODEL = openwebui(
  process.env.OPENWEBUI_MODEL || "gpt-4.1-mini"
);

// ----------------- Chat Memory -----------------
// Keep recent 10 user/assistant message pairs per chat. Older history will be summarized automatically.
const chatHistories = new Map<number, { messages: any[] }>();

// Load existing histories from disk
const storedHistories = historyData.get("histories") as
  | Record<string, { messages: any[] }>
  | undefined;
if (storedHistories) {
  for (const [id, data] of Object.entries(storedHistories)) {
    chatHistories.set(Number(id), data);
  }
}

function persistChatHistories() {
  const obj = Object.fromEntries(
    Array.from(chatHistories.entries()).map(([id, data]) => [
      id.toString(),
      data,
    ])
  );
  historyData.set("histories", obj as any);
}

// ----------------- Helper Utilities (restored) -----------------

function logActivity(activity: string, data: Record<string, unknown>): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    activity,
    ...data,
  };
  const logs: unknown[] = (usageLog.get("logs") as unknown[]) ?? [];
  logs.push(logEntry);
  usageLog.set("logs", logs as unknown as Record<string, unknown>[]);
  console.log(logEntry);
}

// getCurrentNumber moved to utils/number.js

// ----------------- Type Definitions -----------------

interface Subscription {
  chat_id: number;
  user_id: number;
  first_name: string;
  target_number: number;
  created_at: number;
  message_id: number;
}

function shouldRespond(ctx: Context, botName: string): boolean {
  if (ctx.chat.type === "private") return true;
  const text = ctx.message?.text || "";
  const mentionRegex = new RegExp(`@${botName}\\b`, "i");
  const repliedToBot =
    ctx.message?.reply_to_message?.from?.username === botName ||
    ctx.message?.reply_to_message?.from?.id === (ctx as any).me?.id;
  return repliedToBot || mentionRegex.test(text);
}

// safeReply & safeSendMessage moved to utils/telegram.js

bot.command("start", async (ctx) => {
  const payloadStr = ctx.message?.text?.split(" ").slice(1).join(" ") || "";
  logActivity("start", {
    from: ctx.from,
    chat: ctx.chat,
    payload: payloadStr,
  });
  if (ctx.chat.type !== "private") {
    return;
  }

  if (!payloadStr) {
    return ctx.reply(
      "安安，榮勾斯揪來了，怕的是他。有事嗎？\n想訂閱叫號可以打 `/number <你的號碼>`，偶會幫你訂閱，很ㄅㄧㄤˋ吧 ✨。"
    );
  }

  try {
    const decodedPayload = Buffer.from(payloadStr, "base64").toString("utf8");
    const params = Object.fromEntries(
      new URLSearchParams(decodedPayload).entries()
    );
    const {
      action,
      group_chat_id,
      target_number,
      user_message_id,
      group_message_id,
    } = params;

    if (action === "subscribe") {
      const userId = ctx.from.id;
      const chatId = Number(group_chat_id);
      const targetNumber = Number(target_number);

      const currentNumber = await getCurrentNumber();
      if (currentNumber === null) {
        return ctx.reply("😵‍💫 挖哩咧，偶拿不到號碼，很遜欸，等等再試。");
      }

      if (targetNumber <= currentNumber) {
        return ctx.reply("🤡 都跟你說過號了，你很奇欸。");
      }

      const subscriptions: Subscription[] =
        (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
      const existingSub = subscriptions.find(
        (s) => s.chat_id === chatId && s.user_id === userId
      );

      if (existingSub) {
        return ctx.reply(
          `⚠️ 你已經訂閱 ${existingSub.target_number} 號了，不要重複訂，很遜。`
        );
      }

      subscriptions.push({
        chat_id: chatId,
        user_id: userId,
        first_name: ctx.from.first_name,
        target_number: targetNumber,
        created_at: Date.now(),
        message_id: Number(user_message_id),
      });
      subData.set("subscriptions", subscriptions);

      await ctx.reply(
        `👑 哼嗯，*${targetNumber}* 號是吧？偶記下了，怕的是他。`,
        { parse_mode: "Markdown" }
      );
      await bot.api.sendMessage(
        chatId,
        `✅ ${ctx.from.first_name} 已訂閱 ${targetNumber} 號。`,
        { reply_to_message_id: Number(user_message_id) }
      );
    } else if (action === "unsubscribe") {
      const userId = ctx.from.id;
      const chatId = Number(group_chat_id);

      const subscriptions: Subscription[] =
        (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
      const subIndex = subscriptions.findIndex(
        (s) => s.chat_id === chatId && s.user_id === userId
      );

      if (subIndex === -1) {
        return ctx.reply("🗣️ 你又沒訂閱，是在取消什麼，告老師喔！");
      }

      const sub = subscriptions[subIndex];
      subscriptions.splice(subIndex, 1);
      subData.set("subscriptions", subscriptions);

      await ctx.reply(
        `🚫 哼嗯，偶幫你取消 *${sub.target_number}* 號的訂閱了。醬子。`,
        { parse_mode: "Markdown" }
      );

      if (group_message_id) {
        const unsubscribedText = `✅ @${ctx.from.first_name} 已取消 *${sub.target_number}* 號的訂閱了。`;
        await bot.api.editMessageText(
          chatId,
          Number(group_message_id),
          unsubscribedText,
          { parse_mode: "Markdown" }
        );
      }
    }
  } catch (e) {
    console.error("Failed to handle start command with payload", e);
    await ctx.reply("挖哩咧，偶搞不懂你的指令，很遜欸。");
  }
});

bot.command("number", async (ctx) => {
  logActivity("number", {
    from: ctx.from,
    chat: ctx.chat,
    text: ctx.message.text,
  });
  ctx.api.sendChatAction(ctx.chat.id, "typing");
  let args = ctx.message.text.split(" ").slice(1);

  const currentNumber = await getCurrentNumber();

  if (currentNumber === null) {
    return ctx.reply("挖哩咧 😵‍💫，偶拿不到號碼，很遜欸。", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const targetNumber = args[0];
  let responseText = `👑 哼嗯，現在號碼是 *${currentNumber}*，醬子。`;

  // Private Chat Logic
  if (ctx.chat.type === "private") {
    const subscriptions: Subscription[] =
      (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
    const existingSub = subscriptions.find(
      (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
    );

    if (!targetNumber && existingSub) {
      subscriptions.splice(subscriptions.indexOf(existingSub), 1);
      subData.set("subscriptions", subscriptions);
      return ctx.reply(
        `🚫 哼嗯，偶幫你取消 *${existingSub.target_number}* 號的訂閱了。醬子。`,
        { parse_mode: "Markdown" }
      );
    }

    if (existingSub) {
      responseText += `\n✅ 你已經訂閱 *${existingSub.target_number}* 號了。想取消？打 \`/number\` 就好，醬子。`;
      return safeReply(ctx, responseText, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
      });
    }

    const numTarget = Number(targetNumber);
    const isValidNumber =
      targetNumber !== undefined &&
      !Number.isNaN(numTarget) &&
      Number.isInteger(numTarget) &&
      numTarget >= 1001 &&
      numTarget <= 1200 &&
      String(numTarget).length <= 4;

    if (isValidNumber) {
      if (numTarget > currentNumber) {
        subscriptions.push({
          chat_id: ctx.chat.id,
          user_id: ctx.from.id,
          first_name: ctx.from.first_name,
          target_number: numTarget,
          created_at: Date.now(),
          message_id: ctx.message.message_id,
        });
        subData.set("subscriptions", subscriptions);
        responseText += `\n👑 哼嗯，*${numTarget}* 號是吧？偶記下了，怕的是他。想取消再打一次 \`/number\` 就好。`;
      } else {
        responseText += `\n🤡 這位同學，*${numTarget}* 已經過了，你很奇欸。`;
      }
    } else if (targetNumber) {
      responseText += `\n🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。`;
    } else {
      responseText += `\n\n想訂閱叫號？打 \`/number <你的號碼>\`，偶幫你記著，很ㄅㄧㄤˋ吧 ✨。`;
    }

    return safeReply(ctx, responseText, {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.message.message_id,
    });
  }
  // Group Chat Logic
  else {
    const subscriptions: Subscription[] =
      (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
    const existingSub = subscriptions.find(
      (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
    );
    const username = await getBotUsername(ctx);

    if (existingSub) {
      responseText += `\n✅ 你訂閱的 *${existingSub.target_number}* 號偶記下了，怕的是他。叫到再跟你說，安安。`;
      const sentMessage = await safeReply(ctx, responseText, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
      });

      const payload = `action=unsubscribe&group_chat_id=${ctx.chat.id}&group_message_id=${sentMessage.message_id}`;
      const base64Payload = Buffer.from(payload).toString("base64");
      const url = `https://t.me/${username}?start=${base64Payload}`;

      await ctx.api.editMessageReplyMarkup(
        ctx.chat.id,
        sentMessage.message_id,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🚫 私訊偶取消",
                  url,
                },
              ],
            ],
          },
        }
      );
      return;
    }

    const numTargetGrp = Number(targetNumber);
    const isValidNumber =
      targetNumber !== undefined &&
      !Number.isNaN(numTargetGrp) &&
      Number.isInteger(numTargetGrp) &&
      numTargetGrp >= 1001 &&
      numTargetGrp <= 1200 &&
      String(numTargetGrp).length <= 4;

    if (isValidNumber) {
      if (numTargetGrp > currentNumber) {
        responseText += `\n🤔 你這 *${numTargetGrp}* 號還沒到，想訂閱就私訊偶，怕的是他。`;
        const payload = `action=subscribe&target_number=${numTargetGrp}&group_chat_id=${ctx.chat.id}&user_message_id=${ctx.message.message_id}`;
        const base64Payload = Buffer.from(payload).toString("base64");
        const url = `https://t.me/${username}?start=${base64Payload}`;
        return safeReply(ctx, responseText, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔔 私訊偶訂閱",
                  url,
                },
              ],
            ],
          },
        });
      } else {
        responseText += `\n🤡 這位同學，*${numTargetGrp}* 已經過了，你很奇欸。`;
      }
    } else if (targetNumber) {
      responseText += `\n🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。`;
    } else {
      responseText += `\n\n想訂閱叫號？打 \`/number <你的號碼>\`，偶幫你記著，很ㄅㄧㄤˋ吧 ✨。`;
    }

    safeReply(ctx, responseText, {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.message.message_id,
    });
  }
});

async function checkSubscriptions() {
  const subscriptions: Subscription[] =
    (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
  if (subscriptions.length === 0) {
    return;
  }

  const currentNumber = await getCurrentNumber();
  if (currentNumber === null) {
    console.error("checkSubscriptions: Failed to get current number.");
    return;
  }

  const remainingSubscriptions = [];
  const fiveHours = 5 * 60 * 60 * 1000;

  for (const sub of subscriptions) {
    if (currentNumber >= sub.target_number) {
      logActivity("subscription_triggered", { sub });
      safeSendMessage(
        bot,
        sub.chat_id,
        `喂～ 👑 @${sub.first_name} ，你訂的 ${sub.target_number} 號到了，怕的是他。還不快去！`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else if (Date.now() - sub.created_at > fiveHours) {
      logActivity("subscription_expired", { sub });
      safeSendMessage(
        bot,
        sub.chat_id,
        `欸 👋 @${sub.first_name} ，你的 ${sub.target_number} 號等太久了，超過五小時偶就幫你取消了，很遜欸。881。`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else {
      remainingSubscriptions.push(sub);
    }
  }

  subData.set("subscriptions", remainingSubscriptions);
}

setInterval(checkSubscriptions, 60 * 1000);

// vote
bot.command("vote", async (ctx) => {
  logActivity("vote", {
    from: ctx.from,
    chat: ctx.chat,
    text: ctx.message.text,
  });
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "今天ㄘ什麼 🤔";
  let byeOptions = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
  let byeOption = args[1]
    ? args[1]
    : byeOptions[Math.floor(Math.random() * byeOptions.length)];
  let voteOptions = ["+1", "+2", "+4", byeOption];
  const pollOptions = voteOptions.map((text) => ({ text }));
  const data = await ctx.api.sendPoll(ctx.chat.id, voteTitle, pollOptions, {
    allows_multiple_answers: true,
    is_anonymous: false,
    reply_to_message_id: ctx.message.message_id,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚫 結束！很遜欸",
            callback_data: `stopvote_${hash(ctx.message.from.id)}`,
          },
        ],
      ],
    },
  });

  updatePollData(data.poll.id, {
    ...data.poll,
    chat_id: ctx.chat.id,
    chat_name: ctx.chat.title || ctx.chat.first_name,
    chat_type: ctx.chat.type,
    votes: {},
  });
});

bot.callbackQuery(/stopvote_(.+)/, async (ctx) => {
  logActivity("stopvote", {
    from: ctx.from,
    chat: ctx.chat,
    match: ctx.match[0],
  });
  let hashStr = ctx.match[1];
  if (hashStr == hash(ctx.update.callback_query.from.id)) {
    let poll = await ctx.api.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    const count = poll.options.slice(0, -1).reduce((acc, cur) => {
      const multiplier = Number(cur.text.replace("+", "").trim());
      return acc + cur.voter_count * multiplier;
    }, 0);
    ctx.reply(`*${poll.question}* 投票結束，醬子共 ${count} 個人要ㄘ。🥳`, {
      parse_mode: "MarkdownV2",
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });

    updatePollData(poll.id, poll);
  } else {
    ctx.answerCallbackQuery("🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。");
  }
});

// ramen vote
bot.command("voteramen", async (ctx) => {
  logActivity("voteramen", {
    from: ctx.from,
    chat: ctx.chat,
    text: ctx.message.text,
  });
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "限定拉麵，點餐！🍜";
  let byeOptions = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
  let byeOption =
    args[1] ?? byeOptions[Math.floor(Math.random() * byeOptions.length)];
  let voteOptions = [
    "+1 | 🍜 單點",
    "+2 | 🍜 單點",
    "+1 | 🥚 加蛋",
    "+2 | 🥚 加蛋",
    "+1 | ✨ 超值",
    "+2 | ✨ 超值",
    byeOption,
  ];
  const pollOptionsRamen = voteOptions.map((text) => ({ text }));
  const data = await ctx.api.sendPoll(
    ctx.chat.id,
    voteTitle,
    pollOptionsRamen,
    {
      allows_multiple_answers: true,
      is_anonymous: false,
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👥 0 人 | 🚫 結束投票",
              callback_data: `stopramenvote_${hash(ctx.message.from.id)}`,
            },
          ],
        ],
      },
    }
  );
  updatePollData(data.poll.id, {
    ...data.poll,
    chat_id: ctx.chat.id,
    message_id: data.message_id,
    user_id: ctx.from.id,
    chat_name: ctx.chat.title || ctx.chat.first_name,
    chat_type: ctx.chat.type,
    votes: {},
  });
});

// watch user vote
bot.on("poll_answer", async (ctx) => {
  logActivity("poll_answer", {
    from: ctx.from,
    poll_answer: ctx.update.poll_answer,
  });
  const pollAnswer = ctx.update.poll_answer;
  // update user
  let users = voteData.get("users") || {};
  users[pollAnswer.user.id] = {
    first_name: pollAnswer.user?.first_name,
    username: pollAnswer.user?.username,
  };
  voteData.set("users", users);
  // update poll
  let polls = voteData.get("polls") || {};
  let poll = polls[pollAnswer.poll_id];
  if (!poll) return;
  const optionIds: number[] = pollAnswer.option_ids;
  poll.votes[pollAnswer.user.id] = optionIds;
  updatePollData(pollAnswer.poll_id, poll);
  console.log(
    `[vote] ${pollAnswer.user?.first_name} voted ${
      optionIds.length ? optionIds : "retract"
    } in poll ${poll.question}(${pollAnswer.poll_id}) at ${poll.chat_name}(${
      poll.chat_id
    })`
  );

  // Update voter count in reply markup for ramen votes
  const isRamenVote = poll.options.some((opt) => opt.text.includes("|"));
  if (!isRamenVote) return;

  const totalCount = Object.values(poll.votes)
    .flatMap((opts) => opts as number[])
    .filter((optionId: number) => optionId !== poll.options.length - 1)
    .map((optionId: number) => (optionId % 2) + 1)
    .reduce((sum, quantity) => sum + quantity, 0);

  try {
    await ctx.api.editMessageReplyMarkup(poll.chat_id, poll.message_id, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `👥 ${totalCount} 人 | 🚫 結束投票`,
              callback_data: `stopramenvote_${hash(poll.user_id)}`,
            },
          ],
        ],
      },
    });
  } catch (e) {
    if (!e.message.includes("message is not modified")) {
      console.error("Failed to edit reply markup for voter count:", e);
    }
  }
});

bot.callbackQuery(/stopramenvote_(.+)/, async (ctx) => {
  logActivity("stopramenvote", {
    from: ctx.from,
    chat: ctx.chat,
    match: ctx.match[0],
  });
  let hashStr = ctx.match[1];
  if (hashStr == hash(ctx.update.callback_query.from.id)) {
    let poll = await ctx.api.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    let { count, result } = parsePollResult(poll);
    let responseText = `*${poll.question}* 點餐結果，挖賽！🤩\n`;
    for (let key in result) {
      responseText += `${key}：${result[key]} 人\n`;
    }
    responseText += `———\n`;
    responseText += `共 ${count} 個人，醬子。🥳`;
    ctx.reply(responseText, {
      parse_mode: "MarkdownV2",
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });

    updatePollData(poll.id, poll);
  } else {
    ctx.answerCallbackQuery("🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。");
  }
});

function parsePollResult(poll) {
  const optionsArr: string[] = Array.from(
    new Set(poll.options.slice(0, -1).map((x) => x.text.split("|")[1].trim()))
  );
  const result: Record<string, number> = {};
  optionsArr.forEach((opt) => {
    result[opt] = 0;
  });
  poll.options
    .slice(0, -1)
    .forEach((x: { text: string; voter_count: number }) => {
      let option = x.text.split("|")[1].trim();
      const multiplier = Number(x.text.replace("+", "").split("|")[0].trim());
      result[option] += x.voter_count * multiplier;
    });
  const count = Object.values(result).reduce((acc, cur) => acc + cur, 0);
  return {
    count,
    result,
  };
}
function updatePollData(id, data) {
  let polls = voteData.get("polls") || {};
  let poll = polls[id] || {};
  poll = {
    ...poll,
    ...data,
    update_time: Date.now(),
  };
  delete poll.id;
  delete poll.is_anonymous;
  delete poll.type;
  delete poll.allows_multiple_answers;

  polls[id] = poll;
  voteData.set("polls", polls);
}

// ----------------- ChatGPT Handler -----------------

async function summarizeMessages(msgs: { role: string; content: string }[]) {
  const summaryPrompt: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content:
        "使用條列式摘要以下對話，100 字左右，摘要將用於後續對話上下文，不要遺漏重要資訊。",
    },
    {
      role: "user",
      content: JSON.stringify(msgs.map((m) => ({ r: m.role, c: m.content }))),
    },
  ];

  try {
    const { text } = await generateText({
      model: OPENWEBUI_MODEL,
      messages: summaryPrompt,
      temperature: 0.3,
    });
    return text.trim();
  } catch (err: any) {
    return "(摘要失敗)";
  }
}

// Unified AI tools generator bound to a specific ctx
function getAISTools(ctx: Context) {
  return {
    get_current_number: {
      description: "取得目前號碼牌數字",
      parameters: z.object({}),
      execute: async () => {
        const num = await getCurrentNumber();
        return { current_number: num };
      },
    },
    create_vote: {
      description: "在聊天中建立投票，限文字選項",
      parameters: z.object({
        title: z.string(),
        options: z.array(z.string()).min(2).max(10),
      }),
      execute: async ({
        title,
        options,
      }: {
        title: string;
        options: string[];
      }) => {
        const pollOptions = options.map((t) => ({ text: t }));
        await ctx.api.sendPoll(ctx.chat.id, title, pollOptions, {
          is_anonymous: false,
          allows_multiple_answers: true,
          reply_to_message_id: ctx.message!.message_id,
        });
        return { done: true };
      },
    },
    create_ramen_vote: {
      description: "建立拉麵點餐投票，提供固定選項且可自訂標題與離開選項文字",
      parameters: z.object({
        title: z.string().optional(),
        bye_option: z.string().optional(),
      }),
      execute: async ({
        title,
        bye_option,
      }: {
        title?: string;
        bye_option?: string;
      }) => {
        const voteTitle =
          title && title.trim().length ? title : "限定拉麵，點餐！🍜";
        const byeOptionsArr = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
        const byeOpt =
          bye_option && bye_option.trim().length
            ? bye_option
            : byeOptionsArr[Math.floor(Math.random() * byeOptionsArr.length)];

        const voteOptions = [
          "+1 | 🍜 單點",
          "+2 | 🍜 單點",
          "+1 | 🥚 加蛋",
          "+2 | 🥚 加蛋",
          "+1 | ✨ 超值",
          "+2 | ✨ 超值",
          byeOpt,
        ];
        const pollOptionsRamen = voteOptions.map((t) => ({ text: t }));
        const data = await ctx.api.sendPoll(
          ctx.chat.id,
          voteTitle,
          pollOptionsRamen,
          {
            allows_multiple_answers: true,
            is_anonymous: false,
            reply_to_message_id: ctx.message!.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "👥 0 人 | 🚫 結束投票",
                    callback_data: `stopramenvote_${hash(
                      ctx.message!.from.id
                    )}`,
                  },
                ],
              ],
            },
          }
        );

        updatePollData(data.poll.id, {
          ...data.poll,
          chat_id: ctx.chat.id,
          message_id: data.message_id,
          user_id: ctx.from.id,
          chat_name: ctx.chat.title || ctx.chat.first_name,
          chat_type: ctx.chat.type,
          votes: {},
        });

        return { done: true };
      },
    },
    subscribe_number: {
      description: "訂閱叫號牌，僅限私訊使用。",
      parameters: z.object({
        target_number: z.number().int().describe("要訂閱的號碼 (1001-1200)"),
      }),
      execute: async ({ target_number }: { target_number: number }) => {
        if (ctx.chat.type !== "private") {
          await safeReply(
            ctx,
            "🗣️ 告老師喔！在群組不能直接訂閱，請私訊偶醬子才行。"
          );
          return { done: false } as const;
        }

        const currentNumber = await getCurrentNumber();
        if (currentNumber === null) {
          await safeReply(ctx, "挖哩咧 😵‍💫，偶拿不到號碼，很遜欸。");
          return { done: false } as const;
        }

        const numTarget = target_number;
        if (
          Number.isNaN(numTarget) ||
          !Number.isInteger(numTarget) ||
          numTarget < 1001 ||
          numTarget > 1200
        ) {
          await safeReply(
            ctx,
            "🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。"
          );
          return { done: false } as const;
        }

        if (numTarget <= currentNumber) {
          await safeReply(
            ctx,
            `🤡 這位同學，*${numTarget}* 已經過了，你很奇欸。`,
            { parse_mode: "Markdown" }
          );
          return { done: false } as const;
        }

        const subscriptions: Subscription[] =
          (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
        const existingSub = subscriptions.find(
          (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
        );
        if (existingSub) {
          await safeReply(
            ctx,
            `⚠️ 你已經訂閱 *${existingSub.target_number}* 號了，不要重複訂，很遜。`,
            { parse_mode: "Markdown" }
          );
          return { done: false } as const;
        }

        subscriptions.push({
          chat_id: ctx.chat.id,
          user_id: ctx.from.id,
          first_name: ctx.from.first_name,
          target_number: numTarget,
          created_at: Date.now(),
          message_id: ctx.message!.message_id,
        });
        subData.set("subscriptions", subscriptions);

        await safeReply(
          ctx,
          `👑 哼嗯，*${numTarget}* 號是吧？偶記下了，怕的是他。想取消再跟偶說醬子。`,
          { parse_mode: "Markdown" }
        );
        return { done: true } as const;
      },
    },
    unsubscribe_number: {
      description: "取消目前使用者訂閱的號碼牌，僅限私訊使用。",
      parameters: z.object({}),
      execute: async () => {
        if (ctx.chat.type !== "private") {
          await safeReply(
            ctx,
            "🗣️ 告老師喔！在群組不能直接取消訂閱，請私訊偶醬子才行。"
          );
          return { done: false } as const;
        }

        const subscriptions: Subscription[] =
          (subData.get("subscriptions") as Subscription[] | undefined) ?? [];
        const subIndex = subscriptions.findIndex(
          (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
        );

        if (subIndex === -1) {
          await safeReply(ctx, "🗣️ 你又沒訂閱，是在取消什麼，告老師喔！");
          return { done: false } as const;
        }

        const sub = subscriptions[subIndex];
        subscriptions.splice(subIndex, 1);
        subData.set("subscriptions", subscriptions);

        await safeReply(
          ctx,
          `🚫 哼嗯，偶幫你取消 *${sub.target_number}* 號的訂閱了。醬子。`,
          { parse_mode: "Markdown" }
        );
        return { done: true } as const;
      },
    },
    get_reply_message: {
      description: "取得目前訊息所回覆之訊息的內容與相關資訊",
      parameters: z.object({}),
      execute: async () => {
        const replyMsg = (ctx.message as any).reply_to_message;
        if (!replyMsg) {
          return { exists: false } as const;
        }

        let content: string | undefined;
        if (replyMsg.text) content = replyMsg.text;
        else if (replyMsg.sticker)
          content = `[貼圖 ${replyMsg.sticker.emoji || ""}]`;
        else if (replyMsg.caption) content = replyMsg.caption;

        return {
          exists: true,
          from: replyMsg.from?.first_name ?? "",
          content_type: replyMsg.text
            ? "text"
            : replyMsg.sticker
            ? "sticker"
            : replyMsg.caption
            ? "caption"
            : "other",
          content: content ?? "",
        } as const;
      },
    },
  } as const;
}

// Core handler shared by both text and sticker messages
async function processLLMMessage(ctx: Context, userContent: string) {
  const botName = await getBotUsername(ctx);
  if (!shouldRespond(ctx, botName)) return;

  // ----- Daily quota enforcement -----
  if (!checkAndIncrementQuota(ctx)) {
    const limitText = pickRandom(LIMIT_MSGS);
    await safeReply(ctx, limitText, {
      reply_to_message_id: ctx.message!.message_id,
    });
    return;
  }
  // -----------------------------------

  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  const chatId = ctx.chat.id;
  let history = chatHistories.get(chatId);
  if (!history) {
    history = { messages: [] };
    chatHistories.set(chatId, history);
  }

  let finalUserContent = userContent;
  const replyMsg: any = (ctx.message as any).reply_to_message;
  if (replyMsg) {
    let repliedContent: string | undefined;
    if (replyMsg.text) repliedContent = replyMsg.text;
    else if (replyMsg.caption) repliedContent = replyMsg.caption;
    else if (replyMsg.sticker)
      repliedContent = `[貼圖 ${replyMsg.sticker.emoji || ""}]`;

    if (repliedContent) {
      repliedContent = `${replyMsg.from?.first_name || ""}：${repliedContent}`;
      finalUserContent = `> ${repliedContent}\n\n${userContent}`;
    }
  }

  // 在群組聊天室中，在訊息前加入發話者名稱，讓 LLM 能識別說話者
  if (ctx.chat.type !== "private") {
    const senderName = ctx.from?.first_name || "User";
    finalUserContent = `${senderName}：${finalUserContent}`;
  }

  history.messages.push({ role: "user", content: finalUserContent });

  if (history.messages.length > 20) {
    const toSummarize = history.messages.splice(
      0,
      history.messages.length - 20
    );
    const summary = await summarizeMessages(toSummarize);
    history.messages.unshift({
      role: "system",
      content: `過去對話摘要：${summary}`,
    });
  }

  const messagesForModel = [
    ...history.messages,
    {
      role: "system",
      content: `username：${ctx.message!.from.last_name} ${
        ctx.message!.from.first_name
      }`,
    },
  ];

  const tools = getAISTools(ctx);

  try {
    let text: string | undefined;
    try {
      ({ text } = await generateText({
        model: OPENWEBUI_MODEL,
        messages: messagesForModel,
        tools,
        maxSteps: 3,
      }));
    } catch {
      text = "挖哩咧，偶詞窮惹";
    }

    const assistantResponse = text?.trim() ?? "";
    if (assistantResponse) {
      history.messages.push({ role: "assistant", content: assistantResponse });
      persistChatHistories();
      await safeReply(ctx, assistantResponse, {
        reply_to_message_id: ctx.message!.message_id,
      });
    }
  } catch (e) {
    console.error("chat generate error", e);
    const fallback = "挖哩咧，偶詞窮惹。";
    history.messages.push({ role: "assistant", content: fallback });
    persistChatHistories();
    await safeReply(ctx, fallback, {
      reply_to_message_id: ctx.message!.message_id,
    });
  }
}

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await processLLMMessage(ctx, ctx.message.text);
});

// Handle sticker messages via LLM (uses emoji as content)
bot.on("message:sticker", async (ctx) => {
  const emoji = ctx.message.sticker?.emoji || "🤔";
  await processLLMMessage(ctx, `[貼圖 ${emoji}]`);
});

// ----------------- End ChatGPT Handler -----------------

bot.start();
// Enable graceful stop
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
