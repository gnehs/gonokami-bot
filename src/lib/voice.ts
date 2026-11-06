// The bear's lines, each built from interchangeable clauses so the same message rarely reads twice.
// Within one line every clause of a slot ends the way the next slot expects, so any mix reads as one sentence.

export type Random = () => number;

function mix(random: Random, ...slots: readonly (readonly string[])[]): string {
  return slots.map((options) => options[Math.floor(random() * options.length)]).join("");
}

const b = (value: number | string) => `<b>${value}</b>`;

// ---- /number ----

export const unreachableText = (random: Random = Math.random) =>
  mix(
    random,
    ["挖哩咧 😵‍💫，", "嗚嗚 🐻，", "糟糕 🙈，"],
    ["偶拿不到號碼", "看板不理偶", "店家的看板連不上"],
    ["，很遜欸。", "，等等再問偶一次。", "，熊熊也沒轍。"]
  );

export const currentNumberText = (number: number, random: Random = Math.random) =>
  mix(
    random,
    ["👑 哼嗯，", "🐻 安安，", "📢 報告！", "👀 偶看了一下，"],
    [`現在號碼是 ${b(number)}`, `看板上是 ${b(number)} 號`, `現在叫到 ${b(number)}`],
    ["，醬子。", "，怕的是他。", "。", "，嗯哼。"]
  );

const KEPT_CLOSERS = ["，安安。", "，放心。", "，怕的是他。"];

export const subscribedAlreadyText = (target: number, random: Random = Math.random) =>
  "✅ " +
  mix(
    random,
    [`你訂閱的 ${b(target)} 號偶記下了`, `${b(target)} 號偶有記在皇家小本本上`, `偶還記得你的 ${b(target)} 號`],
    ["，叫到再跟你說", "，叫到會喊你", "，到了偶會敲你"],
    KEPT_CLOSERS
  );

export const subscribedNextSessionText = (target: number, random: Random = Math.random) =>
  "✅ " +
  mix(
    random,
    [`你訂閱的是下一場的 ${b(target)} 號`, `${b(target)} 號偶記成下一場的了`],
    ["，換場後叫到再跟你說", "，等店家換場重新叫到再喊你"],
    KEPT_CLOSERS
  );

export const subscribeHintText = (random: Random = Math.random) =>
  mix(
    random,
    ["想訂閱叫號？", "要偶幫你盯號碼嗎？", "怕錯過叫號？"],
    ["打 <code>/number 你的號碼</code>", "跟偶說 <code>/number 你的號碼</code>"],
    ["，偶幫你記著，很ㄅㄧㄤˋ吧 ✨", "，叫到偶會喊你 🔔", "，偶用熊掌幫你記下來 🐾"]
  );

export const invalidNumberText = (random: Random = Math.random) =>
  mix(
    random,
    ["🗣️ 告老師喔！", "🤨 嗯哼？", "🐻 熊熊看不懂，"],
    ["號碼亂打", "這不是號碼牌上的數字", "這號碼偶沒看過"],
    ["，要輸入 1001 到 1200 的數字啦", "，號碼牌是 1001 到 1200 喔"],
    ["，你很兩光欸。", "，再看一次號碼牌。", "，母湯喔。"]
  );

export const passedText = (target: number, random: Random = Math.random) =>
  mix(
    random,
    ["🤡 這位同學，", "🙈 哎呀，", "👑 國王熊熊宣布，"],
    [`${b(target)} 已經過了`, `${b(target)} 號早就叫過了`, `看板已經走過 ${b(target)} 了`],
    ["，你很奇欸。", "，下次早點來 🍜", "，ㄘㄟ～"]
  );

export const changedText = (from: number, to: number, random: Random = Math.random) =>
  "🔁 " +
  mix(
    random,
    [`幫你把叫號通知從 ${b(from)} 改成 ${b(to)} 號了`, `${b(from)} 號換成 ${b(to)} 號了`, `偶把小本本上的 ${b(from)} 劃掉，改記 ${b(to)} 了`],
    ["，怕的是他。", "，醬子。", "，搞定 🐾"]
  );

export const subscribedText = (target: number, random: Random = Math.random) =>
  "🔔 " +
  mix(
    random,
    [`${b(target)} 號還沒到`, `${b(target)} 號偶記下了`, `收到，${b(target)} 號`],
    ["，叫到偶會在這裡喊你", "，叫到偶會跳出來喊你", "，偶會幫你盯著看板"],
    ["，怕的是他。", "，安安。", "，放心去晃晃 🍜"]
  );

export const waitsForResetText = (shown: number, target: number, random: Random = Math.random) =>
  "⏳ " +
  mix(
    random,
    [`看板停在 ${b(shown)} 很久了`, `看板在 ${b(shown)} 睡著好一陣子了`],
    ["，這場應該收了。", "，這場八成結束了。"],
    [`${b(target)} 號偶當成下一場的號碼`, `${b(target)} 號偶先記成下一場的`],
    ["，等店家換場重新叫到再喊你。", "，換場後叫到偶再喊你 🔔"]
  );

// ---- prediction ----

type Times = { likely: string; earliest: string; latest: string };

/** One prediction sentence; `soon` switches to the hurry-up openers and closers. Without a range that part is left out. */
export function predictionText(
  { likely, earliest, latest }: Times,
  { soon, hasRange }: { soon: boolean; hasRange: boolean },
  random: Random = Math.random
): string {
  return mix(
    random,
    soon
      ? ["🏃 快輪到你了！", "⏰ 注意注意！", "🍜 拉麵在招手了！", "👑 國王熊熊提醒：快到了！"]
      : ["🐻 偶用熊鼻子聞了一下，", "👑 國王熊熊掐指一算，", "🍯 偶抱著蜂蜜罐想了想，", "🌲 偶施了一點森林魔法，", "✨ 偶用森林魔法看了一下，", "🔮 偶揮一揮熊掌唸了咒語，", "🍃 森林的風偷偷告訴偶，"],
    [`大概 ${b(likely)} 會叫到你`, `${b(likely)} 左右輪到你`, `差不多 ${b(likely)} 就到你了`, `你的號碼應該在 ${b(likely)} 前後`],
    // The range holds the actual call about four times in five, hence "八成".
    hasRange
      ? [`，最早 ${earliest}、最晚 ${latest}`, `（${earliest} 到 ${latest} 之間）`, `，八成落在 ${earliest}–${latest}`, `，抓 ${earliest}–${latest} 比較保險`]
      : [""],
    soon
      ? ["，肚子先準備好 🍜", "，快往店門口移動！", "，別再滑手機了 🐻", "，皇家拉麵在等你～"]
      : ["，醬子。", "，怕的是他～", "，先去晃晃再回來 🍜", "，很ㄅㄧㄤˋ吧 ✨", "，可以先蓋被被瞇一下 🛌", "。偶繼續盯著看板 👀"]
  );
}

export const nextSessionText = (random: Random = Math.random) =>
  mix(
    random,
    ["🛌 換場重新叫號後，", "🍯 這場收了，等店家換場重新叫，", "😴 看板在午休，偶也要午休，"],
    ["偶才算得出幾點輪到你", "偶再幫你算時間", "換場後再幫你算"],
    ["，先去蓋被被等一下。", "，醬子。", "。"]
  );

export const predictionFailedText = (random: Random = Math.random) =>
  mix(
    random,
    ["😵‍💫 挖哩咧，", "🤧 哈啾，", "📜 糟糕，"],
    ["偶的熊鼻子塞住了", "熊熊鼻子過敏", "森林魔法失靈了"],
    ["，算不出時間", "，聞不出時間"],
    ["，晚點再問偶。", "，晚點再試。"]
  );

// ---- cancelling ----

export const cancelGoneText = (random: Random = Math.random) =>
  mix(random, ["訊息不見了", "找不到那則訊息"], ["，偶也沒轍。", "，熊熊抓抓頭 🐻"]);

export const cancelNotOwnerText = (random: Random = Math.random) =>
  mix(
    random,
    ["🗣️ 告老師喔，", "🤨 嗯哼，"],
    ["只有訂閱的人才能取消", "這不是你的號碼牌"],
    ["，你很奇欸。", "，母湯喔。"]
  );

export const cancelNothingText = (random: Random = Math.random) =>
  mix(random, ["你已經沒有叫號通知了", "偶的小本本上沒有你的號碼"], ["，醬子。", "，安安。"]);

export const cancelToastText = (random: Random = Math.random) => mix(random, ["已取消叫號通知 👌", "取消好了 👌", "偶劃掉了 ✏️"]);

export const cancelledText = (target: number, random: Random = Math.random) =>
  mix(
    random,
    ["🚫 哼嗯，", "✏️ 好喔，", "🐻 收到，"],
    [`偶幫你取消 ${b(target)} 號的訂閱了`, `${b(target)} 號偶從小本本劃掉了`],
    ["，醬子。", "，下次再來 👋", "，想再訂隨時跟偶說。"]
  );

// ---- notifications (who is an HTML mention) ----

export const reachedText = (who: string, target: number, random: Random = Math.random) =>
  mix(
    random,
    ["喂～ 👑 ", "叮咚 🔔 ", "注意注意 📢 "],
    [`${who} ，你訂的 ${target} 號到了`, `${who} ，${target} 號叫到你了`, `${who} ，輪到 ${target} 號了`],
    ["，怕的是他。還不快去！", "，拉麵在等你 🍜", "，快衝！🏃"]
  );

export const almostText = (who: string, target: number, current: number, likely: string, random: Random = Math.random) =>
  mix(
    random,
    ["喂～ 🏃 ", "叮咚 ⏰ ", "注意注意 📢 ", "👑 國王熊熊提醒 "],
    [`${who} ，${target} 號快到了`, `${who} ，再一下下就輪到 ${target} 號了`, `${who} ，${target} 號要來了`],
    [`！看板現在 ${b(current)}`, `，現在叫到 ${b(current)}`],
    [`，大概 ${b(likely)} 叫到你`, `，偶看 ${b(likely)} 左右就到你`],
    ["，準備往店門口移動 🏃", "，肚子先準備好 🍜", "，別再滑手機了 🐻", "，皇家拉麵在等你～"]
  );

export const expiredText = (who: string, target: number, random: Random = Math.random) =>
  mix(
    random,
    ["欸 👋 ", "嗚嗚 🐻 "],
    [`${who} ，你的 ${target} 號等太久了，超過五小時偶就幫你取消了`, `${who} ，${target} 號等了五個多小時都沒叫到，偶先幫你取消了`],
    ["，很遜欸。881。", "，熊熊也等到睡著了 😴", "，下次再一起等 👋"]
  );

export const sessionOverText = (who: string, target: number, random: Random = Math.random) =>
  mix(
    random,
    ["欸 👋 ", "嗚嗚 🐻 "],
    [`${who} ，這場收了，店家把號碼重新從頭叫，你的 ${target} 號偶就幫你取消了。`, `${who} ，店家換場重新叫號了，你的 ${target} 號偶先幫你取消。`],
    ["下一場的號碼再打 <code>/number</code> 跟偶說，醬子。", "要等下一場的話，再打 <code>/number</code> 跟偶說 🐻"]
  );

// ---- polls ----

export const voteResultText = (title: string, people: number, random: Random = Math.random) =>
  mix(
    random,
    [`${title} 投票結束`, `${title} 收單了`],
    [`，醬子共 ${people} 個人要ㄘ。🥳`, `，總共 ${people} 個人要ㄘ 🍜`, `，${people} 個人報名，怕的是他 👑`]
  );

export const ramenResultHeader = (title: string, random: Random = Math.random) =>
  mix(random, [`${title} 點餐結果`, `${title} 點好了`], ["，挖賽！🤩", "，喜翻 🍜", "，怕的是他 👑"]);

export const ramenResultFooter = (people: number, random: Random = Math.random) =>
  mix(random, [`共 ${people} 個人`, `一共 ${people} 個人`], ["，醬子。🥳", "，粉口愛 🍜", "，怕的是他 👑"]);

export const stopNotOwnerText = (random: Random = Math.random) =>
  mix(
    random,
    ["🗣️ 告老師喔，", "🤨 嗯哼，"],
    ["只有發起人才能結束投票", "這個投票不是你開的"],
    ["，你很奇欸。", "，母湯喔。"]
  );

export const pollAlreadyClosedText = (random: Random = Math.random) =>
  mix(random, ["這個投票已經結束了", "這個投票早就收單了"], ["，醬子。", "，嗯哼。"]);

// ---- everything else ----

export const greetingText = (random: Random = Math.random) =>
  mix(
    random,
    ["安安，榮勾絲揪來了", "嗷嗚～榮勾絲揪從被被裡探頭了", "👑 國王熊熊榮勾絲揪駕到"],
    ["，怕的是他。有事嗎？", "，今天要ㄘ什麼？"],
    ["\n想訂閱叫號可以打 /number 你的號碼"],
    ["，偶會幫你記著，很ㄅㄧㄤˋ吧 ✨。", "，叫到偶會喊你 🔔"]
  );

export const appButtonText = (random: Random = Math.random) =>
  mix(
    random,
    ["👑 投票紀錄、叫號預測、年度回顧都在這裡", "🐻 想看投票紀錄、叫號預測和年度回顧，點這裡"],
    ["，怕的是他。", "，醬子。", " 🍯"]
  );

export const staleButtonText = (random: Random = Math.random) =>
  mix(random, ["這顆按鈕太舊了", "這顆按鈕偶不認得了"], ["，偶看不懂。", "，熊熊抓抓頭 🐻"]);
