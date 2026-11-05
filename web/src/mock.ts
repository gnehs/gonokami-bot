import type { ChatRetro, ChatSummary, MeResult, PollSummary, PollsResult, QueueResult, RetroResult } from "../../src/lib/api-types.ts";
import { ApiError, type Endpoints } from "./api.ts";

const USER_ID = 1001;
const CHATS: ChatSummary[] = [
  { id: USER_ID, title: "gnehs", type: "private" },
  { id: -1001234500001, title: "五之神午餐團 🍜", type: "supergroup" },
  { id: -1001234500002, title: "辦公室吃貨聯盟", type: "supergroup" },
];
const NAMES = ["小明", "阿凱", "Yuki", "芷晴", "大雄", "Peggy", "老王"];
const ITEMS = ["🍜 單點", "🥚 加蛋", "✨ 超值"];
const DAY = 86_400_000;

let seed = 7;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

type Choice = { text: string; people: number; item: string | null };
const RAMEN: Choice[] = ITEMS.flatMap((item) => [1, 2].map((people) => ({ text: `+${people} | ${item}`, people, item })));
const PLUS: Choice[] = [1, 2, 4].map((people) => ({ text: `+${people}`, people, item: null }));

function makePolls(chatId: number): PollSummary[] {
  const now = Date.now();
  return Array.from({ length: 31 }, (_, n): PollSummary => {
    const ramen = n % 4 !== 3;
    const pool = ramen ? RAMEN : PLUS;
    const voters = NAMES.filter(() => rand() > 0.35).map((name, v) => {
      const picks = [pool[Math.floor(rand() * pool.length)]];
      return { userId: USER_ID + v, name, choices: picks.map((c) => c.text), people: picks.reduce((s, c) => s + c.people, 0), picks };
    });
    const items = Object.fromEntries(ITEMS.map((item) => [item, 0]));
    for (const voter of voters) for (const pick of voter.picks) if (pick.item) items[pick.item] += pick.people;
    return {
      id: `${chatId}-${n}`,
      question: ramen ? ["今天吃五之神嗎？", "中午拉麵 +1", "週五拉麵團集合", "下班後吃宵夜麵"][n % 3] : "晚上聚餐，+1 報名",
      kind: ramen ? "ramen" : "vote",
      isClosed: n > 0,
      createdAt: now - n * 2.3 * DAY - Math.floor(rand() * 4 * 3_600_000),
      tally: { people: voters.reduce((s, v) => s + v.people, 0), items: ramen ? items : {} },
      voters: voters.map(({ picks: _picks, ...voter }) => voter).sort((a, b) => b.people - a.people),
    };
  });
}

const pollsByChat = new Map<number, PollSummary[]>();
const pollsFor = (chatId: number) => {
  if (!pollsByChat.has(chatId)) pollsByChat.set(chatId, makePolls(chatId));
  return pollsByChat.get(chatId)!;
};

function assertViewable(chatId: number) {
  if (!CHATS.some((c) => c.id === chatId) || new URLSearchParams(location.search).has("notMember")) {
    throw new ApiError("你不在這個群組裡", "NOT_MEMBER");
  }
}

function retroFor(chatId: number): ChatRetro {
  const polls = pollsFor(chatId);
  const monthCounts = Array<number>(12).fill(0);
  const weekdayCounts = Array<number>(7).fill(0);
  const itemTotals = Object.fromEntries(ITEMS.map((item) => [item, 0]));
  const voters = new Map<number, ChatRetro["voters"][number]>();
  for (const poll of polls) {
    const date = new Date(poll.createdAt);
    monthCounts[date.getMonth()]++;
    weekdayCounts[date.getDay()]++;
    for (const [item, n] of Object.entries(poll.tally.items)) itemTotals[item] += n;
    for (const v of poll.voters) {
      const row = voters.get(v.userId) ?? { userId: v.userId, name: v.name, pollsJoined: 0, people: 0, favoriteItem: "🍜 單點" };
      row.pollsJoined++;
      row.people += v.people;
      voters.set(v.userId, row);
    }
  }
  const ranked = [...voters.values()].sort((a, b) => b.people - a.people);
  const biggest = [...polls].sort((a, b) => b.tally.people - a.tally.people)[0];
  const meIndex = ranked.findIndex((v) => v.userId === USER_ID);
  return {
    year: 2026,
    pollCount: polls.length,
    ramenPollCount: polls.filter((p) => p.kind === "ramen").length,
    totalPeople: polls.reduce((s, p) => s + p.tally.people, 0),
    itemTotals,
    biggestPoll: { question: biggest.question, people: biggest.tally.people, createdAt: biggest.createdAt },
    monthCounts,
    weekdayCounts,
    voters: ranked,
    me: meIndex >= 0 ? { ...ranked[meIndex], rank: meIndex + 1, favoriteItem: "🥚 加蛋" } : null,
  };
}

function queueFor(target: string | undefined): QueueResult {
  const now = Date.now();
  const points: [number, number][] = [];
  let number = 1001;
  for (let minute = 630; minute <= 860; minute += 6) {
    points.push([number, minute]);
    number += 1 + Math.floor(rand() * 3);
  }
  const current = points[points.length - 1][0];
  const eta = (n: number) => now + Math.max(0, n - current) * 3.4 * 60_000;
  const t = target && /^\d{4}$/.test(target) && +target >= 1001 && +target <= 1200 ? +target : null;
  return {
    reading: { number: current, changedAt: now - 4 * 60_000 },
    today: points,
    prediction: t ? { target: t, at: eta(t) } : null,
    accuracy: { sampleCount: 1280, dayCount: 43, medianAbsErrorMinutes: 6.4, within10MinutesRate: 0.82 },
    subscriptions: [
      { chatTitle: CHATS[1].title, targetNumber: current + 12, predictedAt: eta(current + 12) },
      { chatTitle: "私訊", targetNumber: current + 40, predictedAt: eta(current + 40) },
    ],
  };
}

const delay = <T>(value: () => T, ms = 350) =>
  new Promise<T>((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, ms)
  );

export function mockCall<N extends keyof Endpoints>(name: N, input: Endpoints[N]["input"]): Promise<unknown> {
  switch (name) {
    case "me":
      return delay<MeResult>(() => ({ user: { id: USER_ID, name: "榮勾斯揪" }, chats: CHATS, startChatId: CHATS[1].id, retroYear: 2026 }));
    case "polls": {
      const { chatId, before } = input as Endpoints["polls"]["input"];
      return delay<PollsResult>(() => {
        assertViewable(chatId);
        const rows = pollsFor(chatId).filter((p) => before === undefined || p.createdAt < before).slice(0, 20);
        return { polls: rows, nextBefore: rows.length === 20 ? rows[19].createdAt : null };
      });
    }
    case "queue":
      return delay<QueueResult>(() => queueFor((input as Endpoints["queue"]["input"]).target));
    case "retro": {
      const { chatId } = input as Endpoints["retro"]["input"];
      return delay<RetroResult>(() => {
        assertViewable(chatId);
        return {
          chat: retroFor(chatId),
          queue: {
            year: 2026,
            openDays: 214,
            medianLastNumber: 1126,
            busiestDay: { date: "2026-08-15", lastNumber: 1198 },
            earliestOpen: { date: "2026-03-07", minute: 10 * 60 + 25 },
          },
        };
      });
    }
  }
}
