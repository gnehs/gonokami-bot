import type { Poll } from "../lib/telegram.ts";
import { savePollState } from "../lib/votes.ts";

export default async function (poll: Poll) {
  await savePollState(poll);
}
