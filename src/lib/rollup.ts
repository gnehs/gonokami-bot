import { db } from "sdk";
import { queueDays } from "../schema.ts";
import { buildSessions, groupByDay, historyBefore, scoreDay, sessionKey, type DayScore } from "./predict.ts";
import { getKv, loadModel, observationsBetween, setKv } from "./store.ts";
import { taipeiMidnight, taipeiParts } from "./time.ts";

const KEPT_SCORES = 60;

/** Each session is folded into the model once its day is over; the importer sets "rolledUntil" for history. */
export async function rollupFinishedDays(now: number) {
  const today = taipeiParts(now).dateKey;
  const rolledUntil = await getKv<string>("rolledUntil");
  if (!rolledUntil) {
    await setKv("rolledUntil", today);
    return [];
  }
  if (rolledUntil >= today) return [];

  const observations = await observationsBetween(taipeiMidnight(rolledUntil), taipeiMidnight(today));
  const days = [...groupByDay(observations).values()].flatMap(buildSessions);
  const model = await loadModel();
  const timingDays = days.filter((day) => day.usableForTiming).sort((a, b) => a.date.localeCompare(b.date));
  // Dropping the dates being rolled first keeps a retried rollup from scoring a session twice.
  const rolledDates = new Set(timingDays.map((day) => day.date));
  const scores = ((await getKv<DayScore[]>("dayScores")) ?? []).filter((score) => !rolledDates.has(score.date));

  for (const day of timingDays) {
    const key = sessionKey(day);
    await db.insert(queueDays).values({ date: key, day }).onConflictDoUpdate({ target: queueDays.date, set: { day } });
    const score = scoreDay(historyBefore(model, day.date), day);
    if (score) scores.push(score);
  }
  await setKv("dayScores", scores.sort((a, b) => a.date.localeCompare(b.date)).slice(-KEPT_SCORES));
  await setKv("rolledUntil", today);
  return timingDays.map(sessionKey);
}
