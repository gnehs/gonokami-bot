import { db } from "sdk";
import { eq } from "sdk/db";
import { chats, subscriptions } from "../schema.ts";
import type { QueueResult } from "../lib/api-types.ts";
import { requireUser, type EndpointContext } from "../lib/guard.ts";
import { predictWaitMinutes, summarizeAccuracy, type DayScore } from "../lib/predict.ts";
import { parseTargetNumber } from "../lib/queue.ts";
import { awaitsReset, type SubscriptionState } from "../lib/subscription.ts";
import { currentSession, getKv, loadModel, readQueue } from "../lib/store.ts";

export default async function (input: { target?: string }, ctx: EndpointContext): Promise<QueueResult> {
  const user = requireUser(ctx);
  const now = Date.now();
  const [reading, model, today, scores] = await Promise.all([
    readQueue(),
    loadModel(),
    currentSession(now),
    getKv<DayScore[]>("dayScores"),
  ]);
  const predictAt = (target: number) =>
    reading ? now + predictWaitMinutes(model, now, reading.number, target) * 60_000 : null;

  const subs: (SubscriptionState & { chatId: number })[] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .all();
  const titles = new Map<number, string>();
  for (const sub of subs) {
    const chat = await db.select().from(chats).where(eq(chats.id, sub.chatId)).get();
    titles.set(sub.chatId, chat?.title ?? "私訊");
  }

  const target = parseTargetNumber(input.target);
  // A number the board has passed has no call time until a reset starts the next session.
  const predictedAt = target !== null && reading && target > reading.number ? predictAt(target) : null;
  return {
    reading,
    today: today?.points ?? [],
    prediction: target !== null && predictedAt !== null ? { target, at: predictedAt } : null,
    accuracy: summarizeAccuracy(scores ?? []),
    subscriptions: subs.map((sub) => {
      const waitsForReset = reading !== null && awaitsReset(sub, reading.number);
      return {
        chatTitle: titles.get(sub.chatId) ?? "私訊",
        targetNumber: sub.targetNumber,
        waitsForReset,
        predictedAt: waitsForReset ? null : predictAt(sub.targetNumber),
      };
    }),
  };
}
