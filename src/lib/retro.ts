import { tallyOptions, tallyVoter, type PollOption } from "./poll.ts";
import { taipeiParts } from "./time.ts";
import type { ModelDay } from "./predict.ts";

export type RetroPoll = {
  id: string;
  question: string;
  options: PollOption[];
  createdAt: number;
};

export type RetroVote = { pollId: string; userId: number; optionIds: number[] };

export type RetroVoter = {
  userId: number;
  name: string;
  pollsJoined: number;
  people: number;
  favoriteItem: string | null;
};

export type ChatRetro = {
  year: number;
  pollCount: number;
  ramenPollCount: number;
  totalPeople: number;
  itemTotals: Record<string, number>;
  biggestPoll: { question: string; people: number; createdAt: number } | null;
  monthCounts: number[];
  weekdayCounts: number[];
  voters: RetroVoter[];
  me: (RetroVoter & { rank: number }) | null;
};

export type QueueRetro = {
  year: number;
  openDays: number;
  medianLastNumber: number | null;
  busiestDay: { date: string; lastNumber: number } | null;
  earliestOpen: { date: string; minute: number } | null;
};

/** December and January show the retrospective of the calendar year that just ended or is ending. */
export function retroYear(now: number): number | null {
  const { year, month } = taipeiParts(now);
  if (month === 12) return year;
  if (month === 1) return year - 1;
  return null;
}

function argmax(record: Record<string, number>): string | null {
  let best: string | null = null;
  for (const [key, value] of Object.entries(record)) {
    if (value > 0 && (best === null || value > record[best])) best = key;
  }
  return best;
}

export function buildChatRetro(
  year: number,
  polls: RetroPoll[],
  votes: RetroVote[],
  names: Map<number, string>,
  viewerId: number
): ChatRetro {
  const inYear = polls.filter((poll) => taipeiParts(poll.createdAt).year === year);
  const byId = new Map(inYear.map((poll) => [poll.id, poll]));
  const retro: ChatRetro = {
    year,
    pollCount: inYear.length,
    ramenPollCount: 0,
    totalPeople: 0,
    itemTotals: {},
    biggestPoll: null,
    monthCounts: Array(12).fill(0),
    weekdayCounts: Array(7).fill(0),
    voters: [],
    me: null,
  };

  for (const poll of inYear) {
    const tally = tallyOptions(poll.options);
    const { month, weekday } = taipeiParts(poll.createdAt);
    retro.monthCounts[month - 1] += 1;
    retro.weekdayCounts[weekday] += 1;
    retro.totalPeople += tally.people;
    if (Object.keys(tally.items).length > 0) retro.ramenPollCount += 1;
    for (const [item, count] of Object.entries(tally.items)) {
      retro.itemTotals[item] = (retro.itemTotals[item] ?? 0) + count;
    }
    if (!retro.biggestPoll || tally.people > retro.biggestPoll.people) {
      retro.biggestPoll = { question: poll.question, people: tally.people, createdAt: poll.createdAt };
    }
  }

  const voters = new Map<number, { pollsJoined: number; people: number; items: Record<string, number> }>();
  for (const vote of votes) {
    const poll = byId.get(vote.pollId);
    if (!poll) continue;
    const tally = tallyVoter(poll.options, vote.optionIds);
    if (tally.people === 0) continue;
    const voter = voters.get(vote.userId) ?? { pollsJoined: 0, people: 0, items: {} };
    voter.pollsJoined += 1;
    voter.people += tally.people;
    for (const [item, count] of Object.entries(tally.items)) {
      voter.items[item] = (voter.items[item] ?? 0) + count;
    }
    voters.set(vote.userId, voter);
  }

  retro.voters = [...voters.entries()]
    .map(([userId, voter]) => ({
      userId,
      name: names.get(userId) ?? "神秘客",
      pollsJoined: voter.pollsJoined,
      people: voter.people,
      favoriteItem: argmax(voter.items),
    }))
    .sort((a, b) => b.pollsJoined - a.pollsJoined || b.people - a.people);

  const rank = retro.voters.findIndex((voter) => voter.userId === viewerId);
  retro.me = rank === -1 ? null : { ...retro.voters[rank], rank: rank + 1 };
  return retro;
}

export function buildQueueRetro(year: number, days: ModelDay[]): QueueRetro {
  const inYear = days.filter((day) => day.date.startsWith(`${year}-`));
  const lastNumbers = inYear.map((day) => day.lastNumber).sort((a, b) => a - b);
  const timed = inYear.filter((day) => day.usableForTiming);
  const busiest = inYear.reduce<ModelDay | null>(
    (best, day) => (!best || day.lastNumber > best.lastNumber ? day : best),
    null
  );
  const earliest = timed.reduce<ModelDay | null>(
    (best, day) => (!best || day.points[0][1] < best.points[0][1] ? day : best),
    null
  );
  return {
    year,
    openDays: inYear.length,
    medianLastNumber: lastNumbers.length ? lastNumbers[Math.floor(lastNumbers.length / 2)] : null,
    busiestDay: busiest && { date: busiest.date, lastNumber: busiest.lastNumber },
    earliestOpen: earliest && { date: earliest.date, minute: earliest.points[0][1] },
  };
}
