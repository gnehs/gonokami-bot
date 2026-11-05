import { db } from "sdk";
import { and, desc, eq, inArray, lt } from "sdk/db";
import { polls, pollVotes, users } from "../schema.ts";
import type { PollsResult } from "../lib/api-types.ts";
import { requireViewer, type EndpointContext } from "../lib/guard.ts";
import { tallyOptions, tallyVoter, type PollKind, type PollOption } from "../lib/poll.ts";

const PAGE_SIZE = 20;

type PollRow = { id: string; question: string; kind: PollKind; isClosed: boolean; createdAt: number; options: PollOption[] };

export default async function (input: { chatId?: number; before?: number }, ctx: EndpointContext): Promise<PollsResult> {
  const { chatId } = await requireViewer(ctx, input.chatId);
  const conditions = [eq(polls.chatId, chatId)];
  if (typeof input.before === "number") conditions.push(lt(polls.createdAt, input.before));
  const rows: PollRow[] = await db
    .select()
    .from(polls)
    .where(and(...conditions))
    .orderBy(desc(polls.createdAt))
    .limit(PAGE_SIZE)
    .all();
  if (rows.length === 0) return { polls: [], nextBefore: null };

  const votes: { pollId: string; userId: number; optionIds: number[] }[] = await db
    .select()
    .from(pollVotes)
    .where(inArray(pollVotes.pollId, rows.map((row) => row.id)))
    .all();
  const voterIds = [...new Set(votes.map((vote) => vote.userId))];
  const names = new Map<number, string>(
    voterIds.length
      ? (await db.select().from(users).where(inArray(users.id, voterIds)).all()).map(
          (user: { id: number; firstName: string }) => [user.id, user.firstName]
        )
      : []
  );

  return {
    polls: rows.map((row) => ({
      id: row.id,
      question: row.question,
      kind: row.kind,
      isClosed: row.isClosed,
      createdAt: row.createdAt,
      tally: tallyOptions(row.options),
      voters: votes
        .filter((vote) => vote.pollId === row.id)
        .map((vote) => ({
          userId: vote.userId,
          name: names.get(vote.userId) ?? "神秘客",
          choices: vote.optionIds.map((optionId) => row.options[optionId]?.text ?? "?"),
          people: tallyVoter(row.options, vote.optionIds).people,
        }))
        .sort((a, b) => b.people - a.people),
    })),
    nextBefore: rows.length === PAGE_SIZE ? rows[rows.length - 1].createdAt : null,
  };
}
