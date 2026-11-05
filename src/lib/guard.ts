import { EndpointError } from "sdk";
import { canView } from "./store.ts";
import type { User } from "./telegram.ts";

export type EndpointContext = { initData?: { user?: User; start_param?: string } };

/** Mini App calls always carry verified init data; `tgcloud run` (the cron Worker, the importer) never does. */
export function requireOperator(ctx: EndpointContext) {
  if (ctx.initData) throw new EndpointError("Not available from the Mini App", { code: "FORBIDDEN" });
}

export function requireUser(ctx: EndpointContext): User {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError("Open this from Telegram", { code: "NO_USER" });
  return user;
}

export async function requireViewer(ctx: EndpointContext, chatId: unknown): Promise<{ user: User; chatId: number }> {
  const user = requireUser(ctx);
  if (typeof chatId !== "number" || !Number.isSafeInteger(chatId) || !(await canView(chatId, user.id))) {
    throw new EndpointError("你不在這個群組裡", { code: "NOT_MEMBER" });
  }
  return { user, chatId };
}
