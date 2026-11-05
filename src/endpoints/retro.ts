import { db, EndpointError } from "sdk";
import { eq, inArray } from "sdk/db";
import { polls, pollVotes, queueDays, users } from "../schema.ts";
import type { RetroResult } from "../lib/api-types.ts";
import { requireViewer, type EndpointContext } from "../lib/guard.ts";
import type { ModelDay } from "../lib/predict.ts";
import { buildChatRetro, buildQueueRetro, retroYear, type RetroPoll, type RetroVote } from "../lib/retro.ts";

export default async function (input: { chatId?: number }, ctx: EndpointContext): Promise<RetroResult> {
  const year = retroYear(Date.now());
  if (year === null) throw new EndpointError("回顧只在十二月和一月開放", { code: "RETRO_CLOSED" });
  const { user, chatId } = await requireViewer(ctx, input.chatId);

  const chatPolls: RetroPoll[] = await db.select().from(polls).where(eq(polls.chatId, chatId)).all();
  const votes: RetroVote[] = chatPolls.length
    ? await db.select().from(pollVotes).where(inArray(pollVotes.pollId, chatPolls.map((poll) => poll.id))).all()
    : [];
  const voterIds = [...new Set(votes.map((vote) => vote.userId))];
  const names = new Map<number, string>(
    voterIds.length
      ? (await db.select().from(users).where(inArray(users.id, voterIds)).all()).map(
          (row: { id: number; firstName: string }) => [row.id, row.firstName]
        )
      : []
  );
  const days: ModelDay[] = (await db.select().from(queueDays).all()).map((row: { day: ModelDay }) => row.day);

  return {
    chat: buildChatRetro(year, chatPolls, votes, names, user.id),
    queue: buildQueueRetro(year, days),
  };
}
