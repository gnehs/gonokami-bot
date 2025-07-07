import JsonFileDb from "./db.js";

// Centralised vote database instance
export const voteData = new JsonFileDb("votes.json");

/**
 * Persist (or merge-update) poll information to `votes.json`.
 */
export function updatePollData(id: string, data: any) {
  const polls = voteData.get("polls") || {};
  const poll = polls[id] || {};
  const merged = {
    ...poll,
    ...data,
    update_time: Date.now(),
  };
  // prune noisy fields from Telegram poll object
  delete merged.id;
  delete merged.is_anonymous;
  delete merged.type;
  delete merged.allows_multiple_answers;

  polls[id] = merged;
  voteData.set("polls", polls);
}

/**
 * Parse a ramen-style poll (multiple +1/+2 options) into an aggregated result.
 */
export function parsePollResult(poll: any): {
  count: number;
  result: Record<string, number>;
} {
  const optionsArr: string[] = Array.from(
    new Set(
      poll.options.slice(0, -1).map((x: any) => x.text.split("|")[1].trim())
    )
  );
  const result: Record<string, number> = {};
  optionsArr.forEach((opt) => {
    result[opt] = 0;
  });
  poll.options.slice(0, -1).forEach((x: any) => {
    const option = x.text.split("|")[1].trim();
    const multiplier = Number(x.text.replace("+", "").split("|")[0].trim());
    result[option] += x.voter_count * multiplier;
  });
  const count = Object.values(result).reduce((acc, cur) => acc + cur, 0);
  return {
    count,
    result,
  };
}
