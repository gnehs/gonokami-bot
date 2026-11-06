import type { Observation } from "./predict.ts";

export const SUBSCRIPTION_TTL_MS = 5 * 60 * 60 * 1000;
// Mid-session lulls last under half an hour; a board left alone longer has finished its session.
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export type SubscriptionState = {
  targetNumber: number;
  createdAt: number;
  /** Taken for a number the board had already passed, so it counts only in the session after the next reset. */
  waitsForReset: boolean;
};

export type Outcome = "reached" | "expired" | "sessionOver";

/** Between sessions the board keeps the last session's final number; a number at or below it may belong to the next one. */
export function isBetweenSessions(changedAt: number, now: number): boolean {
  return now - changedAt >= SESSION_IDLE_MS;
}

/** Still showing the number the board passed before the reset it waits for, so no call time can be predicted yet. */
export function awaitsReset(sub: SubscriptionState, current: number): boolean {
  return sub.waitsForReset && current >= sub.targetNumber;
}

/** `sessions` is today's observations split at resets, oldest first; `current` is the board's number now. */
export function subscriptionOutcome(
  sub: SubscriptionState,
  sessions: Observation[][],
  current: number,
  now: number
): Outcome | null {
  const startedSince = sessions.filter((session) => session[0].observedAt > sub.createdAt);
  // A number taken in the break between sessions waits from the reset, not from when it was taken, so it is
  // not dropped mid-dinner. The reset must come within the TTL: overnight, the board still shows last night's
  // final number, and the next morning's reset must not revive a stale subscription.
  const resetAt = startedSince[0]?.[0].observedAt;
  const waitingSince = resetAt !== undefined && resetAt - sub.createdAt <= SUBSCRIPTION_TTL_MS ? resetAt : sub.createdAt;
  if (now - waitingSince > SUBSCRIPTION_TTL_MS) return "expired";

  if (sub.waitsForReset) {
    if (startedSince.length === 0) return null;
    if (startedSince.length > 1) return "sessionOver";
  } else {
    // The board moving after the subscription, and then resetting, means it was taken during a session now over;
    // after a reset the new session counts up through the same numbers, so the old target would fire falsely.
    const previous = sessions[sessions.length - 2];
    if (previous && sub.createdAt < previous[previous.length - 1].observedAt) return "sessionOver";
  }
  return current >= sub.targetNumber ? "reached" : null;
}
