import { db, api, fetch } from "sdk";
import { and, eq, gte, sql } from "sdk/db";
import { chats, kv, memberships, observations, queueDays, users } from "../schema.ts";
import { buildDay, buildModel, predictWaitMinutes, type Model, type ModelDay } from "./predict.ts";
import { parseQueueResponse, QUEUE_URL, type QueueReading } from "./queue.ts";
import { chatTitle, isMemberStatus, type Chat, type User } from "./telegram.ts";
import { taipeiMidnight, taipeiParts } from "./time.ts";

const QUEUE_CACHE_MS = 30_000;
const MEMBERSHIP_TTL_MS = 10 * 60_000;

export async function getKv<T>(key: string): Promise<T | null> {
  const row = await db.select().from(kv).where(eq(kv.key, key)).get();
  return row ? (row.value as T) : null;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: Date.now() } });
}

export async function rememberChat(chat: Chat): Promise<void> {
  const row = { id: chat.id, title: chatTitle(chat), type: chat.type, updatedAt: Date.now() };
  await db.insert(chats).values(row).onConflictDoUpdate({ target: chats.id, set: row });
}

export async function rememberUser(user: User): Promise<void> {
  const row = { id: user.id, firstName: user.first_name, username: user.username ?? null, updatedAt: Date.now() };
  await db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
}

/** Reads the shop's board (at most every 30 s) and logs each number change it reveals. */
export async function readQueue(): Promise<QueueReading | null> {
  const cached = await getKv<QueueReading & { fetchedAt: number }>("queue");
  if (cached && Date.now() - cached.fetchedAt < QUEUE_CACHE_MS) return cached;

  const res = await fetch(QUEUE_URL);
  if (!res.ok) throw new Error(`queue board answered ${res.status}`);
  const reading = parseQueueResponse(await res.json());
  if (!reading) return null;

  await db
    .insert(observations)
    .values({ observedAt: reading.changedAt, number: reading.number })
    .onConflictDoNothing({ target: observations.observedAt });
  await setKv("queue", { ...reading, fetchedAt: Date.now() });
  return reading;
}

export async function observationsBetween(from: number, to: number) {
  return db
    .select()
    .from(observations)
    .where(and(gte(observations.observedAt, from), sql`${observations.observedAt} < ${to}`))
    .orderBy(observations.observedAt)
    .all() as Promise<{ observedAt: number; number: number }[]>;
}

export async function loadModel(): Promise<Model> {
  const rows = await db.select().from(queueDays).orderBy(queueDays.date).all();
  return buildModel(rows.map((row: { day: ModelDay }) => row.day));
}

export async function todayCurve(now: number): Promise<ModelDay | null> {
  const start = taipeiMidnight(taipeiParts(now).dateKey);
  return buildDay(await observationsBetween(start, now + 1));
}

export async function predictCallTime(current: number, target: number, now = Date.now()): Promise<number> {
  const [model, today] = await Promise.all([loadModel(), todayCurve(now)]);
  return now + predictWaitMinutes(model, today, now, current, target) * 60_000;
}

/** Private chats belong to their one user; groups ask Telegram, cached for ten minutes. */
export async function canView(chatId: number, userId: number): Promise<boolean> {
  if (chatId === userId) return true;
  if (chatId > 0) return false;

  const cached = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.chatId, chatId), eq(memberships.userId, userId)))
    .get();
  if (cached && Date.now() - cached.checkedAt < MEMBERSHIP_TTL_MS) return cached.isMember;

  let isMember = false;
  try {
    isMember = isMemberStatus(await api.getChatMember({ chat_id: chatId, user_id: userId }));
  } catch (error) {
    console.warn("getChatMember failed", { chatId, userId, error: String(error) });
  }
  const row = { chatId, userId, isMember, checkedAt: Date.now() };
  await db
    .insert(memberships)
    .values(row)
    .onConflictDoUpdate({ target: [memberships.chatId, memberships.userId], set: row });
  return isMember;
}

/** Groups the user has left a trace in (a vote, a subscription, a past membership check), re-verified now. */
export async function viewableChats(user: User) {
  const candidates = await db.all<{ id: number; title: string; type: string }>(sql`
    SELECT id, title, type FROM chats WHERE id = ${user.id} OR id IN (
      SELECT p.chat_id FROM poll_votes v JOIN polls p ON p.id = v.poll_id WHERE v.user_id = ${user.id}
      UNION SELECT chat_id FROM memberships WHERE user_id = ${user.id} AND is_member = 1
      UNION SELECT chat_id FROM subscriptions WHERE user_id = ${user.id}
    )`);
  const visible = [];
  for (const chat of candidates) {
    if (await canView(chat.id, user.id)) visible.push(chat);
  }
  return visible;
}
