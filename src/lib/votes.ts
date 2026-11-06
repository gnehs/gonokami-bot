import { db, api, BotApiError } from "sdk";
import { eq, lt } from "sdk/db";
import { polls, pollVotes } from "../schema.ts";
import {
  BYE_OPTIONS,
  RAMEN_OPTIONS,
  VOTE_OPTIONS,
  detectKind,
  tallyChoices,
  tallyOptions,
  type PollKind,
  type PollOption,
} from "./poll.ts";
import { escapeHtml, type CallbackQuery, type Message, type Poll, type PollAnswer } from "./telegram.ts";
import { rememberUser } from "./store.ts";
import { pollAlreadyClosedText, ramenResultFooter, ramenResultHeader, stopNotOwnerText, voteResultText } from "./voice.ts";

type StoredPoll = {
  id: string;
  chatId: number;
  messageId: number | null;
  creatorId: number | null;
  kind: PollKind;
  question: string;
  options: PollOption[];
  isClosed: boolean;
};

function pickBye() {
  return BYE_OPTIONS[Math.floor(Math.random() * BYE_OPTIONS.length)];
}

function stopMarkup(kind: PollKind, people: number) {
  const text = kind === "ramen" ? `👥 ${people} 人 | 🚫 結束投票` : "🚫 結束！很遜欸";
  return { inline_keyboard: [[{ text, callback_data: `stop${kind}` }]] };
}

export async function handleVoteCommand(message: Message, kind: PollKind, args: string[]) {
  const question = args[0] ?? (kind === "ramen" ? "限定拉麵，點餐！🍜" : "今天ㄘ什麼 🤔");
  const optionTexts = [...(kind === "ramen" ? RAMEN_OPTIONS : VOTE_OPTIONS), args[1] ?? pickBye()];
  const sent = await api.sendPoll({
    chat_id: message.chat.id,
    question,
    options: optionTexts.map((text) => ({ text })),
    allows_multiple_answers: true,
    is_anonymous: false,
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    reply_markup: stopMarkup(kind, 0),
  });
  const now = Date.now();
  await db.insert(polls).values({
    id: sent.poll.id,
    chatId: message.chat.id,
    messageId: sent.message_id,
    creatorId: message.from?.id ?? null,
    kind,
    question,
    options: optionTexts.map((text) => ({ text, voterCount: 0 })),
    isClosed: false,
    createdAt: now,
    updatedAt: now,
  });
}

function resultText(poll: Poll, kind: PollKind): string {
  const tally = tallyOptions(poll.options.map((option) => ({ text: option.text, voterCount: option.voter_count })));
  const title = `<b>${escapeHtml(poll.question)}</b>`;
  if (kind === "vote") return voteResultText(title, tally.people);
  const lines = Object.entries(tally.items).map(([item, count]) => `${escapeHtml(item)}：${count} 人`);
  return `${ramenResultHeader(title)}\n${lines.join("\n")}\n———\n${ramenResultFooter(tally.people)}`;
}

/** The stop button only works for whoever opened the poll; legacy polls with no recorded creator stop for anyone. */
export async function handleStopPoll(query: CallbackQuery, legacyKind: PollKind | null) {
  const message = query.message!;
  const stored: StoredPoll | null = await db
    .select()
    .from(polls)
    .where(eq(polls.messageId, message.message_id))
    .all()
    .then((rows: StoredPoll[]) => rows.find((row) => row.chatId === message.chat.id) ?? null);

  if (stored?.creatorId && stored.creatorId !== query.from.id) {
    return api.answerCallbackQuery({ callback_query_id: query.id, text: stopNotOwnerText() });
  }

  let poll: Poll;
  try {
    poll = await api.stopPoll({ chat_id: message.chat.id, message_id: message.message_id });
  } catch (error) {
    if (error instanceof BotApiError && error.code === 400) {
      return api.answerCallbackQuery({ callback_query_id: query.id, text: pollAlreadyClosedText() });
    }
    throw error;
  }
  await api.answerCallbackQuery({ callback_query_id: query.id });
  const kind = stored?.kind ?? legacyKind ?? detectKind(poll.options);
  await api.sendMessage({
    chat_id: message.chat.id,
    text: resultText(poll, kind),
    parse_mode: "HTML",
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
  });
  await savePollState(poll);
}

/** Telegram pushes the authoritative per-option counts for polls the bot sent. */
export async function savePollState(poll: Poll) {
  await db
    .update(polls)
    .set({
      options: poll.options.map((option) => ({ text: option.text, voterCount: option.voter_count })),
      isClosed: poll.is_closed,
      updatedAt: Date.now(),
    })
    .where(eq(polls.id, poll.id));
}

export async function handlePollAnswer(answer: PollAnswer) {
  if (!answer.user) return;
  await rememberUser(answer.user);
  const stored: StoredPoll | null = await db.select().from(polls).where(eq(polls.id, answer.poll_id)).get();
  if (!stored) return;

  const key = { pollId: answer.poll_id, userId: answer.user.id };
  if (answer.option_ids.length === 0) {
    await db.delete(pollVotes).where(eq(pollVotes.pollId, key.pollId), eq(pollVotes.userId, key.userId));
  } else {
    const row = { ...key, optionIds: answer.option_ids, updatedAt: Date.now() };
    await db
      .insert(pollVotes)
      .values(row)
      .onConflictDoUpdate({ target: [pollVotes.pollId, pollVotes.userId], set: row });
  }

  if (stored.kind !== "ramen" || stored.messageId === null) return;
  const votes: { optionIds: number[] }[] = await db.select().from(pollVotes).where(eq(pollVotes.pollId, answer.poll_id)).all();
  const { people } = tallyChoices(
    stored.options.map((option) => option.text),
    votes.flatMap((vote) => vote.optionIds.map((optionId) => ({ optionId, count: 1 })))
  );
  try {
    await api.editMessageReplyMarkup({
      chat_id: stored.chatId,
      message_id: stored.messageId,
      reply_markup: stopMarkup("ramen", people),
    });
  } catch (error) {
    if (!(error instanceof BotApiError && error.code === 400)) throw error;
  }
}

const STALE_POLL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_POLLS_PER_TICK = 10;

/**
 * Stops polls left open for over a week, quietly, without a results message. When Telegram can no
 * longer stop one (message too old or deleted, bot removed from the chat), it is only marked closed.
 */
export async function closeStalePolls(now: number): Promise<number> {
  const stale: StoredPoll[] = await db
    .select()
    .from(polls)
    .where(eq(polls.isClosed, false), lt(polls.createdAt, now - STALE_POLL_MS))
    .limit(STALE_POLLS_PER_TICK)
    .all();

  for (const poll of stale) {
    if (poll.messageId !== null) {
      try {
        await savePollState(
          await api.stopPoll({
            chat_id: poll.chatId,
            message_id: poll.messageId,
            reply_markup: { inline_keyboard: [] },
          })
        );
        continue;
      } catch (error) {
        const permanent = error instanceof BotApiError && (error.code === 400 || error.code === 403);
        if (!permanent) {
          console.warn("stopPoll failed, retrying next tick", { id: poll.id, error: String(error) });
          continue;
        }
      }
    }
    await db.update(polls).set({ isClosed: true, updatedAt: now }).where(eq(polls.id, poll.id));
  }
  return stale.length;
}
