import "dotenv/config";
import { Telegraf } from "telegraf";
import crypto from "crypto";
import os from "os";
import JsonFileDb from "./utils/db.js";
import fs from "fs";

let botUsername;
async function getBotUsername(ctx) {
  if (!botUsername) {
    const me = await ctx.telegram.getMe();
    botUsername = me.username;
  }
  return botUsername;
}

const bot = new Telegraf(process.env.BOT_TOKEN);

const salt = os.hostname() || "salt";

const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const voteData = new JsonFileDb("votes.json");
const subData = new JsonFileDb("subscriptions.json");

function hash(str) {
  const hash = crypto.createHash("sha256");
  hash.update(str.toString() + salt, "utf8");
  return hash.digest("hex").slice(0, 8);
}

let numberCache = {
  value: null,
  timestamp: 0,
};

async function getCurrentNumber() {
  const now = Date.now();
  if (now - numberCache.timestamp < 60 * 1000 && numberCache.value !== null) {
    return numberCache.value;
  }
  try {
    const res = await fetch(
      "https://dxc.tagfans.com/mighty?_field%5B%5D=*&%24gid=10265&%24description=anouncingNumbers"
    )
      .then((x) => x.json())
      .then((x) => x.sort((a, b) => b.UpdDate - a.UpdDate));

    if (!res || res.length === 0) {
      return null;
    }

    const currentNumber = JSON.parse(res[0].detail_json).selections["目前號碼"];
    numberCache = {
      value: currentNumber,
      timestamp: now,
    };
    return currentNumber;
  } catch (e) {
    console.error("Failed to get current number:", e);
    return null;
  }
}

bot.start(async (ctx) => {
  if (ctx.chat.type !== "private") {
    return;
  }

  const payload = ctx.payload;

  if (!payload) {
    return ctx.reply(
      "安安，榮勾斯揪來了，怕的是他。有事嗎？\n想訂閱叫號可以打 `/number <你的號碼>`，偶會幫你訂閱，很ㄅㄧㄤˋ吧 ✨。"
    );
  }

  try {
    const decodedPayload = Buffer.from(payload, "base64").toString("utf8");
    const params = Object.fromEntries(
      new URLSearchParams(decodedPayload).entries()
    );
    const {
      action,
      group_chat_id,
      target_number,
      user_message_id,
      group_message_id,
    } = params;

    if (action === "subscribe") {
      const userId = ctx.from.id;
      const chatId = Number(group_chat_id);
      const targetNumber = Number(target_number);

      const currentNumber = await getCurrentNumber();
      if (currentNumber === null) {
        return ctx.reply("😵‍💫 挖哩咧，偶拿不到號碼，很遜欸，等等再試。");
      }

      if (targetNumber <= currentNumber) {
        return ctx.reply("🤡 都跟你說過號了，你很奇欸。");
      }

      let subscriptions = subData.get("subscriptions") || [];
      const existingSub = subscriptions.find(
        (s) => s.chat_id === chatId && s.user_id === userId
      );

      if (existingSub) {
        return ctx.reply(
          `⚠️ 你已經訂閱 ${existingSub.target_number} 號了，不要重複訂，很遜。`
        );
      }

      subscriptions.push({
        chat_id: chatId,
        user_id: userId,
        first_name: ctx.from.first_name,
        target_number: targetNumber,
        created_at: Date.now(),
        message_id: Number(user_message_id),
      });
      subData.set("subscriptions", subscriptions);

      await ctx.reply(
        `👑 哼嗯，*${targetNumber}* 號是吧？偶記下了，怕的是他。`,
        { parse_mode: "Markdown" }
      );
      await bot.telegram.sendMessage(
        chatId,
        `✅ ${ctx.from.first_name} 已訂閱 ${targetNumber} 號。`,
        { reply_to_message_id: Number(user_message_id) }
      );
    } else if (action === "unsubscribe") {
      const userId = ctx.from.id;
      const chatId = Number(group_chat_id);

      let subscriptions = subData.get("subscriptions") || [];
      const subIndex = subscriptions.findIndex(
        (s) => s.chat_id === chatId && s.user_id === userId
      );

      if (subIndex === -1) {
        return ctx.reply("🗣️ 你又沒訂閱，是在取消什麼，告老師喔！");
      }

      const sub = subscriptions[subIndex];
      subscriptions.splice(subIndex, 1);
      subData.set("subscriptions", subscriptions);

      await ctx.reply(
        `🚫 哼嗯，偶幫你取消 *${sub.target_number}* 號的訂閱了。醬子。`,
        { parse_mode: "Markdown" }
      );

      if (group_message_id) {
        const unsubscribedText = `✅ @${ctx.from.first_name} 已取消 *${sub.target_number}* 號的訂閱了。`;
        try {
          await bot.telegram.editMessageText(
            chatId,
            Number(group_message_id),
            undefined,
            unsubscribedText,
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          if (!e.message.includes("message is not modified")) {
            console.error("Failed to edit message on unsubscribe:", e);
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to handle start command with payload", e);
    await ctx.reply("挖哩咧，偶搞不懂你的指令，很遜欸。");
  }
});

bot.command("number", async (ctx) => {
  ctx.telegram.sendChatAction(ctx.chat.id, "typing");
  let args = ctx.message.text.split(" ").slice(1);

  const currentNumber = await getCurrentNumber();

  if (currentNumber === null) {
    return ctx.reply("挖哩咧 😵‍💫，偶拿不到號碼，很遜欸。", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const targetNumber = args[0];
  let responseText = `👑 哼嗯，現在號碼是 *${currentNumber}*，醬子。`;

  // Private Chat Logic
  if (ctx.chat.type === "private") {
    const subscriptions = subData.get("subscriptions") || [];
    const existingSub = subscriptions.find(
      (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
    );

    if (!targetNumber && existingSub) {
      subscriptions.splice(subscriptions.indexOf(existingSub), 1);
      subData.set("subscriptions", subscriptions);
      return ctx.reply(
        `🚫 哼嗯，偶幫你取消 *${existingSub.target_number}* 號的訂閱了。醬子。`,
        { parse_mode: "Markdown" }
      );
    }

    if (existingSub) {
      responseText += `\n✅ 你已經訂閱 *${existingSub.target_number}* 號了。想取消？打 \`/number\` 就好，醬子。`;
      return ctx.reply(responseText, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
      });
    }

    const isValidNumber =
      targetNumber &&
      !isNaN(targetNumber) &&
      Number.isInteger(Number(targetNumber)) &&
      targetNumber >= 1001 &&
      targetNumber <= 1200 &&
      String(targetNumber).length <= 4;

    if (isValidNumber) {
      if (targetNumber > currentNumber) {
        subscriptions.push({
          chat_id: ctx.chat.id,
          user_id: ctx.from.id,
          first_name: ctx.from.first_name,
          target_number: Number(targetNumber),
          created_at: Date.now(),
          message_id: ctx.message.message_id,
        });
        subData.set("subscriptions", subscriptions);
        responseText += `\n👑 哼嗯，*${targetNumber}* 號是吧？偶記下了，怕的是他。想取消再打一次 \`/number\` 就好。`;
      } else {
        responseText += `\n🤡 這位同學，*${targetNumber}* 已經過了，你很奇欸。`;
      }
    } else if (targetNumber) {
      responseText += `\n🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。`;
    } else {
      responseText += `\n\n想訂閱叫號？打 \`/number <你的號碼>\`，偶幫你記著，很ㄅㄧㄤˋ吧 ✨。`;
    }

    return ctx.reply(responseText, {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.message.message_id,
    });
  }
  // Group Chat Logic
  else {
    const subscriptions = subData.get("subscriptions") || [];
    const existingSub = subscriptions.find(
      (s) => s.chat_id === ctx.chat.id && s.user_id === ctx.from.id
    );
    const username = await getBotUsername(ctx);

    if (existingSub) {
      responseText += `\n✅ 你訂閱的 *${existingSub.target_number}* 號偶記下了，怕的是他。叫到再跟你說，安安。`;
      const sentMessage = await ctx.reply(responseText, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
      });

      const payload = `action=unsubscribe&group_chat_id=${ctx.chat.id}&group_message_id=${sentMessage.message_id}`;
      const base64Payload = Buffer.from(payload).toString("base64");
      const url = `https://t.me/${username}?start=${base64Payload}`;

      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id,
        sentMessage.message_id,
        undefined,
        {
          inline_keyboard: [
            [
              {
                text: "🚫 私訊偶取消",
                url: url,
              },
            ],
          ],
        }
      );
      return;
    }

    const isValidNumber =
      targetNumber &&
      !isNaN(targetNumber) &&
      Number.isInteger(Number(targetNumber)) &&
      targetNumber >= 1001 &&
      targetNumber <= 1200 &&
      String(targetNumber).length <= 4;

    if (isValidNumber) {
      if (targetNumber > currentNumber) {
        responseText += `\n🤔 你這 *${targetNumber}* 號還沒到，想訂閱就私訊偶，怕的是他。`;
        const payload = `action=subscribe&target_number=${targetNumber}&group_chat_id=${ctx.chat.id}&user_message_id=${ctx.message.message_id}`;
        const base64Payload = Buffer.from(payload).toString("base64");
        const url = `https://t.me/${username}?start=${base64Payload}`;
        return ctx.reply(responseText, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔔 私訊偶訂閱",
                  url: url,
                },
              ],
            ],
          },
        });
      } else {
        responseText += `\n🤡 這位同學，*${targetNumber}* 已經過了，你很奇欸。`;
      }
    } else if (targetNumber) {
      responseText += `\n🗣️ 告老師喔！號碼亂打，要輸入 1001 到 1200 的數字啦，你很兩光欸。`;
    } else {
      responseText += `\n\n想訂閱叫號？打 \`/number <你的號碼>\`，偶幫你記著，很ㄅㄧㄤˋ吧 ✨。`;
    }

    ctx.reply(responseText, {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.message.message_id,
    });
  }
});

async function checkSubscriptions() {
  let subscriptions = subData.get("subscriptions") || [];
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
        `喂～ 👑 @${sub.first_name} ，你訂的 ${sub.target_number} 號到了，怕的是他。還不快去！`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else if (Date.now() - sub.created_at > fiveHours) {
      bot.telegram.sendMessage(
        sub.chat_id,
        `欸 👋 @${sub.first_name} ，你的 ${sub.target_number} 號等太久了，超過五小時偶就幫你取消了，很遜欸。881。`,
        {
          reply_to_message_id: sub.message_id,
        }
      );
    } else {
      remainingSubscriptions.push(sub);
    }
  }

  subData.set("subscriptions", remainingSubscriptions);
}

setInterval(checkSubscriptions, 60 * 1000);

// vote
bot.command("vote", async (ctx) => {
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "今天ㄘ什麼 🤔";
  let byeOptions = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
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
    ctx.replyWithMarkdownV2(
      `*${poll.question}* 投票結束，醬子共 ${count} 個人要ㄘ。🥳`,
      {
        reply_to_message_id: ctx.update.callback_query.message.message_id,
      }
    );
  } else {
    ctx.answerCbQuery("🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。");
  }
});

// ramen vote
bot.command("voteramen", async (ctx) => {
  let args = ctx.message.text.split(" ").slice(1);
  let voteTitle = args[0] ?? "限定拉麵，點餐！🍜";
  let byeOptions = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];
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
  if (!poll) return;
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

  // Update voter count in reply markup for ramen votes
  const isRamenVote = poll.options.some((opt) => opt.text.includes("|"));
  if (!isRamenVote) return;

  const totalCount = Object.values(poll.votes)
    .flatMap((options) => options)
    .map((optionId) => (optionId % 2) + 1)
    .reduce((sum, quantity) => sum + quantity, 0);

  try {
    await bot.telegram.editMessageReplyMarkup(
      poll.chat_id,
      poll.message_id,
      undefined,
      {
        inline_keyboard: [
          [
            {
              text: `👥 ${totalCount} 人 | 🚫 結束投票`,
              callback_data: `stopramenvote_${hash(poll.user_id)}`,
            },
          ],
        ],
      }
    );
  } catch (e) {
    if (!e.message.includes("message is not modified")) {
      console.error("Failed to edit reply markup for voter count:", e);
    }
  }
});

bot.action(/stopramenvote_(.+)/, async (ctx) => {
  let hashStr = ctx.match[1];
  if (hashStr == hash(ctx.update.callback_query.from.id)) {
    let poll = await ctx.telegram.stopPoll(
      ctx.update.callback_query.message.chat.id,
      ctx.update.callback_query.message.message_id
    );
    let { count, result } = parsePollResult(poll);
    let responseText = `*${poll.question}* 點餐結果，挖賽！🤩\n`;
    for (let key in result) {
      responseText += `${key}：${result[key]} 人\n`;
    }
    responseText += `———\n`;
    responseText += `共 ${count} 個人，醬子。🥳`;
    ctx.replyWithMarkdownV2(responseText, {
      reply_to_message_id: ctx.update.callback_query.message.message_id,
    });

    updatePollData(poll.id, poll);
  } else {
    ctx.answerCbQuery("🗣️ 告老師喔，只有發起人才能結束投票，你很奇欸。");
  }
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
await bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
