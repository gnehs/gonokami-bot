import JsonFileDb from "./db.js";

export interface Subscription {
  chat_id: number;
  user_id: number;
  first_name: string;
  target_number: number;
  created_at: number;
  message_id: number;
}

// Dedicated DB instance for subscriptions
const subDb = new JsonFileDb("subscriptions.json");

export const MIN_NUMBER = 1001;
export const MAX_NUMBER = 1200;

export function getAll(): Subscription[] {
  return (subDb.get("subscriptions") as Subscription[] | undefined) ?? [];
}

export function saveAll(subs: Subscription[]): void {
  subDb.set("subscriptions", subs);
}

export function findSubscription(
  chatId: number,
  userId: number
): Subscription | undefined {
  const subs = getAll();
  return subs.find((s) => s.chat_id === chatId && s.user_id === userId);
}

export type AddSubResult =
  | { ok: true; sub: Subscription }
  | { ok: false; reason: string };

export function addSubscription(
  chatId: number,
  userId: number,
  firstName: string,
  targetNumber: number,
  messageId: number
): AddSubResult {
  const subs = getAll();
  if (subs.find((s) => s.chat_id === chatId && s.user_id === userId)) {
    return { ok: false, reason: "duplicate" };
  }
  const newSub: Subscription = {
    chat_id: chatId,
    user_id: userId,
    first_name: firstName,
    target_number: targetNumber,
    created_at: Date.now(),
    message_id: messageId,
  };
  subs.push(newSub);
  saveAll(subs);
  return { ok: true, sub: newSub };
}

export function removeSubscription(
  chatId: number,
  userId: number
): Subscription | undefined {
  const subs = getAll();
  const idx = subs.findIndex(
    (s) => s.chat_id === chatId && s.user_id === userId
  );
  if (idx === -1) return undefined;
  const [removed] = subs.splice(idx, 1);
  saveAll(subs);
  return removed;
}

/**
 * Validate a target number. Return null if valid, otherwise error key.
 */
export function validateTargetNumber(
  num: number,
  currentNumber: number
): string | null {
  if (Number.isNaN(num) || !Number.isInteger(num)) return "not_int";
  if (num < MIN_NUMBER || num > MAX_NUMBER) return "out_of_range";
  if (num <= currentNumber) return "already_passed";
  return null;
}
