export type PollKind = "vote" | "ramen";

export type PollOption = { text: string; voterCount: number };

export const BYE_OPTIONS = ["偶不吃了 😠", "怕的是他 👑", "蓋被被 😴"];

export const VOTE_OPTIONS = ["+1", "+2", "+4"];

export const RAMEN_OPTIONS = [
  "+1 | 🍜 單點",
  "+2 | 🍜 單點",
  "+1 | 🥚 加蛋",
  "+2 | 🥚 加蛋",
  "+1 | ✨ 超值",
  "+2 | ✨ 超值",
];

/** "+2 | 🥚 加蛋" → 2 people of 🥚 加蛋; "+4" → 4 people; the trailing bye option → nobody. */
export function parseOption(text: string): { people: number; item: string | null } {
  const match = /^\+(\d+)\s*(?:\|\s*(.+))?$/.exec(text.trim());
  if (!match) return { people: 0, item: null };
  return { people: Number(match[1]), item: match[2]?.trim() ?? null };
}

export type Tally = { people: number; items: Record<string, number> };

export function tallyChoices(options: string[], chosen: Iterable<{ optionId: number; count: number }>): Tally {
  const tally: Tally = { people: 0, items: {} };
  for (const item of options.map((text) => parseOption(text).item)) {
    if (item) tally.items[item] = 0;
  }
  for (const { optionId, count } of chosen) {
    const option = options[optionId];
    if (option === undefined) continue;
    const { people, item } = parseOption(option);
    tally.people += people * count;
    if (item) tally.items[item] += people * count;
  }
  return tally;
}

export function tallyOptions(options: PollOption[]): Tally {
  return tallyChoices(
    options.map((option) => option.text),
    options.map((option, optionId) => ({ optionId, count: option.voterCount }))
  );
}

export function tallyVoter(options: PollOption[], optionIds: number[]): Tally {
  return tallyChoices(
    options.map((option) => option.text),
    optionIds.map((optionId) => ({ optionId, count: 1 }))
  );
}

export function detectKind(options: { text: string }[]): PollKind {
  return options.some((option) => parseOption(option.text).item) ? "ramen" : "vote";
}
