// Uploads the Docker-era history into the serverless database.
// Usage: pnpm import-history <number-monitor csv dir> <bot data dir> [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { detectKind } from "../src/lib/poll.ts";
import { buildDay, buildModel, groupByDay, historyBefore, scoreDay, type ModelDay, type Observation } from "../src/lib/predict.ts";
import { taipeiParts } from "../src/lib/time.ts";
import { collectSources, resolveToken, runModule } from "./tgcloud-run.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean" } } });
const [monitorDir, botDir] = positionals;
if (!monitorDir || !botDir) throw new Error("usage: import-history <monitor csv dir> <bot data dir> [--dry-run]");

function readCsvObservations(dir: string): Observation[] {
  const rows: Observation[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".csv")).sort()) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n").slice(1)) {
      const [, number, time] = line.trim().split(",");
      if (!time) continue;
      rows.push({ observedAt: Date.parse(`${time.replace(" ", "T")}+08:00`), number: Number(number) });
    }
  }
  return rows;
}

// The old monitor wrote every number since its last poll under one timestamp, so only the highest
// number at each instant is a real observation. Days without enough of them are dropped entirely.
const latestByTime = new Map<number, number>();
for (const row of readCsvObservations(monitorDir)) {
  latestByTime.set(row.observedAt, Math.max(latestByTime.get(row.observedAt) ?? 0, row.number));
}
const today = taipeiParts(Date.now()).dateKey;
const days = [...groupByDay([...latestByTime].map(([observedAt, number]) => ({ observedAt, number }))).values()]
  .flatMap((list) => buildDay(list) ?? [])
  .filter((day) => day.usableForTiming && day.date < today)
  .sort((a, b) => a.date.localeCompare(b.date));
const keptDates = new Set(days.map((day) => day.date));
const observations = [...latestByTime]
  .filter(([observedAt]) => keptDates.has(taipeiParts(observedAt).dateKey))
  .map(([observedAt, number]) => ({ observedAt, number }));

const model = buildModel(days);
const dayScores = days
  .filter((day) => day.usableForTiming)
  .slice(-60)
  .flatMap((day) => scoreDay(historyBefore(model, day.date), day) ?? []);

type LegacyPoll = {
  question: string;
  options: { text: string; voter_count: number }[];
  is_closed: boolean;
  chat_id?: number;
  chat_name?: string;
  chat_type?: string;
  message_id?: number;
  user_id?: number;
  votes?: Record<string, number[]>;
  update_time?: number;
};
const votesFile = JSON.parse(fs.readFileSync(path.join(botDir, "votes.json"), "utf8")) as {
  polls: Record<string, LegacyPoll>;
  users: Record<string, { first_name?: string; username?: string }>;
};

// Polls never stored a creation time; their last update (usually the close, minutes later) stands in.
// Only group polls are kept: a private-chat poll has a single voter and nothing to compare.
const answered = (poll: LegacyPoll) =>
  poll.options.some((option) => option.voter_count > 0) ||
  Object.values(poll.votes ?? {}).some((optionIds) => optionIds.length > 0);
const legacyPolls = Object.entries(votesFile.polls).filter(
  (entry): entry is [string, LegacyPoll & { chat_id: number; update_time: number }] =>
    typeof entry[1].chat_id === "number" && entry[1].chat_id < 0 && Boolean(entry[1].update_time) && answered(entry[1])
);

// The old bot wrote option counts only when a poll was stopped, so polls left open have
// zero counts even though every answer was logged; rebuild those counts from the answers.
function optionCounts(poll: LegacyPoll): number[] {
  const counts = poll.options.map((option) => option.voter_count);
  if (counts.some((count) => count > 0)) return counts;
  for (const optionIds of Object.values(poll.votes ?? {})) for (const id of optionIds) counts[id] += 1;
  return counts;
}
const polls = legacyPolls.map(([id, poll]) => ({
  id,
  chatId: poll.chat_id,
  messageId: poll.message_id ?? null,
  creatorId: poll.user_id ?? null,
  kind: detectKind(poll.options),
  question: poll.question,
  options: poll.options.map((option, i) => ({ text: option.text, voterCount: optionCounts(poll)[i] })),
  isClosed: poll.is_closed,
  createdAt: poll.update_time,
  updatedAt: poll.update_time,
}));
const pollVotes = legacyPolls.flatMap(([pollId, poll]) =>
  Object.entries(poll.votes ?? {})
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([userId, optionIds]) => ({ pollId, userId: Number(userId), optionIds, updatedAt: poll.update_time }))
);
const voterIds = new Set(pollVotes.map((vote) => vote.userId));
const users = Object.entries(votesFile.users)
  .filter(([id]) => voterIds.has(Number(id)))
  .map(([id, user]) => ({
  id: Number(id),
  firstName: user.first_name ?? user.username ?? id,
  username: user.username ?? null,
  updatedAt: Date.now(),
}));
const chats = [
  ...new Map(
    legacyPolls
      .sort((a, b) => a[1].update_time - b[1].update_time)
      .map(([, poll]) => [
        poll.chat_id,
        { id: poll.chat_id, title: poll.chat_name ?? String(poll.chat_id), type: poll.chat_type ?? "group", updatedAt: poll.update_time },
      ])
  ).values(),
];

const plan: [table: string, rows: object[], chunk: number][] = [
  ["chats", chats, 200],
  ["users", users, 200],
  ["polls", polls, 100],
  ["pollVotes", pollVotes, 300],
  ["observations", observations, 1000],
  ["queueDays", days.map((day: ModelDay) => ({ date: day.date, day })), 25],
];

for (const [table, rows] of plan) console.log(`${table}: ${rows.length} rows`);
const accuracy = dayScores.reduce((sum, score) => sum + score.within10, 0) / dayScores.reduce((sum, score) => sum + score.samples, 0);
console.log(`dayScores: ${dayScores.length} days, ${(accuracy * 100).toFixed(1)}% within 10 min`);
if (values["dry-run"]) process.exit(0);

const token = resolveToken();
const sources = collectSources();
for (const [table, rows, chunk] of plan) {
  for (let start = 0; start < rows.length; start += chunk) {
    await runModule(token, "endpoints/importHistory", sources, { table, rows: rows.slice(start, start + chunk) });
    process.stdout.write(`\r${table}: ${Math.min(start + chunk, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}
await runModule(token, "endpoints/importHistory", sources, { kv: "dayScores", value: dayScores });
await runModule(token, "endpoints/importHistory", sources, { kv: "rolledUntil", value: today });
console.log("done");
