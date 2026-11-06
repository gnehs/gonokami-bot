// The bear's lines for /number, built from interchangeable clauses so the same answer rarely reads twice.

export type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T => list[Math.floor(random() * list.length)];

type Times = { likely: string; earliest: string; latest: string };

// Openers end in "，" or "！", time clauses carry no punctuation, ranges start with "，" or "（",
// closers start with "，" or "。", so any combination reads as one sentence.
const OPENERS = [
  "🐻 偶用熊鼻子聞了一下，",
  "👑 國王熊熊掐指一算，",
  "🍯 偶抱著蜂蜜罐想了想，",
  "🐾 偶翻了一下以前的叫號紀錄，",
  "📜 熊熊翻開皇家叫號簿，",
  "🔍 偶把王冠扶正仔細算了算，",
] as const;

const SOON_OPENERS = [
  "🏃 快輪到你了！",
  "⏰ 注意注意！",
  "🍜 拉麵在招手了！",
  "👑 國王熊熊提醒：快到了！",
] as const;

const TIMES = [
  ({ likely }: Times) => `大概 <b>${likely}</b> 會叫到你`,
  ({ likely }: Times) => `<b>${likely}</b> 左右輪到你`,
  ({ likely }: Times) => `差不多 <b>${likely}</b> 就到你了`,
  ({ likely }: Times) => `你的號碼應該在 <b>${likely}</b> 前後`,
] as const;

// The range holds the actual call about four times in five, hence "八成".
const RANGES = [
  ({ earliest, latest }: Times) => `，最早 ${earliest}、最晚 ${latest}`,
  ({ earliest, latest }: Times) => `（${earliest} 到 ${latest} 之間）`,
  ({ earliest, latest }: Times) => `，八成落在 ${earliest}–${latest}`,
  ({ earliest, latest }: Times) => `，抓 ${earliest}–${latest} 比較保險`,
] as const;

const CLOSERS = [
  "，醬子。",
  "，怕的是他～",
  "，先去晃晃再回來 🍜",
  "，很ㄅㄧㄤˋ吧 ✨",
  "，可以先蓋被被瞇一下 🛌",
  "。偶繼續盯著看板 👀",
] as const;

const SOON_CLOSERS = [
  "，肚子先準備好 🍜",
  "，快往店門口移動！",
  "，別再滑手機了 🐻",
  "，皇家拉麵在等你～",
] as const;

const NEXT_SESSION = [
  "🛌 換場重新叫號後，偶才算得出幾點輪到你，先去蓋被被等一下。",
  "🍯 這場收了，等店家換場重新叫，偶再幫你算時間。",
  "😴 看板在午休，偶也要午休，換場後再幫你算。",
] as const;

const FAILED = [
  "😵‍💫 挖哩咧，偶的熊鼻子塞住了，算不出時間，晚點再問偶。",
  "🤧 熊熊鼻子過敏，今天聞不出時間，晚點再試。",
  "📜 皇家叫號簿翻不開，偶晚點再幫你算。",
] as const;

/** One prediction sentence; `soon` switches to the hurry-up openers and closers. Without a range that part is left out. */
export function predictionText(times: Times, { soon, hasRange }: { soon: boolean; hasRange: boolean }, random: Random = Math.random): string {
  const opener = pick(soon ? SOON_OPENERS : OPENERS, random);
  const time = pick(TIMES, random)(times);
  const range = hasRange ? pick(RANGES, random)(times) : "";
  const closer = pick(soon ? SOON_CLOSERS : CLOSERS, random);
  return opener + time + range + closer;
}

export const nextSessionText = (random: Random = Math.random) => pick(NEXT_SESSION, random);

export const predictionFailedText = (random: Random = Math.random) => pick(FAILED, random);
