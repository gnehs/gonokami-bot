import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay, buildModel, historyBefore, predictWaitMinutes, scoreDay, summarizeAccuracy, type Observation } from "../src/lib/predict.ts";
import { BYE_OPTIONS, detectKind, parseOption, tallyOptions, tallyVoter } from "../src/lib/poll.ts";
import { buildChatRetro, retroYear } from "../src/lib/retro.ts";
import { parseQueueResponse, parseTargetNumber } from "../src/lib/queue.ts";
import { formatClock, taipeiParts } from "../src/lib/time.ts";

const at = (date: string, clock: string) => Date.parse(`${date}T${clock}:00+08:00`);

function steadyDay(date: string, minutesPerTicket: number): Observation[] {
  return Array.from({ length: 60 }, (_, i) => ({
    observedAt: at(date, "11:00") + i * minutesPerTicket * 60_000,
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
  const model = buildModel(days);
  const wait = predictWaitMinutes(model, null, at("2026-10-22", "11:40"), 1011, 1021);
  assert.equal(Math.round(wait), 40);
});

test("today's own curve wins once it covers the numbers", () => {
  const model = buildModel(["2026-10-01", "2026-10-08"].map((date) => buildDay(steadyDay(date, 4))!));
  const today = buildDay(steadyDay("2026-10-22", 3))!;
  assert.equal(Math.round(predictWaitMinutes(model, today, at("2026-10-22", "11:30"), 1011, 1021)), 30);
});

test("a day logged in one burst is not trusted for timing", () => {
  const burst = buildDay(
    Array.from({ length: 30 }, (_, i) => ({ observedAt: at("2026-11-02", "10:00"), number: 1001 + i }))
  )!;
  assert.equal(burst.usableForTiming, false);
});

test("day-by-day scoring reports small error on perfectly regular history", () => {
  const model = buildModel(
    ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"].map((date) => buildDay(steadyDay(date, 3))!)
  );
  const scores = model.days.flatMap((day) => scoreDay(historyBefore(model, day.date), day) ?? []);
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
