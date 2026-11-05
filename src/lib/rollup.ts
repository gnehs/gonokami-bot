import { db } from "sdk";
import { queueDays } from "../schema.ts";
import { buildDay, groupByDay, historyBefore, scoreDay, type DayScore } from "./predict.ts";
import { getKv, loadModel, observationsBetween, setKv } from "./store.ts";
import { taipeiMidnight, taipeiParts } from "./time.ts";

const KEPT_SCORES = 60;

/** Days are folded into the model once they are over; the importer sets "rolledUntil" for history. */
export async function rollupFinishedDays(now: number) {
  const today = taipeiParts(now).dateKey;
  const rolledUntil = await getKv<string>("rolledUntil");
  if (!rolledUntil) {
    await setKv("rolledUntil", today);
    return [];
  }
  if (rolledUntil >= today) return [];

  const observations = await observationsBetween(taipeiMidnight(rolledUntil), taipeiMidnight(today));
  const days = [...groupByDay(observations).values()].flatMap((list) => buildDay(list) ?? []);
  const model = await loadModel();
  const scores = (await getKv<DayScore[]>("dayScores")) ?? [];

  const timingDays = days.filter((day) => day.usableForTiming).sort((a, b) => a.date.localeCompare(b.date));
  for (const day of timingDays) {
    await db.insert(queueDays).values({ date: day.date, day }).onConflictDoUpdate({ target: queueDays.date, set: { day } });
    const score = scoreDay(historyBefore(model, day.date), day);
    if (score) scores.push(score);
  }
  await setKv("dayScores", scores.slice(-KEPT_SCORES));
  await setKv("rolledUntil", today);
  return timingDays.map((day) => day.date);
}
