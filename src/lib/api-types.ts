// Shapes the Mini App endpoints return; the web app imports these as types only.
import type { Accuracy, CallTime, Point } from "./predict.ts";
import type { PollKind, Tally } from "./poll.ts";
import type { QueueReading } from "./queue.ts";
import type { ChatRetro, QueueRetro } from "./retro.ts";

export type ChatSummary = { id: number; title: string; type: string };

export type MeResult = {
  user: { id: number; name: string };
  chats: ChatSummary[];
  startChatId: number | null;
  retroYear: number | null;
};

export type PollVoter = { userId: number; name: string; choices: string[]; people: number };

export type PollSummary = {
  id: string;
  question: string;
  kind: PollKind;
  isClosed: boolean;
  createdAt: number;
  tally: Tally;
  voters: PollVoter[];
};

export type PollsResult = { polls: PollSummary[]; nextBefore: number | null };

export type QueueResult = {
  reading: QueueReading | null;
  today: Point[];
  prediction: ({ target: number } & CallTime) | null;
  accuracy: Accuracy | null;
  subscriptions: { chatTitle: string; targetNumber: number; waitsForReset: boolean; predicted: CallTime | null }[];
};

export type RetroResult = { chat: ChatRetro; queue: QueueRetro };

/** A voter's Telegram profile photo as a data URL, or null when there is none to show. */
export type Avatar = { userId: number; photo: string | null };

export type { Accuracy, CallTime, ChatRetro, Point, QueueReading, QueueRetro, Tally };
