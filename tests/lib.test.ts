import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay, buildModel, buildSessions, callingSegments, historyBefore, predictWait, scoreDay, sessionKey, splitSessions, summarizeAccuracy, type Observation } from "../src/lib/predict.ts";
import { BYE_OPTIONS, detectKind, parseOption, tallyOptions, tallyVoter } from "../src/lib/poll.ts";
import { buildChatRetro, retroYear } from "../src/lib/retro.ts";
import { parseQueueResponse, parseTargetNumber } from "../src/lib/queue.ts";
import { isBetweenSessions, subscriptionOutcome, type SubscriptionState } from "../src/lib/subscription.ts";
import { formatClock, taipeiParts } from "../src/lib/time.ts";
import { toBase64 } from "../src/lib/base64.ts";
import { nextSessionText, predictionFailedText, predictionText } from "../src/lib/voice.ts";

const at = (date: string, clock: string) => Date.parse(`${date}T${clock}:00+08:00`);

function steadyDay(date: string, minutesPerTicket: number, start = "11:00", count = 60): Observation[] {
  return Array.from({ length: count }, (_, i) => ({
    observedAt: at(date, start) + i * minutesPerTicket * 60_000,
    number: 1001 + i,
  }));
}

test("taipei time uses UTC+8 regardless of host zone", () => {
  const parts = taipeiParts(Date.parse("2026-12-31T16:30:00Z"));
  assert.equal(parts.dateKey, "2027-01-01");
  assert.equal(formatClock(Date.parse("2026-12-31T16:30:00Z")), "00:30");
});

test("prediction follows the pace of historical days", () => {
  const days = ["2026-10-01", "2026-10-08", "2026-10-15"].map((date) => buildDay(steadyDay(date, 4))!);
  const wait = predictWait(buildModel(days), at("2026-10-22", "11:40"), 1011, 1021).likely;
  assert.equal(Math.round(wait), 40);
});

test("history is lined up by clock time, so a dinner restarting at 1001 follows dinner pace", () => {
  // Lunch called a ticket every 2 minutes from 11:00, dinner one every 5 minutes from 17:00.
  const days = ["2026-10-01", "2026-10-08", "2026-10-15"].flatMap((date) =>
    buildSessions([...steadyDay(date, 2, "11:00", 50), { observedAt: at(date, "16:30"), number: 1000 }, ...steadyDay(date, 5, "17:00", 40)])
  );
  const model = buildModel(days);
  assert.equal(Math.round(predictWait(model, at("2026-10-22", "11:20"), 1011, 1021).likely), 20);
  assert.equal(Math.round(predictWait(model, at("2026-10-22", "17:50"), 1011, 1021).likely), 50);
});

test("the range leans late when some past days ran slow", () => {
  const days = ["2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"].map((date) => buildDay(steadyDay(date, 2))!);
  days.push(buildDay(steadyDay("2026-10-22", 6))!);
  const wait = predictWait(buildModel(days), at("2026-10-29", "11:20"), 1011, 1021);
  assert.deepEqual([wait.earliest, wait.likely, wait.latest].map(Math.round), [20, 20, 58]);
});

test("before the first call, the wait runs to when that place in the session is usually reached", () => {
  const days = ["2026-10-01", "2026-10-08", "2026-10-15"].map((date) => buildDay(steadyDay(date, 4, "11:30"))!);
  // 1011 is the eleventh call, 40 minutes after the 11:30 opening.
  assert.equal(Math.round(predictWait(buildModel(days), at("2026-10-22", "10:50"), 1000, 1011).likely), 80);
});

test("calling segments leave out the reset reading, a stale opening number and the afternoon break", () => {
  const day = buildDay([
    { observedAt: at("2026-10-31", "10:00"), number: 1032 },
    ...Array.from({ length: 20 }, (_, i) => ({ observedAt: at("2026-10-31", "12:15") + i * 4 * 60_000, number: 1033 + i })),
    ...Array.from({ length: 20 }, (_, i) => ({ observedAt: at("2026-10-31", "16:05") + i * 4 * 60_000, number: 1053 + i })),
  ])!;
  const segments = callingSegments(day);
  assert.deepEqual(segments.map((segment) => [segment.points[0][0], segment.isDinner]), [[1033, false], [1053, true]]);
});

// Shaped like 2026-11-06: reset at 10:37, lunch to 1060, reset at 16:33, dinner to 1062, reset at closing.
function twoSessionDay(date: string): Observation[] {
  const run = (start: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({ observedAt: at(date, start) + (i + 1) * 5 * 60_000, number: 1001 + i * 2 }));
  return [
    { observedAt: at(date, "10:37"), number: 1000 },
    ...run("11:00", 30),
    { observedAt: at(date, "16:33"), number: 1000 },
    ...run("17:00", 31),
    { observedAt: at(date, "21:31"), number: 1000 },
  ];
}

test("a board reset starts a new session", () => {
  const sessions = splitSessions(twoSessionDay("2026-11-06"));
  assert.deepEqual(sessions.map((session) => session.length), [31, 32, 1]);
  const [lunch, dinner] = buildSessions(twoSessionDay("2026-11-06"));
  assert.deepEqual([lunch.lastNumber, dinner.lastNumber], [1059, 1061]);
  assert.ok(lunch.usableForTiming && dinner.usableForTiming);
  assert.deepEqual([sessionKey(lunch), sessionKey(dinner)], ["2026-11-06 10:37", "2026-11-06 16:33"]);
});

test("a small step back is a correction, not a reset", () => {
  const observations = [1001, 1005, 1003, 1006].map((number, i) => ({ observedAt: at("2026-11-06", "12:00") + i * 60_000, number }));
  assert.equal(splitSessions(observations).length, 1);
});

/** Replays the minute ticks over a day and reports what first happened to the subscription, and when. */
function replay(observations: Observation[], sub: SubscriptionState) {
  for (const tick of observations.filter((o) => o.observedAt > sub.createdAt)) {
    const seen = observations.filter((o) => o.observedAt <= tick.observedAt);
    const outcome = subscriptionOutcome(sub, splitSessions(seen), tick.number, tick.observedAt);
    if (outcome) return `${outcome} ${formatClock(tick.observedAt)}`;
  }
  return null;
}

test("a subscription from a finished session is cancelled at the reset, not fired by the next session", () => {
  const day = twoSessionDay("2026-11-06");
  // Lunch ends at 1059, so 1070 is never called; dinner reaching 1001 again must not count for it.
  const lunch = { targetNumber: 1070, createdAt: at("2026-11-06", "12:00"), waitsForReset: false };
  assert.equal(replay(day, lunch), "sessionOver 16:33");
  const early = { targetNumber: 1030, createdAt: at("2026-11-06", "10:20"), waitsForReset: false };
  assert.equal(replay(day, early), "reached 12:20");
});

test("a passed number taken in the break waits for the next session", () => {
  const day = twoSessionDay("2026-11-06");
  assert.equal(isBetweenSessions(at("2026-11-06", "13:30"), at("2026-11-06", "14:00")), true);
  assert.equal(isBetweenSessions(at("2026-11-06", "13:30"), at("2026-11-06", "13:45")), false);
  // Taken at 13:30 with the board on 1059; dinner reaches 1049 at 19:05, over five hours after it was taken.
  const dinner = { targetNumber: 1049, createdAt: at("2026-11-06", "13:30"), waitsForReset: true };
  assert.equal(replay(day, dinner), "reached 19:05");
  const passedAgain = { targetNumber: 1070, createdAt: at("2026-11-06", "13:30"), waitsForReset: true };
  assert.equal(replay(day, passedAgain), "sessionOver 21:31");
});

test("a day logged in one burst is not trusted for timing", () => {
  const burst = buildDay(
    Array.from({ length: 30 }, (_, i) => ({ observedAt: at("2026-11-02", "10:00"), number: 1001 + i }))
  )!;
  assert.equal(burst.usableForTiming, false);
});

test("day-by-day scoring reports small error on perfectly regular history", () => {
  const days = ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"].map((date) => buildDay(steadyDay(date, 3))!);
  const model = buildModel(days);
  const scores = days.flatMap((day) => scoreDay(historyBefore(model, day.date), day) ?? []);
  const accuracy = summarizeAccuracy(scores)!;
  assert.equal(accuracy.dayCount, 3);
  assert.ok(accuracy.sampleCount > 0);
  assert.ok(accuracy.medianAbsErrorMinutes < 1);
  assert.equal(accuracy.within10MinutesRate, 1);
});

test("ramen poll counts people per item and ignores the bye option", () => {
  const options = [
    { text: "+1 | 🍜 單點", voterCount: 2 },
    { text: "+2 | 🍜 單點", voterCount: 1 },
    { text: "+1 | 🥚 加蛋", voterCount: 1 },
    { text: "蓋被被 😴", voterCount: 5 },
  ];
  assert.deepEqual(tallyOptions(options), { people: 5, items: { "🍜 單點": 4, "🥚 加蛋": 1 } });
  assert.deepEqual(tallyVoter(options, [1, 2]), { people: 3, items: { "🍜 單點": 2, "🥚 加蛋": 1 } });
  assert.equal(detectKind(options), "ramen");
  assert.equal(detectKind([{ text: "+1" }, { text: "+4" }]), "vote");
});

test("retrospective opens in December and January only", () => {
  assert.equal(retroYear(at("2026-12-01", "00:00")), 2026);
  assert.equal(retroYear(at("2027-01-31", "23:59")), 2026);
  assert.equal(retroYear(at("2026-11-30", "23:59")), null);
});

test("retrospective ranks voters and finds the viewer", () => {
  const options = [
    { text: "+1 | 🍜 單點", voterCount: 1 },
    { text: "+1 | 🥚 加蛋", voterCount: 1 },
    { text: "蓋被被 😴", voterCount: 1 },
  ];
  const polls = [
    { id: "a", question: "A", options, createdAt: at("2026-03-01", "12:00") },
    { id: "b", question: "B", options, createdAt: at("2026-04-01", "12:00") },
    { id: "old", question: "old", options, createdAt: at("2025-04-01", "12:00") },
  ];
  const votes = [
    { pollId: "a", userId: 1, optionIds: [1] },
    { pollId: "b", userId: 1, optionIds: [1] },
    { pollId: "a", userId: 2, optionIds: [0] },
    { pollId: "b", userId: 3, optionIds: [2] },
    { pollId: "old", userId: 3, optionIds: [0] },
  ];
  const retro = buildChatRetro(2026, polls, votes, new Map([[1, "熊熊"]]), 2);
  assert.equal(retro.pollCount, 2);
  assert.deepEqual(retro.voters.map((voter) => voter.userId), [1, 2, 3]);
  assert.equal(retro.voters[0].name, "熊熊");
  assert.equal(retro.voters[0].favoriteItem, "🥚 加蛋");
  assert.equal(retro.me?.rank, 2);
  assert.equal(retro.voters[2].qqCount, 1);
  assert.equal(retro.voters[2].pollsJoined, 0);
  assert.equal(retro.voters[0].weekCounts[8], 1, "1 March 2026 falls in week index 8");
  assert.deepEqual(retro.monthPeople.slice(2, 4), [2, 2]);
  assert.equal(retro.gatherings.length, 2);
});

test("queue response picks the newest record and its change time", () => {
  const reading = parseQueueResponse([
    { UpdDate: 1, detail_json: JSON.stringify({ selections: { 目前號碼: 1053 } }) },
    { UpdDate: 5, detail_json: JSON.stringify({ UpdDate: 4, selections: { 目前號碼: 1015 } }) },
  ]);
  assert.deepEqual(reading, { number: 1015, changedAt: 4 });
  assert.equal(parseTargetNumber("1050"), 1050);
  assert.equal(parseTargetNumber("999"), null);
  assert.equal(parseTargetNumber("1300"), null);
});

test("every bye option counts as nobody", () => {
  for (const text of BYE_OPTIONS) assert.deepEqual(parseOption(text), { people: 0, item: null }, text);
  assert.ok(BYE_OPTIONS.every((text) => text.length <= 100), "Telegram caps poll options at 100 characters");
});

test("base64 matches Node's encoder for every padding length", () => {
  for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "拉麵"]) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(toBase64(bytes), Buffer.from(bytes).toString("base64"), text);
  }
});

test("every mix of prediction clauses reads as one sentence with the times in it", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const times = { likely: "12:12", earliest: "12:05", latest: "12:30" };
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i += 1) {
    const soon = i % 2 === 0;
    const hasRange = i % 3 !== 0;
    const text = predictionText(times, { soon, hasRange }, random);
    seen.add(text);
    assert.ok(text.includes("<b>12:12</b>"), text);
    assert.equal(text.includes("12:05") && text.includes("12:30"), hasRange, text);
    assert.doesNotMatch(text, /[，。！][，。！]|undefined/, text);
  }
  assert.ok(seen.size > 200, `only ${seen.size} distinct lines`);
  assert.equal(
    predictionText(times, { soon: false, hasRange: true }, () => 0),
    "🐻 偶用熊鼻子聞了一下，大概 <b>12:12</b> 會叫到你，最早 12:05、最晚 12:30，醬子。"
  );
  assert.ok(nextSessionText(() => 0.99) && predictionFailedText(() => 0.99));
});
