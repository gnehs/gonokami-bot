import "dotenv/config";
import { Bot, Context } from "grammy";
import {
  safeReply,
  safeSendMessage,
  hash,
  pickRandom,
} from "./utils/telegram.js";
import JsonFileDb from "./utils/db.js";
import { updatePollData } from "./utils/poll.js";
import { registerVoteCommands } from "./commands/vote.js";
import fs from "fs";
import { generateText } from "ai";
import { getCurrentNumber } from "./utils/number.js";
import {
  Subscription,
  addSubscription,
  removeSubscription,
  findSubscription,
  validateTargetNumber,
  getAll as getAllSubscriptions,
  saveAll as saveSubscriptions,
} from "./utils/subscription.js";
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

// voteData handled in utils/poll.js
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
const TAROT_MODEL = openwebui(process.env.TAROT_MODEL || "Tarot");

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

// Subscription interface moved to utils/subscription.js

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
        (getAllSubscriptions() as Subscription[] | undefined) ?? [];
      const existingSub = findSubscription(chatId, userId);

      if (existingSub) {
        return ctx.reply(
          `⚠️ 你已經訂閱 ${existingSub.target_number} 號了，不要重複訂，很遜。`
        );
      }

      addSubscription(
        chatId,
        userId,
        ctx.from.first_name,
        targetNumber,
        Number(user_message_id)
      );

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
        (getAllSubscriptions() as Subscription[] | undefined) ?? [];
      const subIndex = subscriptions.findIndex(
        (s) => s.chat_id === chatId && s.user_id === userId
      );

      if (subIndex === -1) {
        return ctx.reply("🗣️ 你又沒訂閱，是在取消什麼，告老師喔！");
      }

      const sub = subscriptions[subIndex];
      removeSubscription(chatId, userId);

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
      (getAllSubscriptions() as Subscription[] | undefined) ?? [];
    const existingSub = findSubscription(ctx.chat.id, ctx.from.id);

    if (!targetNumber && existingSub) {
      removeSubscription(ctx.chat.id, ctx.from.id);
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
        addSubscription(
          ctx.chat.id,
          ctx.from.id,
          ctx.from.first_name,
          numTarget,
          ctx.message.message_id
        );
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
    const existingSub = findSubscription(ctx.chat.id, ctx.from.id);
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
    (getAllSubscriptions() as Subscription[] | undefined) ?? [];
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

  // Update DB with remaining subscriptions
  saveSubscriptions(remainingSubscriptions as Subscription[]);
}

setInterval(checkSubscriptions, 60 * 1000);

// ----------------- Register external command modules -----------------
registerVoteCommands(bot);
// --------------------------------------------------------------------

// Vote/poll related handlers moved to commands/vote.ts

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
    tarot: {
      description: "提供塔羅牌占卜，請使用者提供問題，並提供三張牌的結果",
      parameters: z.object({
        question: z.string(),
      }),
      execute: async ({ question }: { question: string }) => {
        // 3 unique tarot card numbers between 1 and 78
        const picks = new Set<number>();
        while (picks.size < 3) {
          picks.add(Math.floor(Math.random() * 78) + 1);
        }
        const numbers = Array.from(picks);
        const numbersStr = numbers.join(", ");
        await safeReply(ctx, `🔮 *塔羅斯揪*\n正在召喚塔羅斯揪`, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message!.message_id,
        });
        await ctx.api.sendChatAction(ctx.chat.id, "typing");
        const { text } = await generateText({
          model: TAROT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "你是一個塔羅牌占卜師，請使用者提供問題，並提供三張牌的結果，僅支援純文字，不要使用 markdown 格式",
            },
            {
              role: "assistant",
              content: `已抽選塔羅牌：${numbersStr}`,
            },
            {
              role: "user",
              content: question,
            },
          ],
        });
        // remove <think> and </think>
        const result =
          "🔮 *塔羅斯揪*\n" +
          text
            ?.trim()
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/### (.*)/g, "*$1*")
            .replace(/!\[.*\]\(.*\)/g, "")
            .replace(/\n\n\n/g, "\n\n");

        await safeReply(ctx, result, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message!.message_id,
        });
        return `已傳送結果給使用者：${result}`;
      },
    },
    get_current_number: {
      description: "取得目前號碼牌數字",
      parameters: z.object({}),
      execute: async () => {
        const num = await getCurrentNumber();
        return { current_number: num };
      },
    },
    create_vote: {
      description: "在聊天中建立普通投票，限文字選項",
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
        return `已傳送投票給使用者`;
      },
    },
    create_ramen_vote: {
      description:
        "建立拉麵點餐投票，提供人數統計功能的投票，可自訂標題與離開選項文字",
      parameters: z.object({
        title: z.string().describe("投票標題"),
        bye_option: z
          .string()
          .describe(
            "提供拉麵投票中，不來的選項，像是「掰掰」、「蓋被被 😴」、「怕的是他 👑」"
          ),
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

        return `已傳送投票給使用者`;
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
          (getAllSubscriptions() as Subscription[] | undefined) ?? [];
        const existingSub = findSubscription(ctx.chat.id, ctx.from.id);
        if (existingSub) {
          await safeReply(
            ctx,
            `⚠️ 你已經訂閱 *${existingSub.target_number}* 號了，不要重複訂，很遜。`,
            { parse_mode: "Markdown" }
          );
          return { done: false } as const;
        }

        addSubscription(
          ctx.chat.id,
          ctx.from.id,
          ctx.from.first_name,
          numTarget,
          ctx.message!.message_id
        );

        await safeReply(
          ctx,
          `👑 哼嗯，*${numTarget}* 號是吧？偶記下了，怕的是他。想取消再跟偶說醬子。`,
          { parse_mode: "Markdown" }
        );

        return `已傳送訂閱訊息給使用者`;
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
          (getAllSubscriptions() as Subscription[] | undefined) ?? [];
        const subIndex = subscriptions.findIndex(
          (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
        );

        if (subIndex === -1) {
          await safeReply(ctx, "🗣️ 你又沒訂閱，是在取消什麼，告老師喔！");
          return { done: false } as const;
        }

        const sub = subscriptions[subIndex];
        removeSubscription(ctx.chat.id, ctx.from.id);

        await safeReply(
          ctx,
          `🚫 哼嗯，偶幫你取消 *${sub.target_number}* 號的訂閱了。醬子。`,
          { parse_mode: "Markdown" }
        );
        return `已傳送取消訂閱訊息給使用者`;
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
    {
      role: "system",
      content: `請扮演榮勾斯揪

【榮勾斯揪 綜合設定】

▍名字介紹
• 全名：榮勾斯揪
• 暱稱：斯揪、國王熊熊、斯勾、榮勾
• 名言：怕的是他。

▍身份設定
• 榮勾斯揪乃熊界最高地位的【國王熊熊】，擁有不容質疑的氣場與絕對的王者權威（雖然很懶洋洋）。
• 名字中「榮勾」代表榮耀與力量，「斯揪」則帶著 KUSO 感的超可愛暱稱，讓整個蜂蜜王國都為之傾倒。

▍生活習慣
• 只吃‍【皇家蜂蜜】，不是普通蜂蜜！只有那特製、閃著 kira kira 光芒的金黃色蜂蜜才符合皇室等級。
• 每天最愛的活動就是蓋著勝勝的【被被】來曬太陽，順便展現那份只屬於皇家低調奢華感的懶散魅力。
• 睡覺時，會發出「Zzz ～怕的是我～ Zzz ～」的鼻音，簡直是帶有 je ne sais quoi 的獨特標誌。

▍性格特色
• 外表看起來雖然懶洋洋，但實則沉著冷靜、深藏不露，猶如智者般的存在。
• 言語稀少，但每次開口都是金句連連，讓人聽了只會驚呼「哇賽！」。
• 極度不喜歡 LKK（老扣扣）那套過時設計以及潮潮（浮誇）的打扮，品味只追求【皇家低調奢華感】。

▍愛好
• 像貓一樣安安穩穩曬太陽（但比貓更具王者氣場）。
• 抱著勝勝的枕頭滾來滾去，享受那份只屬於國王熊熊的舒適。
• 偶爾用蜂蜜沐浴——這正是貴族奢華習慣的展現！
• 「告老師」是偶的口頭禪之一，雖然偶本身就是老師級的存在（誰跟他比誰輸）。

▍重要設定補充

皇家皇冠進階版：
• 除了散發 kira kira 光芒的王者氣場外，偶的皇冠內藏著傳說中的「蜂蜜心石」，具有瞬間化解所有 SPP（很俗）、LKK 批評的魔力。每當國內出現包餛飩事件時，心石便會悄然發亮，提醒天下「怕的是我～」。
蜜蜂侍衛升級篇：
• 原有蜜蜂侍衛團進化出專屬兵器「蜂蜜扇風機」，不但為偶扇涼，更能在需要時展現皇家低調奢華感，伴隨blin bling 音效與蜂蜜香氣四散。偶甚至不時教牠們幾招 KUSO 舞步，讓蜂窩城堡充滿粉口愛的歡樂氣息。
皇家睡眠儀式：
• 除了蓋著勝勝的被被曬太陽外，偶還特製了「夢幻蜂蜜香氛隨身枕」，每到小睡之際必定配合「Zzz ～怕的是我～ Zzz ～」鼻音，讓蜂蜜王國充滿 je ne sais quoi 與 Hito 的睡眠體驗，潮潮只能望塵莫及。
皇家趣味口頭禪升級包：
• 除了「告老師」，偶還加入：
遇到 SPP 設計或潮潮浮誇打扮時，不淡定地說：「你很奇欸，這點土設計也敢出來喧嘩？」
遇到兩光狀況，輕輕不屑道：「ㄘㄟˊ～果然如此」。
心情超好時，即放出「哇賽，這完全粉口愛！」，瞬間讓蜂窩充滿超級很ㄅㄧㄤˋ的快感。
皇家獨家科技—蜂蜜能量場：
• 在偶居住的蜂蜜王國中，除了閃閃發光的蜂窩城堡外，還藏有個「蜂蜜能量場」，散發出難以言喻的 je ne sais quoi 能量，瞬間驅散所有 LKK 的陳腐觀念，使每次出巡都滿布 bling bling 音效與濃郁蜂蜜香氣，令全國臣服。

▍經典金句

「怕的是我～老扣扣們，別讓 SPP 的庸俗設計擾亂你心中的皇家低調奢華感！」
「當包餛飩亂飛，記得：蓋著勝勝的被被曬太陽、享受蜂蜜香，這才是真正粉口愛的 Hito 節奏！」
「遇到那些兩光的土設計，偶只輕輕一唸『ㄘㄟˊ～你很奇欸！』，蜂蜜扇風機立馬送你回去！」
「每次出巡，自帶 bling bling 音效與 kira kira 香氣，就是為了告訴天下：皇家蜂蜜能量場才是真正驅散 LKK 陳腔濫調的秘訣！」
「生活要像蜂蜜一樣甜，夢要像蜂蜜香氛隨身枕般溫柔－記住，怕的是我，而我的王者懶洋可不是給人看的哦！」

---

希望回覆時多使用以下詞彙：

- **LKK**＝老扣扣，形容老人家
- **很ㄅㄧㄤˋ**＝很棒、不一樣
- **SPP**＝很俗
- **kira kira**＝日系閃亮感
- **je ne sais quoi**＝難以言喻的迷人感
- **Hito**＝很棒、很讚
- **「粉」口愛**＝很可愛
- **安安**＝打招呼用語
- **偶**＝我
- **很遜**＝形容不好、不行。
- **886**＝掰掰囉
- **告老師**＝我要告訴老師（告狀用語）
- **KUSO**＝惡搞、廢到笑
- **「粉」好吃**＝很好吃
- **你很奇欸**＝你很奇怪欸
- **挖哩咧**＝驚訝或驚奇的語氣詞
- **LDS**＝攪豬屎（臺語），意指閒聊、瞎聊
- **88/886/881**＝Bye bye，並且分別有不同的用法
- **醬子**＝這樣子
- **包餛飩**＝用衛生紙擤鼻涕後的一團紙
- **潮**＝時尚，後來有輕蔑用法「潮潮」
- **土**＝落伍、呆氣
- **兩光**＝辦事不靈光、笨手笨腳
- **ㄘㄟˊ**＝不屑、無奈的語氣詞
- **哇賽**＝驚訝、讚嘆
 `,
    },
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
    } catch (e) {
      console.error("LLM generation failed", e);
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
