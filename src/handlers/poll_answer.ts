import type { PollAnswer } from "../lib/telegram.ts";
import { handlePollAnswer } from "../lib/votes.ts";

export default async function (answer: PollAnswer) {
  await handlePollAnswer(answer);
}
