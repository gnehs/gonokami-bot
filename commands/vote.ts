import type { Bot } from "grammy";
import { hash } from "../utils/telegram.ts";
import { voteData, updatePollData, parsePollResult } from "../utils/poll.ts";

/**
 * Register vote-related commands and callbacks on the provided bot instance.
 */
export function registerVoteCommands(bot: Bot) {
  // ------------------ /vote ------------------
  bot.command("vote", async (ctx) => {
    console.log("[vote] command", { chat: ctx.chat.id, from: ctx.from.id });
    const args = ctx.message.text.split(" ").slice(1);
    const voteTitle = args[0] ?? "今天ㄘ什麼 🤔";
    const byeOptionsPool = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
    const byeOption =
      args[1] ??
      byeOptionsPool[Math.floor(Math.random() * byeOptionsPool.length)];
    const voteOptions = ["+1", "+2", "+4", byeOption];

    const pollOptions = voteOptions.map((t) => ({ text: t }));
    const data = await ctx.api.sendPoll(ctx.chat.id, voteTitle, pollOptions, {
      allows_multiple_answers: true,
      is_anonymous: false,
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚫 結束！很遜欸",
              callback_data: `stopvote_${hash(ctx.message.from.id)}`,
            },
          ],
        ],
      },
    });

    updatePollData(data.poll.id, {
      ...data.poll,
      chat_id: ctx.chat.id,
      chat_name: ctx.chat.title || ctx.chat.first_name,
      chat_type: ctx.chat.type,
      votes: {},
    });
  });

  bot.callbackQuery(/stopvote_(.+)/, async (ctx) => {
    if (ctx.match[1] !== hash(ctx.update.callback_query.from.id)) {
      return ctx.answerCallbackQuery(
        "🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。"
      );
    }
    const poll = await ctx.api.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    const count = poll.options.slice(0, -1).reduce((acc, cur) => {
      const multiplier = Number(cur.text.replace("+", "").trim());
      return acc + cur.voter_count * multiplier;
    }, 0);
    await ctx.reply(
      `*${poll.question}* 投票結束，醬子共 ${count} 個人要ㄘ。🥳`,
      {
        parse_mode: "MarkdownV2",
        reply_to_message_id: ctx.update.callback_query.message.message_id,
      }
    );
    updatePollData(poll.id, poll);
  });

  // ------------------ /voteramen ------------------
  bot.command("voteramen", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);
    const voteTitle = args[0] ?? "限定拉麵，點餐！🍜";
    const byeOptionsArr = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
    const byeOpt =
      args[1] ??
      byeOptionsArr[Math.floor(Math.random() * byeOptionsArr.length)];

    const voteOptions = [
      "+1 | 🍜 單點",
      "+2 | 🍜 單點",
      "+1 | 🥚 加蛋",
      "+2 | 🥚 加蛋",
      "+1 | ✨ 超值",
      "+2 | ✨ 超值",
      byeOpt,
    ];
    const pollOptions = voteOptions.map((t) => ({ text: t }));
    const data = await ctx.api.sendPoll(ctx.chat.id, voteTitle, pollOptions, {
      allows_multiple_answers: true,
      is_anonymous: false,
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👥 0 人 | 🚫 結束投票",
              callback_data: `stopramenvote_${hash(ctx.message.from.id)}`,
            },
          ],
        ],
      },
    });

    updatePollData(data.poll.id, {
      ...data.poll,
      chat_id: ctx.chat.id,
      message_id: data.message_id,
      user_id: ctx.from.id,
      chat_name: ctx.chat.title || ctx.chat.first_name,
      chat_type: ctx.chat.type,
      votes: {},
    });
  });

  bot.callbackQuery(/stopramenvote_(.+)/, async (ctx) => {
    if (ctx.match[1] !== hash(ctx.update.callback_query.from.id)) {
      return ctx.answerCallbackQuery(
        "🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。"
      );
    }
    const poll = await ctx.api.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    const { count, result } = parsePollResult(poll);
    let txt = `*${poll.question}* 點餐結果，挖賽！🤩\n`;
    for (const k in result) txt += `${k}：${result[k]} 人\n`;
    txt += `———\n共 ${count} 個人，醬子。🥳`;
    await ctx.reply(txt, {
      parse_mode: "MarkdownV2",
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });
    updatePollData(poll.id, poll);
  });

  // ------------------ poll_answer ------------------
  bot.on("poll_answer", async (ctx) => {
    const pollAnswer = ctx.update.poll_answer;
    const users = voteData.get("users") || {};
    users[pollAnswer.user.id] = {
      first_name: pollAnswer.user?.first_name,
      username: pollAnswer.user?.username,
    };
    voteData.set("users", users);

    const polls = voteData.get("polls") || {};
    const poll = polls[pollAnswer.poll_id];
    if (!poll) return;
    poll.votes[pollAnswer.user.id] = pollAnswer.option_ids;
    updatePollData(pollAnswer.poll_id, poll);

    // Update dynamic voter count for ramen vote
    const isRamen = poll.options.some((opt: any) => opt.text.includes("|"));
    if (!isRamen) return;
    const total = Object.values(poll.votes)
      .flatMap((o: any) => o as number[])
      .filter((id: number) => id !== poll.options.length - 1)
      .map((id: number) => (id % 2) + 1)
      .reduce((s: number, q: number) => s + q, 0);
    try {
      await ctx.api.editMessageReplyMarkup(poll.chat_id, poll.message_id, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `👥 ${total} 人 | 🚫 結束投票`,
                callback_data: `stopramenvote_${hash(poll.user_id)}`,
              },
            ],
          ],
        },
      });
    } catch (e) {
      if (!e.message.includes("message is not modified")) {
        console.error("Failed to edit reply markup:", e);
      }
    }
  });
}
