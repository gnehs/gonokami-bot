import type { MeResult } from "../lib/api-types.ts";
import { requireUser, type EndpointContext } from "../lib/guard.ts";
import { retroYear } from "../lib/retro.ts";
import { canView, rememberUser, viewableChats } from "../lib/store.ts";

export default async function (_input: object, ctx: EndpointContext): Promise<MeResult> {
  const user = requireUser(ctx);
  await rememberUser(user);

  // Opening from a group's link proves nothing by itself; membership is checked like any other chat.
  const match = /^c(\d+)$/.exec(ctx.initData?.start_param ?? "");
  const requested = match ? -Number(match[1]) : null;
  const startChatId = requested !== null && (await canView(requested, user.id)) ? requested : null;

  return {
    user: { id: user.id, name: user.first_name },
    chats: await viewableChats(user),
    startChatId,
    retroYear: retroYear(Date.now()),
  };
}
