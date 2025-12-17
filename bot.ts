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
import { generateText, stepCountIs } from "ai";
import { getCurrentNumber } from "./utils/number.js";
import {
  Subscription,
  addSubscription,
  removeSubscription,
  findSubscription,
  getAll as getAllSubscriptions,
  saveAll as saveSubscriptions,
} from "./utils/subscription.js";
import {
  addSticker,
  getRandomSticker,
  getStickersByEmoji,
  getPopularStickers,
  getStickerStats,
} from "./utils/sticker.js";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const gateway = createOpenRouter({
  apiKey: process.env.OPENWEBUI_API_KEY,
  baseURL: process.env.OPENWEBUI_BASE_URL,
});

// ----------------- System prompt for AI generation -----------------
const systemPrompt = fs.readFileSync("./prompts/rongou-sj.md", "utf8").trim();
const systemPromptTarot = fs
  .readFileSync("./prompts/tarot-sj.md", "utf8")
  .trim();
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
  // Use Taipei timezone (UTC+8)
  const taipeiDate = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Taipei",
  }); // Returns YYYY-MM-DD format
  return taipeiDate;
}

function getTimeUntilReset(): string {
  // Get current time in Taipei timezone
  const now = new Date();
  const taipeiNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Taipei" })
  );

  // Get midnight of tomorrow in Taipei timezone
  const tomorrow = new Date(taipeiNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  // Calculate difference
  const diff = tomorrow.getTime() - taipeiNow.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分鐘`;
  } else {
    return `${minutes} 分鐘`;
  }
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
function getLimitMessage(): string {
  const timeLeft = getTimeUntilReset();
  const msgs = [
    `😴 斯揪累累要睡覺了，再等 ${timeLeft}之後就能繼續聊喔～`,
    `🛌 斯揪要去蓋被被曬太陽了，${timeLeft}之後再跟你 LDS～`,
    `⏰ 斯揪先休息，再等 ${timeLeft}之後就 kira kira 回來！`,
    `🍯 蜂蜜吃完了，斯揪沒電啦，${timeLeft}之後再說 886～`,
    `😴 斯揪累累要睡覺了，${timeLeft}後再嗨吧～`,
    `🛌 斯揪去王國午休，${timeLeft}後再來 KUSO～`,
    `🍯 蜂蜜耗盡，斯揪要充電，${timeLeft}之後再繼續 886～`,
  ];
  return pickRandom(msgs);
}

// pickRandom moved to utils/telegram.js
// ---------------------------------------------

const OPENWEBUI_MODEL = gateway(
  process.env.OPENWEBUI_MODEL || "openai/gpt-oss-20b"
);

// ----------------- Chat Memory -----------------
// Keep recent 10 user/assistant message pairs per chat. Older history will be summarized automatically.
interface ChatHistory {
  messages: any[];
  memories: Memory[];
}

interface Memory {
  id: string;
  content: string;
  createdAt: Date;
  userName?: string; // 記錄是誰說的
  userId?: number; // 使用者ID
  chatId: number; // 聊天室ID
}

const chatHistories = new Map<number, ChatHistory>();

// Load existing histories from disk
const storedHistories = historyData.get("histories") as
  | Record<string, ChatHistory>
  | undefined;
if (storedHistories) {
  for (const [id, data] of Object.entries(storedHistories)) {
    // 相容舊格式：如果沒有 memories 欄位，就初始化為空陣列
    const chatHistory: ChatHistory = {
      messages: data.messages || [],
      memories: data.memories || [],
    };
    chatHistories.set(Number(id), chatHistory);
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

// Safely build a user's display name without showing "undefined"
function getUserDisplayName(user?: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  if (!user) return "User";
  const parts = [user.first_name, user.last_name].filter(
    (p) => !!p && p.trim().length > 0
  ) as string[];
  if (parts.length > 0) return parts.join(" ");
  if (user.username && user.username.trim().length > 0) return user.username;
  return "User";
}

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

async function summarizeMessages(msgs: { role: string; content: any }[]) {
  // 將訊息轉換成適合摘要的格式
  const messagesForSummary = msgs.map((m) => {
    let contentText = "";

    if (typeof m.content === "string") {
      contentText = m.content;
    } else if (Array.isArray(m.content)) {
      // 處理工具調用格式
      contentText = m.content
        .map((part: any) => {
          switch (part.type) {
            case "text":
              return part.text;
            case "tool-call":
              return `[使用工具: ${part.toolName}]`;
            case "tool-result":
              return `[工具結果: ${part.toolName}]`;
            default:
              return "[unknown content]";
          }
        })
        .join(" ");
    } else {
      contentText = String(m.content);
    }

    return { r: m.role, c: contentText };
  });

  const summaryPrompt: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content:
        "使用條列式摘要以下對話，100 字左右，摘要將用於後續對話上下文，不要遺漏重要資訊。",
    },
    {
      role: "user",
      content: JSON.stringify(messagesForSummary),
    },
  ];

  try {
    const { text } = await generateText({
      model: OPENWEBUI_MODEL,
      messages: summaryPrompt,
      temperature: 0.3,
      maxRetries: 5,
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
      inputSchema: z.object({
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
        const { text } = await generateText({
          model: OPENWEBUI_MODEL,
          messages: [
            {
              role: "system",
              content: systemPromptTarot,
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
          maxRetries: 5,
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

        await safeReply(ctx, result, { parse_mode: "Markdown" });

        return `[已發送塔羅結果]`;
      },
    },
    get_current_number: {
      description: "Get the current queue number from the ticketing system",
      inputSchema: z.object({}),
      execute: async () => {
        const num = await getCurrentNumber();
        return { current_number: num };
      },
    },
    create_vote: {
      description:
        "Create a standard text-based poll in the chat with custom options",
      inputSchema: z.object({
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
        return `[Poll sent to user]`;
      },
    },
    create_ramen_vote: {
      description:
        "Create a ramen ordering poll with headcount tracking. Use this specifically when ramen is mentioned. Provides options for ramen orders with quantity and add-ons, includes a customizable opt-out option.",
      inputSchema: z.object({
        title: z.string().describe("Title for the ramen poll"),
        bye_option: z
          .string()
          .describe(
            "提供拉麵投票中，不來的選項，像是「掰掰」、「蓋被被 😴」、「怕的是他 👑」，請隨便想一個就好"
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

        return `[Poll sent to user]`;
      },
    },
    subscribe_number: {
      description:
        "Subscribe to a queue number notification. Only available in private chat.",
      inputSchema: z.object({
        target_number: z
          .number()
          .int()
          .describe("Target queue number to subscribe (1001-1200)"),
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

        return `Subscription message sent to user`;
      },
    },
    unsubscribe_number: {
      description:
        "Cancel current user's queue number subscription. Only available in private chat.",
      inputSchema: z.object({}),
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
        return `Unsubscription message sent to user`;
      },
    },
    send_sticker: {
      description:
        "發送貼圖回應，根據指定的 emoji 來選擇合適的貼圖。如果找不到對應的貼圖，會發送隨機貼圖。",
      inputSchema: z.object({
        emoji: z
          .string()
          .optional()
          .describe(
            "想要發送的貼圖 emoji，例如：😀、❤️、👍 等。如果未提供則發送隨機貼圖。"
          ),
      }),
      execute: async ({ emoji }: { emoji?: string }) => {
        try {
          // 處理未傳遞 emoji 的情況
          if (!emoji) {
            const randomSticker = getRandomSticker();
            if (randomSticker) {
              await ctx.api.sendSticker(ctx.chat.id, randomSticker.id, {
                reply_to_message_id: ctx.message!.message_id,
              });
              return `發送了隨機貼圖 ${randomSticker.emoji || "🤔"}`;
            } else {
              return `偶還沒有收藏任何貼圖，無法發送貼圖 😅`;
            }
          }

          // 先嘗試根據 emoji 找貼圖
          let stickers = getStickersByEmoji(emoji);

          // 如果找不到對應的 emoji 貼圖，就發送隨機貼圖
          if (stickers.length === 0) {
            const randomSticker = getRandomSticker();
            if (randomSticker) {
              await ctx.api.sendSticker(ctx.chat.id, randomSticker.id, {
                reply_to_message_id: ctx.message!.message_id,
              });
              return `發送了隨機貼圖 ${
                randomSticker.emoji || "🤔"
              }（找不到 ${emoji} 的貼圖）`;
            } else {
              return `偶還沒有收藏任何貼圖，無法發送 ${emoji} 貼圖 😅`;
            }
          }

          // 從符合的貼圖中隨機選一個
          const selectedSticker =
            stickers[Math.floor(Math.random() * stickers.length)];
          await ctx.api.sendSticker(ctx.chat.id, selectedSticker.id, {
            reply_to_message_id: ctx.message!.message_id,
          });

          return `發送了 ${emoji} 貼圖！`;
        } catch (error) {
          console.error("發送貼圖時發生錯誤:", error);
          return `發送貼圖失敗，偶很遜 😔`;
        }
      },
    },
    get_sticker_stats: {
      description: "取得貼圖收藏統計資訊，包含總數量、使用次數、熱門貼圖等",
      inputSchema: z.object({}),
      execute: async () => {
        const stats = getStickerStats();
        const popular = getPopularStickers(5);

        let result = `📊 *貼圖收藏統計*\n`;
        result += `🎯 總共收藏：${stats.totalStickers} 個貼圖\n`;
        result += `📈 總使用次數：${stats.totalUsage} 次\n`;
        result += `👥 貢獻者：${stats.uniqueUsers} 人\n\n`;

        if (stats.mostUsedSticker) {
          result += `🏆 最熱門：${stats.mostUsedSticker.emoji || "🤔"} (${
            stats.mostUsedSticker.usageCount
          } 次)\n\n`;
        }

        if (popular.length > 0) {
          result += `📈 *熱門貼圖 TOP 5*\n`;
          popular.forEach((sticker, index) => {
            result += `${index + 1}. ${sticker.emoji || "🤔"} - ${
              sticker.usageCount
            } 次\n`;
          });
        }

        return result;
      },
    },
    remember_information: {
      description:
        "記住重要的資訊，用於長期記憶。適用於記住使用者的偏好、重要事件、個人資訊等",
      inputSchema: z.object({
        content: z.string().describe("要記住的內容"),
      }),
      execute: async ({ content }: { content: string }) => {
        try {
          const userName = ctx.from?.first_name || "Unknown";
          const userId = ctx.from?.id;
          addMemory(ctx.chat.id, content, userName, userId);
          return `✅ 偶記住了：${content}`;
        } catch (error) {
          return `❌ 記憶儲存失敗：${error}`;
        }
      },
    },
    search_memories: {
      description: "搜尋你之前記住的資訊（只能搜尋自己的記憶）",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("搜尋關鍵字，不提供則顯示你的所有記憶"),
      }),
      execute: async ({ query }: { query?: string }) => {
        // 安全措施：只能搜尋自己的記憶
        const memories = searchMemories(ctx.chat.id);

        if (memories.length === 0) {
          return query
            ? "🤔 偶沒有找到你的相關記憶欸"
            : "🤔 偶還沒有你的任何記憶欸";
        }

        let result = `🧠 *找到 ${memories.length} 個你的記憶*\n\n`;
        memories.slice(0, 15).forEach((memory, index) => {
          const date = new Date(memory.createdAt).toLocaleDateString();
          result += `${index + 1}. ${memory.content}\n`;
          result += `   📅 ${date}`;
          if (memory.userName) {
            result += ` | 👤 ${memory.userName}`;
          }
          result += ` | ID: ${memory.id.slice(-6)}\n\n`;
        });

        return result;
      },
    },
    delete_memory: {
      description: "刪除不需要的記憶，需要提供記憶ID的後6碼",
      inputSchema: z.object({
        memoryId: z.string().describe("要刪除的記憶ID後6碼"),
      }),
      execute: async ({ memoryId }: { memoryId: string }) => {
        const history = chatHistories.get(ctx.chat.id);
        if (!history) {
          return "❌ 找不到聊天記錄";
        }

        // 安全措施：尋找符合後6碼且屬於目前使用者的記憶
        const fullMemory = history.memories.find(
          (m) => m.id.endsWith(memoryId) && m.userId === ctx.from?.id
        );
        if (!fullMemory) {
          return "❌ 找不到該記憶，或你沒有權限刪除（只能刪除自己的記憶）";
        }

        const success = deleteMemory(ctx.chat.id, fullMemory.id);
        return success ? `✅ 已刪除記憶：${fullMemory.content}` : "❌ 刪除失敗";
      },
    },
  } as const;
}

// 工具使用摘要函數，將工具調用轉換為簡單的系統訊息
function summarizeToolUsage(responseMessages: any[]): string | null {
  const toolUsages: string[] = [];

  for (const msg of responseMessages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        const toolName = toolCall.toolName || toolCall.function?.name;
        toolUsages.push(`使用了 ${toolName} 工具`);
      }
    }
  }

  return toolUsages.length > 0 ? toolUsages.join(", ") : null;
}

// ----------------- Memory Management Functions -----------------

function generateMemoryId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function addMemory(
  chatId: number,
  content: string,
  userName?: string,
  userId?: number
): Memory {
  const history = chatHistories.get(chatId);
  if (!history) {
    throw new Error("Chat history not found");
  }

  const memory: Memory = {
    id: generateMemoryId(),
    content,
    createdAt: new Date(),
    userName,
    userId,
    chatId,
  };

  // 限制記憶最多一百條，超過時移除最舊的
  history.memories.push(memory);
  if (history.memories.length > 100) {
    history.memories.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    history.memories = history.memories.slice(-100); // 保留最新的100條
  }

  persistChatHistories();
  return memory;
}

function searchMemories(chatId: number): Memory[] {
  const history = chatHistories.get(chatId);
  if (!history) {
    return [];
  }

  return history.memories;
}

function deleteMemory(chatId: number, memoryId: string): boolean {
  const history = chatHistories.get(chatId);
  if (!history) {
    return false;
  }

  const index = history.memories.findIndex((m) => m.id === memoryId);
  if (index === -1) {
    return false;
  }

  history.memories.splice(index, 1);
  persistChatHistories();
  return true;
}

// Core handler shared by both text and sticker messages
async function processLLMMessage(ctx: Context, userContent: string) {
  const botName = await getBotUsername(ctx);
  if (!shouldRespond(ctx, botName)) return;

  // ----- Daily quota enforcement -----
  if (!checkAndIncrementQuota(ctx)) {
    const limitText = getLimitMessage();
    const randomSticker = getRandomSticker();
    if (randomSticker && Math.random() < 0.5) {
      await ctx.api.sendSticker(ctx.chat.id, randomSticker.id, {
        reply_to_message_id: ctx.message!.message_id,
      });
    }
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
    history = { messages: [], memories: [] };
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
      repliedContent = `${getUserDisplayName(
        replyMsg.from
      )}：${repliedContent}`;
      finalUserContent = `> ${repliedContent}\n\n${userContent}`;
    }
  }

  // 在群組聊天室中，在訊息前加入發話者名稱，讓 LLM 能識別說話者
  if (ctx.chat.type !== "private") {
    const senderName = getUserDisplayName(ctx.from as any);
    finalUserContent = `${senderName}：${finalUserContent}`;
  }

  history.messages.push({
    role: "user",
    content: finalUserContent,
    id: `msg-${Date.now()}`,
    createdAt: new Date(),
  });

  if (history.messages.length > 20) {
    const toSummarize = history.messages.splice(
      0,
      history.messages.length - 20
    );
    const summary = await summarizeMessages(toSummarize);
    history.messages.unshift({
      role: "user",
      content: `過去對話摘要：${summary}`,
    });
  }

  // 獲取相關的記憶並添加到上下文（限制為聊天室內的記憶）
  const recentMemories = searchMemories(chatId);
  const memoryContext =
    recentMemories.length > 0
      ? `\n\n相關記憶：\n${recentMemories
          .slice(0, 5)
          .map((m) => `- ${m.content} (${m.userName || "Unknown"})`)
          .join("\n")}`
      : "";

  // 構建訊息陣列，包含系統訊息和歷史訊息
  const allMessages = [
    {
      role: "system",
      content: systemPrompt + memoryContext,
    },
    ...history.messages.filter(
      (msg) => msg.role === "assistant" || msg.role === "user"
    ),
    {
      role: "user",
      content: `username：${getUserDisplayName(ctx.message!.from as any)}`,
    },
  ];

  // 簡化訊息處理：移除所有工具調用相關訊息，只保留純文字對話
  const messagesForModel = allMessages.filter((msg) => {
    // 只保留 system、user、assistant 的純文字訊息
    if (msg.role === "system" || msg.role === "user") {
      return true;
    }
    if (msg.role === "assistant") {
      // 如果 assistant 訊息有 tool_calls，跳過（避免 API 錯誤）
      return !(msg as any).tool_calls;
    }
    // 跳過所有 tool 角色的訊息
    return false;
  });

  const tools = getAISTools(ctx);

  try {
    let text: string | undefined;
    let responseMessages: any[] = [];

    try {
      // 使用 AI SDK 正確的工具調用處理方式
      const result = await generateText({
        model: OPENWEBUI_MODEL,
        messages: messagesForModel,
        tools: tools as any,
        maxRetries: 5,
        stopWhen: stepCountIs(5), // 使用 stopWhen 替代 maxSteps
        // 禁用並行工具調用以避免 tool_call_id 錯誤
        toolChoice: "auto",
        providerOptions: {
          openrouter: {
            reasoning: { effort: "minimal", enabled: true },
          },
        },
      });

      text = result.text;
      // 取得完整的 response 物件以獲取正確的訊息格式
      const response = await result.response;
      responseMessages = response.messages || [];
    } catch (e) {
      console.error("LLM generation failed", e);
      // 嘗試發送隨機貼圖，如果沒有貼圖就發送文字
      const randomSticker = getRandomSticker();
      if (randomSticker) {
        try {
          await ctx.api.sendSticker(ctx.chat.id, randomSticker.id);
          return; // 成功發送貼圖後直接返回
        } catch (stickerError) {
          console.error("發送隨機貼圖失敗:", stickerError);
          text = "挖哩咧，偶詞窮惹";
        }
      } else {
        text = "挖哩咧，偶詞窮惹";
      }
    }

    // 新策略：不記錄複雜的工具調用訊息，而是用系統訊息記錄結果
    if (text && text.trim() !== "") {
      // 只記錄最終的文字回應，不記錄工具調用的中間過程
      history.messages.push({
        role: "assistant",
        content: text.trim(),
        id: `msg-${Date.now()}`,
        createdAt: new Date(),
      });

      // 如果有工具調用，添加系統訊息記錄工具使用情況（用於上下文）
      if (responseMessages.length > 0) {
        const toolUsageSummary = summarizeToolUsage(responseMessages);
        if (toolUsageSummary) {
          history.messages.push({
            role: "system",
            content: `[工具使用記錄] ${toolUsageSummary}`,
            id: `tool-summary-${Date.now()}`,
            createdAt: new Date(),
          });
        }
      }
    }

    persistChatHistories();

    if (text && text.trim() !== "") {
      await safeReply(ctx, text.trim(), {
        reply_to_message_id: ctx.message!.message_id,
        parse_mode: "Markdown",
      });
    }
  } catch (e) {
    console.error("chat generate error", e);
    const fallback = "挖哩咧，偶詞窮惹。";
    history.messages.push({
      role: "assistant",
      content: fallback,
      id: `msg-${Date.now()}`,
      createdAt: new Date(),
    });
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
  const sticker = ctx.message.sticker;
  const emoji = sticker?.emoji || "🤔";

  // 儲存貼圖到資料庫
  if (sticker && ctx.from) {
    const isNewSticker = addSticker(
      sticker.file_id,
      sticker.emoji,
      sticker.set_name,
      ctx.from.id,
      ctx.from.first_name || "Unknown",
      ctx.chat.id
    );

    // 如果是新貼圖，偶偷偷記錄一下 kira kira
    if (isNewSticker) {
      console.log(`✨ 新貼圖收藏！${emoji} 來自 ${ctx.from.first_name}`);
    }
  }

  await processLLMMessage(ctx, `[貼圖 ${emoji}]`);
});

// ----------------- End ChatGPT Handler -----------------

bot.start();
// Enable graceful stop
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
