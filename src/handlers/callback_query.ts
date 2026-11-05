import { api } from "sdk";
import { handleCancelNumber } from "../lib/number.ts";
import type { CallbackQuery } from "../lib/telegram.ts";
import { handleStopPoll } from "../lib/votes.ts";

export default async function (query: CallbackQuery) {
  const data = query.data ?? "";

  const cancel = /^cancelnumber_(\d+)$/.exec(data);
  if (cancel) return handleCancelNumber(query, Number(cancel[1]));

  // stopvote / stopramen; "_<hash>" suffixes come from buttons sent by the old Docker bot.
  const stop = /^stop(vote|ramen|ramenvote)(?:_\w+)?$/.exec(data);
  if (stop && query.message) return handleStopPoll(query, stop[1] === "vote" ? "vote" : "ramen");

  await api.answerCallbackQuery({ callback_query_id: query.id, text: "這顆按鈕太舊了，偶看不懂。" });
}
