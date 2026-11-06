import { db, api, BotApiError } from "sdk";
import { and, eq } from "sdk/db";
import { subscriptions } from "../schema.ts";
import { parseTargetNumber, type QueueReading } from "./queue.ts";
import { predictCallTime, readQueue, todaySessions } from "./store.ts";
import { mention, type CallbackQuery, type Message } from "./telegram.ts";
import { awaitsReset, isBetweenSessions, subscriptionOutcome, type Outcome, type SubscriptionState } from "./subscription.ts";
import { formatClock } from "./time.ts";

type Subscription = SubscriptionState & {
  chatId: number;
  userId: number;
  firstName: string;
  messageId: number;
};

function cancelMarkup(userId: number) {
  return { inline_keyboard: [[{ text: "🚫 取消叫號通知", callback_data: `cancelnumber_${userId}` }]] };
}

async function clearButton(chatId: number, messageId: number) {
  try {
    await api.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  } catch (error) {
    if (!(error instanceof BotApiError && error.code === 400)) throw error;
  }
}

async function findSubscription(chatId: number, userId: number): Promise<Subscription | null> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.userId, userId)))
    .get();
}

/** Matching the message too means a subscription replaced meanwhile by /number is left alone. */
async function deleteSubscription(sub: Subscription): Promise<boolean> {
  const { rowsAffected } = await db
    .delete(subscriptions)
    .where(
      eq(subscriptions.chatId, sub.chatId),
      eq(subscriptions.userId, sub.userId),
      eq(subscriptions.messageId, sub.messageId)
    );
  return rowsAffected > 0;
}

async function predictionLine(reading: QueueReading, target: number): Promise<string> {
  if (target <= reading.number) return "\n🕒 換場重新叫號後，偶才算得出預估時間。";
  try {
    const { likely, earliest, latest } = await predictCallTime(reading.number, target);
    const range = earliest < latest ? `（大概 ${formatClock(earliest)}–${formatClock(latest)}）` : "";
    return `\n🕒 預估叫號時間 <b>${formatClock(likely)}</b>${range}`;
  } catch (error) {
    console.error("prediction failed", error);
    return "\n預測叫號時間暫時不可用，晚點再試。";
  }
}

async function reply(message: Message, text: string, extra: Record<string, unknown> = {}) {
  return api.sendMessage({
    chat_id: message.chat.id,
    text,
    parse_mode: "HTML",
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    ...extra,
  });
}

export async function handleNumberCommand(message: Message, arg: string | undefined) {
  const from = message.from!;
  const reading = await readQueue();
  if (!reading) return reply(message, "挖哩咧 😵‍💫，偶拿不到號碼，很遜欸。");

  let text = `👑 哼嗯，現在號碼是 <b>${reading.number}</b>，醬子。`;
  const existing = await findSubscription(message.chat.id, from.id);

  if (arg === undefined) {
    if (existing) {
      text += awaitsReset(existing, reading.number)
        ? `\n✅ 你訂閱的是下一場的 <b>${existing.targetNumber}</b> 號，換場後叫到再跟你說，安安。`
        : `\n✅ 你訂閱的 <b>${existing.targetNumber}</b> 號偶記下了，叫到再跟你說，安安。`;
      text += await predictionLine(reading, existing.targetNumber);
      return reply(message, text, { reply_markup: cancelMarkup(from.id) });
    }
    return reply(message, `${text}\n\n想訂閱叫號？打 <code>/number 你的號碼</code>，偶幫你記著，很ㄅㄧㄤˋ吧 ✨。`);
  }

  const target = parseTargetNumber(arg);
  if (target === null) {
    return reply(message, `${text}\n🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。`);
  }
  const waitsForReset = target <= reading.number;
  if (waitsForReset && !isBetweenSessions(reading.changedAt, Date.now())) {
    return reply(message, `${text}\n🤡 這位同學，<b>${target}</b> 已經過了，你很奇欸。`);
  }

  if (existing) {
    await deleteSubscription(existing);
    await clearButton(existing.chatId, existing.messageId);
    text += `\n🔁 幫你把叫號通知從 <b>${existing.targetNumber}</b> 改成 <b>${target}</b> 號了，怕的是他。`;
  } else if (!waitsForReset) {
    text += `\n🔔 <b>${target}</b> 號還沒到，叫到偶會在這裡喊你，怕的是他。`;
  }
  if (waitsForReset) {
    text += `\n⏳ 看板停在 <b>${reading.number}</b> 很久了，這場應該收了。<b>${target}</b> 號偶當成下一場的號碼，等店家換場重新叫到再喊你。`;
  }
  text += await predictionLine(reading, target);
  const sent = await reply(message, text, { reply_markup: cancelMarkup(from.id) });
  const row = {
    chatId: message.chat.id,
    userId: from.id,
    firstName: from.first_name,
    targetNumber: target,
    messageId: sent.message_id,
    createdAt: Date.now(),
    waitsForReset,
  };
  await db
    .insert(subscriptions)
    .values(row)
    .onConflictDoUpdate({ target: [subscriptions.chatId, subscriptions.userId], set: row });
}

export async function handleCancelNumber(query: CallbackQuery, ownerId: number) {
  const message = query.message;
  if (!message) return api.answerCallbackQuery({ callback_query_id: query.id, text: "訊息不見了，偶也沒轍。" });
  if (ownerId !== query.from.id) {
    return api.answerCallbackQuery({ callback_query_id: query.id, text: "🗣️ 告老師喔，只有訂閱的人才能取消，你很奇欸。" });
  }

  await clearButton(message.chat.id, message.message_id);
  const sub = await findSubscription(message.chat.id, query.from.id);
  if (!sub) return api.answerCallbackQuery({ callback_query_id: query.id, text: "你已經沒有叫號通知了，醬子。" });

  await deleteSubscription(sub);
  if (sub.messageId !== message.message_id) await clearButton(sub.chatId, sub.messageId);
  await api.answerCallbackQuery({ callback_query_id: query.id, text: "已取消叫號通知。" });
  await reply(message, `🚫 哼嗯，偶幫你取消 <b>${sub.targetNumber}</b> 號的訂閱了。醬子。`);
}

function outcomeText(sub: Subscription, outcome: Outcome): string {
  const who = mention(sub.userId, sub.firstName);
  if (outcome === "reached") return `喂～ 👑 ${who} ，你訂的 ${sub.targetNumber} 號到了，怕的是他。還不快去！`;
  if (outcome === "expired") {
    return `欸 👋 ${who} ，你的 ${sub.targetNumber} 號等太久了，超過五小時偶就幫你取消了，很遜欸。881。`;
  }
  return `欸 👋 ${who} ，這場收了，店家把號碼重新從頭叫，你的 ${sub.targetNumber} 號偶就幫你取消了。下一場的號碼再打 <code>/number</code> 跟偶說，醬子。`;
}

/** Called every minute: announce reached numbers, drop subscriptions older than five hours or from a finished session. */
export async function notifySubscribers(reading: QueueReading) {
  const subs: Subscription[] = await db.select().from(subscriptions).all();
  if (subs.length === 0) return 0;
  const now = Date.now();
  const sessions = await todaySessions(now);
  let notified = 0;
  for (const sub of subs) {
    const outcome = subscriptionOutcome(sub, sessions, reading.number, now);
    if (!outcome) continue;

    // Whoever deletes the row sends the message, so overlapping ticks never announce twice.
    if (!(await deleteSubscription(sub))) continue;
    try {
      await api.sendMessage({
        chat_id: sub.chatId,
        text: outcomeText(sub, outcome),
        parse_mode: "HTML",
        reply_parameters: { message_id: sub.messageId, allow_sending_without_reply: true },
      });
      await clearButton(sub.chatId, sub.messageId);
      notified += 1;
    } catch (error) {
      console.error("subscription notify failed", { sub, error: String(error) });
    }
  }
  return notified;
}
