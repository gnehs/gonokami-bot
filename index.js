import "dotenv/config";
import { Telegraf } from "telegraf";
import crypto from "crypto";
import os from "os";
import JSONdb from "simple-json-db";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.BOT_TOKEN);

const salt = os.hostname() || "salt";
const voteData = new JSONdb("./votes.json", { jsonSpaces: false });
function hash(str) {
  const hash = crypto.createHash("sha256");
  hash.update(str.toString() + salt, "utf8");
  return hash.digest("hex").slice(0, 8);
}

async function getCurrentNumber() {
  try {
    const res = await fetch(
      "https://dxc.tagfans.com/mighty?_field%5B%5D=*&%24gid=10265&%24description=anouncingNumbers"
    )
      .then((x) => x.json())
      .then((x) => x.sort((a, b) => b.UpdDate - a.UpdDate));

    if (!res || res.length === 0) {
      return null;
    }

    return JSON.parse(res[0].detail_json).selections["目前號碼"];
  } catch (e) {
    console.error("Failed to get current number:", e);
    return null;
  }
}

bot.command("number", async (ctx) => {
  ctx.telegram.sendChatAction(ctx.chat.id, "typing");
  let args = ctx.message.text.split(" ").slice(1);

  const currentNumber = await getCurrentNumber();

  if (currentNumber === null) {
    return ctx.reply("無法取得號碼...", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const targetNumber = args[0];

  let responseText = `👀 目前五之神號碼為 *${currentNumber}*`;

  const isValidNumber =
    targetNumber &&
    !isNaN(targetNumber) &&
    Number.isInteger(Number(targetNumber)) &&
    targetNumber >= 1001 &&
    targetNumber <= 1200 &&
    String(targetNumber).length <= 4;

  if (isValidNumber) {
    if (targetNumber > currentNumber) {
      responseText += `\n✅ 您輸入的號碼尚未被叫到`;
      return ctx.reply(responseText, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔔 訂閱此號碼",
                callback_data: `subscribe_number_${targetNumber}`,
              },
            ],
          ],
        },
      });
    } else {
      responseText += `\n✖️ 您輸入的號碼牌已過號`;
    }
  } else if (targetNumber) {
    responseText += `\n✖️ 請輸入有效的號碼（1001-1200）`;
  } else {
    responseText += `\n\n可使用 \`/number <號碼牌號碼>\` 來查詢您的號碼狀態`;
  }

  ctx.reply(responseText, {
    parse_mode: "Markdown",
    reply_to_message_id: ctx.message.message_id,
  });
});

bot.action(/subscribe_number_(\d+)/, async (ctx) => {
  const targetNumber = ctx.match[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const message = ctx.update.callback_query.message;

  const currentNumber = await getCurrentNumber();
  if (currentNumber === null) {
    return ctx.answerCbQuery("❌ 無法取得目前號碼，請稍後再試", {
      show_alert: true,
    });
  }

  if (targetNumber <= currentNumber) {
    await ctx.editMessageReplyMarkup(undefined);
    return ctx.answerCbQuery("❌ 此號碼已過號", { show_alert: true });
  }

  let subscriptions = voteData.get("subscriptions") || [];
  const existingSub = subscriptions.find(
    (s) => s.chat_id === chatId && s.user_id === userId
  );

  if (existingSub) {
    await ctx.editMessageReplyMarkup(undefined);
    return ctx.answerCbQuery(
      `⚠️ 您已經訂閱了 ${existingSub.target_number} 號，請先用 /unsubscribe 取消`,
      { show_alert: true }
    );
  }

  subscriptions.push({
    chat_id: chatId,
    user_id: userId,
    first_name: ctx.from.first_name,
    target_number: Number(targetNumber),
    created_at: Date.now(),
    message_id: message.message_id,
  });
  voteData.set("subscriptions", subscriptions);

  await ctx.editMessageText(
    `${message.text}\n\n✅ 已訂閱 ${targetNumber} 號，叫到時會通知您。\n可使用 /unsubscribe 取消訂閱`,
    {
      parse_mode: "Markdown",
    }
  );
  await ctx.answerCbQuery(`✅ 已訂閱 ${targetNumber} 號`);
});

bot.command("unsubscribe", async (ctx) => {
  let subscriptions = voteData.get("subscriptions") || [];
  const subIndex = subscriptions.findIndex(
    (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
  );

  if (subIndex === -1) {
    return ctx.reply("您沒有訂閱任何號碼", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  subscriptions.splice(subIndex, 1);
  voteData.set("subscriptions", subscriptions);

  ctx.reply("已取消訂閱", {
    reply_to_message_id: ctx.message.message_id,
  });
});

async function checkSubscriptions() {
  let subscriptions = voteData.get("subscriptions") || [];
  if (subscriptions.length === 0) {
    return;
  }

  const currentNumber = await getCurrentNumber();
  if (currentNumber === null) {
    console.error("checkSubscriptions: Failed to get current number.");
    return;
  }

  const remainingSubscriptions = [];
  const fiveHours = 5 * 60 * 60 * 1000;

  for (const sub of subscriptions) {
    if (currentNumber >= sub.target_number) {
      bot.telegram.sendMessage(
        sub.chat_id,
        `🔔 @${sub.first_name} 您訂閱的 ${sub.target_number} 號到啦！`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else if (Date.now() - sub.created_at > fiveHours) {
      bot.telegram.sendMessage(
        sub.chat_id,
        `⏰ @${sub.first_name} 您訂閱的 ${sub.target_number} 號已超過 5 小時，自動取消訂閱。`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else {
      remainingSubscriptions.push(sub);
    }
  }

  voteData.set("subscriptions", remainingSubscriptions);
}

setInterval(checkSubscriptions, 60 * 1000);

// vote
bot.command("vote", async (ctx) => {
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "限定拉麵";
  let byeOptions = ["ㄅㄅ", "ＱＱ", "🥞"];
  let byeOption = args[1]
    ? args[1]
    : byeOptions[Math.floor(Math.random() * byeOptions.length)];
  let voteOptions = ["+1", "+2", "+4", byeOption];
  let data = await ctx.replyWithPoll(voteTitle, voteOptions, {
    allows_multiple_answers: true,
    is_anonymous: false,
    reply_to_message_id: ctx.message.message_id,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✖️停止投票",
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
bot.action(/stopvote_(.+)/, async (ctx) => {
  let hashStr = ctx.match[1];
  if (hashStr == hash(ctx.update.callback_query.from.id)) {
    let poll = await ctx.telegram.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    let count = poll.options
      .slice(0, -1)
      .reduce(
        (acc, cur) => acc + cur.voter_count * cur.text.replace("+", ""),
        0
      );
    ctx.replyWithMarkdownV2(`*${poll.question}投票結果*\n共 ${count} 人`, {
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });
  } else {
    ctx.answerCbQuery("✖️ 只有發起人才能停止投票");
  }
});

// ramen vote
bot.command("voteramen", async (ctx) => {
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "限定拉麵";
  let byeOptions = ["ㄅㄅ", "ＱＱ", "🥞"];
  let byeOption =
    args[1] ?? byeOptions[Math.floor(Math.random() * byeOptions.length)];
  let voteOptions = [
    "+1 | 🍜 單點",
    "+2 | 🍜 單點",
    "+1 | 🥚 加蛋",
    "+2 | 🥚 加蛋",
    "+1 | ✨ 超值",
    "+2 | ✨ 超值",
    byeOption,
  ];
  let data = await ctx.replyWithPoll(voteTitle, voteOptions, {
    allows_multiple_answers: true,
    is_anonymous: false,
    reply_to_message_id: ctx.message.message_id,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🧮計算人數",
            callback_data: `countremenvote`,
          },
          {
            text: "✖️停止投票",
            callback_data: `stopramenvote_${hash(ctx.message.from.id)}`,
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

// watch user vote
bot.on("poll_answer", async (ctx) => {
  let pollAnswer = ctx.update.poll_answer;
  // update user
  let users = voteData.get("users") || {};
  users[pollAnswer.user.id] = {
    first_name: pollAnswer.user?.first_name,
    username: pollAnswer.user?.username,
  };
  voteData.set("users", users);
  // update poll
  let polls = voteData.get("polls") || {};
  let poll = polls[pollAnswer.poll_id];
  let options = pollAnswer.option_ids;
  poll.votes[pollAnswer.user.id] = options;
  updatePollData(pollAnswer.poll_id, poll);
  console.log(
    `[vote] ${pollAnswer.user?.first_name} voted ${
      options.length ? options : "retract"
    } in poll ${poll.question}(${pollAnswer.poll_id}) at ${poll.chat_name}(${
      poll.chat_id
    })`
  );
});

bot.action(/stopramenvote_(.+)/, async (ctx) => {
  let hashStr = ctx.match[1];
  if (hashStr == hash(ctx.update.callback_query.from.id)) {
    let poll = await ctx.telegram.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    let { count, result } = parsePollResult(poll);
    let responseText = `*${poll.question}投票結果*\n`;
    for (let key in result) {
      responseText += `${key}：${result[key]} 人\n`;
    }
    responseText += `———\n`;
    responseText += `共 ${count} 人\n`;
    ctx.replyWithMarkdownV2(responseText, {
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });

    updatePollData(poll.id, poll);
  } else {
    ctx.answerCbQuery("✖️ 只有發起人才能停止投票");
  }
});
bot.action(/countremenvote/, async (ctx) => {
  let pollID = ctx.update.callback_query.message.poll.id;
  let poll = voteData.get("polls")[pollID];
  let count = Object.values(poll.votes)
    .map((x) => {
      let sum = 0;
      x.forEach((y) => {
        sum += (y % 2) + 1;
      });
      return sum;
    })
    .reduce((acc, cur) => acc + cur, 0);
  ctx.answerCbQuery(`目前投票人數：${count} 人`, {
    show_alert: true,
  });
});
function parsePollResult(poll) {
  let options = [
    ...new Set(
      poll.options.slice(0, -1).map((x) => x.text.split("|")[1].trim())
    ),
  ];
  let result = {};
  options.forEach((x) => (result[x] = 0));
  poll.options.slice(0, -1).forEach((x) => {
    let option = x.text.split("|")[1].trim();
    result[option] +=
      x.voter_count * x.text.replace("+", "").split("|")[0].trim();
  });
  let count = Object.values(result).reduce((acc, cur) => acc + cur, 0);
  return {
    count,
    result,
  };
}
function updatePollData(id, data) {
  let polls = voteData.get("polls") || {};
  let poll = polls[id] || {};
  poll = {
    ...poll,
    ...data,
    update_time: Date.now(),
  };
  delete poll.id;
  delete poll.is_anonymous;
  delete poll.type;
  delete poll.allows_multiple_answers;

  polls[id] = poll;
  voteData.set("polls", polls);
}

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
