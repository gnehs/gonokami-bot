import { db, api, BotApiError } from "sdk";
import { and, eq } from "sdk/db";
import { subscriptions } from "../schema.ts";
import { parseTargetNumber, type QueueReading } from "./queue.ts";
import { predictCallTime, readQueue, todaySessions } from "./store.ts";
import { mention, type CallbackQuery, type Message } from "./telegram.ts";
import { awaitsReset, isBetweenSessions, subscriptionOutcome, type Outcome, type SubscriptionState } from "./subscription.ts";
import { formatClock } from "./time.ts";
import {
  cancelGoneText,
  cancelledText,
  cancelNothingText,
  cancelNotOwnerText,
  cancelToastText,
  changedText,
  currentNumberText,
  expiredText,
  invalidNumberText,
  nextSessionText,
  passedText,
  predictionFailedText,
  predictionText,
  reachedText,
  sessionOverText,
  subscribeHintText,
  subscribedAlreadyText,
  subscribedNextSessionText,
  subscribedText,
  unreachableText,
  waitsForResetText,
} from "./voice.ts";

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

const SOON_MINUTES = 10;

async function predictionLine(reading: QueueReading, target: number): Promise<string> {
  if (target <= reading.number) return `\n${nextSessionText()}`;
  try {
    const now = Date.now();
    const { likely, earliest, latest } = await predictCallTime(reading.number, target, now);
    const times = { likely: formatClock(likely), earliest: formatClock(earliest), latest: formatClock(latest) };
    return `\n${predictionText(times, { soon: likely - now <= SOON_MINUTES * 60_000, hasRange: times.earliest !== times.latest })}`;
  } catch (error) {
    console.error("prediction failed", error);
    return `\n${predictionFailedText()}`;
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
  if (!reading) return reply(message, unreachableText());

  let text = currentNumberText(reading.number);
  const existing = await findSubscription(message.chat.id, from.id);

  if (arg === undefined) {
    if (existing) {
      text += `\n${awaitsReset(existing, reading.number) ? subscribedNextSessionText(existing.targetNumber) : subscribedAlreadyText(existing.targetNumber)}`;
      text += await predictionLine(reading, existing.targetNumber);
      return reply(message, text, { reply_markup: cancelMarkup(from.id) });
    }
    return reply(message, `${text}\n\n${subscribeHintText()}`);
  }

  const target = parseTargetNumber(arg);
  if (target === null) {
    return reply(message, `${text}\n${invalidNumberText()}`);
  }
  const waitsForReset = target <= reading.number;
  if (waitsForReset && !isBetweenSessions(reading.changedAt, Date.now())) {
    return reply(message, `${text}\n${passedText(target)}`);
  }

  if (existing) {
    await deleteSubscription(existing);
    await clearButton(existing.chatId, existing.messageId);
    text += `\n${changedText(existing.targetNumber, target)}`;
  } else if (!waitsForReset) {
    text += `\n${subscribedText(target)}`;
  }
  if (waitsForReset) {
    text += `\n${waitsForResetText(reading.number, target)}`;
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
  if (!message) return api.answerCallbackQuery({ callback_query_id: query.id, text: cancelGoneText() });
  if (ownerId !== query.from.id) {
    return api.answerCallbackQuery({ callback_query_id: query.id, text: cancelNotOwnerText() });
  }

  await clearButton(message.chat.id, message.message_id);
  const sub = await findSubscription(message.chat.id, query.from.id);
  if (!sub) return api.answerCallbackQuery({ callback_query_id: query.id, text: cancelNothingText() });

  await deleteSubscription(sub);
  if (sub.messageId !== message.message_id) await clearButton(sub.chatId, sub.messageId);
  await api.answerCallbackQuery({ callback_query_id: query.id, text: cancelToastText() });
  await reply(message, cancelledText(sub.targetNumber));
}

function outcomeText(sub: Subscription, outcome: Outcome): string {
  const who = mention(sub.userId, sub.firstName);
  if (outcome === "reached") return reachedText(who, sub.targetNumber);
  if (outcome === "expired") return expiredText(who, sub.targetNumber);
  return sessionOverText(who, sub.targetNumber);
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
