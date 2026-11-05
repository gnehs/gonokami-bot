import { rememberChat } from "../lib/store.ts";
import type { ChatMemberUpdated } from "../lib/telegram.ts";

export default async function (update: ChatMemberUpdated) {
  await rememberChat(update.chat);
}
