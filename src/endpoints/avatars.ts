import { db, EndpointError } from "sdk";
import { sql } from "sdk/db";
import type { Avatar } from "../lib/api-types.ts";
import { avatarsFor } from "../lib/avatars.ts";
import { requireViewer, type EndpointContext } from "../lib/guard.ts";

const MAX_PER_CALL = 30;

/** Photos of people who voted in this chat, for members of it; nobody else's photo is reachable. */
export default async function (input: { chatId?: number; userIds?: unknown }, ctx: EndpointContext): Promise<Avatar[]> {
  const { chatId } = await requireViewer(ctx, input.chatId);
  if (!Array.isArray(input.userIds) || input.userIds.length > MAX_PER_CALL) {
    throw new EndpointError("Bad userIds", { code: "BAD_INPUT" });
  }
  const asked = [...new Set(input.userIds.filter((id): id is number => Number.isSafeInteger(id)))];
  if (asked.length === 0) return [];

  const voters = await db.all<{ user_id: number }>(sql`
    SELECT DISTINCT v.user_id FROM poll_votes v JOIN polls p ON p.id = v.poll_id
    WHERE p.chat_id = ${chatId} AND v.user_id IN (SELECT value FROM json_each(${JSON.stringify(asked)}))`);
  return avatarsFor(voters.map((row) => row.user_id));
}
