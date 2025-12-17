import { Bot, Context, GrammyError } from "grammy";
import crypto from "crypto";
import os from "os";

const salt = os.hostname() || "salt";

/**
 * Generate a short, stable hash (8 hex chars) – useful for callback_data, etc.
 */
export function hash(str: string | number): string {
  const h = crypto.createHash("sha256");
  h.update(str.toString() + salt, "utf8");
  return h.digest("hex").slice(0, 8);
}

/**
 * A helper that safely replies to a message and gracefully falls back to a plain
 * sendMessage when the original message is no longer available (e.g. deleted).
 */
export async function safeReply(
  ctx: Context,
  text: string,
  options: Parameters<Context["reply"]>[1] = {}
) {
  const opts = { ...(options || {}) } as Record<string, unknown>;
  try {
    return await ctx.reply(text, opts as any);
  } catch (err) {
    if (err instanceof GrammyError) {
      let retry = false;
      if (err.description.includes("message to be replied not found")) {
        delete opts.reply_to_message_id;
        retry = true;
      }
      if (err.description.includes("can't parse entities")) {
        delete opts.parse_mode;
        retry = true;
      }
      if (retry) {
        return await ctx.api.sendMessage(ctx.chat.id, text, opts as any);
      }
    }
    throw err;
  }
}

/**
 * Safe variant of bot.api.sendMessage with the same fallback logic as safeReply.
 */
export function safeSendMessage(
  botInstance: Bot,
  chatId: number,
  text: string,
  options:
    | Parameters<Context["api"]["sendMessage"]>[2]
    | Record<string, unknown> = {}
) {
  const opts = { ...(options || {}) } as Record<string, unknown>;
  return botInstance.api
    .sendMessage(chatId, text, opts as any)
    .catch((err) => {
      if (err instanceof GrammyError) {
        let retry = false;
        if (err.description.includes("message to be replied not found")) {
          delete opts.reply_to_message_id;
          retry = true;
        }
        if (err.description.includes("can't parse entities")) {
          delete opts.parse_mode;
          retry = true;
        }
        if (retry) {
          return botInstance.api.sendMessage(chatId, text, opts as any);
        }
      }
      throw err;
    });
}

/**
 * Safe variant of bot.api.editMessageText with Markdown fallback.
 */
export function safeEditMessageText(
  botInstance: Bot,
  chatId: number,
  messageId: number,
  text: string,
  options:
    | Parameters<Context["api"]["editMessageText"]>[3]
    | Record<string, unknown> = {}
) {
  const opts = { ...(options || {}) } as Record<string, unknown>;
  return botInstance.api
    .editMessageText(chatId, messageId, text, opts as any)
    .catch((err) => {
      if (
        err instanceof GrammyError &&
        err.description.includes("can't parse entities")
      ) {
        delete opts.parse_mode;
        return botInstance.api.editMessageText(
          chatId,
          messageId,
          text,
          opts as any
        );
      }
      throw err;
    });
}

/**
 * Pick a random element from the given array.
 */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
