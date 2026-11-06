import { tallyOptions, tallyVoter, type PollOption } from "./poll.ts";
import { taipeiMidnight, taipeiParts } from "./time.ts";
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
  /** Times this person answered only with the "not eating" option. */
  qqCount: number;
  favoriteItem: string | null;
  /** Polls joined per week of the year, index 0 being 1–7 January. */
  weekCounts: number[];
};

export type RetroGathering = { question: string; createdAt: number; people: number };

export type ChatRetro = {
  year: number;
  pollCount: number;
  ramenPollCount: number;
  totalPeople: number;
  itemTotals: Record<string, number>;
  /** Every poll that fed at least one person, oldest first. */
  gatherings: RetroGathering[];
  monthPeople: number[];
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

const WEEKS_IN_YEAR = 53;

function weekOfYear(at: number, year: number): number {
  const day = (taipeiMidnight(taipeiParts(at).dateKey) - taipeiMidnight(`${year}-01-01`)) / 86_400_000;
  return Math.floor(day / 7);
}

export function buildChatRetro(
  year: number,
  polls: RetroPoll[],
  votes: RetroVote[],
  names: Map<number, string>,
  viewerId: number
): ChatRetro {
  const inYear = polls
    .filter((poll) => taipeiParts(poll.createdAt).year === year)
    .sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(inYear.map((poll) => [poll.id, poll]));
  const retro: ChatRetro = {
    year,
    pollCount: inYear.length,
    ramenPollCount: 0,
    totalPeople: 0,
    itemTotals: {},
    gatherings: [],
    monthPeople: Array(12).fill(0),
    weekdayCounts: Array(7).fill(0),
    voters: [],
    me: null,
  };

  for (const poll of inYear) {
    const tally = tallyOptions(poll.options);
    const { month, weekday } = taipeiParts(poll.createdAt);
    retro.weekdayCounts[weekday] += 1;
    retro.monthPeople[month - 1] += tally.people;
    retro.totalPeople += tally.people;
    if (Object.keys(tally.items).length > 0) retro.ramenPollCount += 1;
    for (const [item, count] of Object.entries(tally.items)) {
      retro.itemTotals[item] = (retro.itemTotals[item] ?? 0) + count;
    }
    if (tally.people > 0) {
      retro.gatherings.push({ question: poll.question, createdAt: poll.createdAt, people: tally.people });
    }
  }

  type Tracked = Omit<RetroVoter, "userId" | "name" | "favoriteItem"> & { items: Record<string, number> };
  const voters = new Map<number, Tracked>();
  for (const vote of votes) {
    const poll = byId.get(vote.pollId);
    if (!poll || vote.optionIds.length === 0) continue;
    const voter: Tracked = voters.get(vote.userId) ?? {
      pollsJoined: 0,
      people: 0,
      qqCount: 0,
      weekCounts: Array(WEEKS_IN_YEAR).fill(0),
      items: {},
    };
    const tally = tallyVoter(poll.options, vote.optionIds);
    if (tally.people === 0) {
      voter.qqCount += 1;
    } else {
      voter.pollsJoined += 1;
      voter.people += tally.people;
      voter.weekCounts[weekOfYear(poll.createdAt, year)] += 1;
      for (const [item, count] of Object.entries(tally.items)) {
        voter.items[item] = (voter.items[item] ?? 0) + count;
      }
    }
    voters.set(vote.userId, voter);
  }

  retro.voters = [...voters.entries()]
    .map(([userId, { items, ...voter }]) => ({
      userId,
      name: names.get(userId) ?? "神秘客",
      ...voter,
      favoriteItem: argmax(items),
    }))
    .sort((a, b) => b.pollsJoined - a.pollsJoined || b.people - a.people || a.qqCount - b.qqCount);

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
    openDays: new Set(inYear.map((day) => day.date)).size,
    medianLastNumber: lastNumbers.length ? lastNumbers[Math.floor(lastNumbers.length / 2)] : null,
    busiestDay: busiest && { date: busiest.date, lastNumber: busiest.lastNumber },
    earliestOpen: earliest && { date: earliest.date, minute: earliest.points[0][1] },
  };
}
