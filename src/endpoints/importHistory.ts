import { db, EndpointError } from "sdk";
import { chats, observations, polls, pollVotes, queueDays, users } from "../schema.ts";
import { requireOperator, type EndpointContext } from "../lib/guard.ts";
import { setKv } from "../lib/store.ts";

// Rows that already exist are kept, so re-running an import never duplicates nor overwrites live data.
const TABLES = { chats, users, polls, pollVotes, observations, queueDays };

type Input =
  | { table: keyof typeof TABLES; rows: Record<string, unknown>[] }
  | { kv: string; value: unknown };

export default async function (input: Input, ctx: EndpointContext) {
  requireOperator(ctx);
  if ("kv" in input) {
    await setKv(input.kv, input.value);
    return { kv: input.kv };
  }

  const table = TABLES[input.table];
  if (!table || !Array.isArray(input.rows)) throw new EndpointError("Unknown table", { table: input.table });
  if (input.rows.length > 0) await db.insert(table).values(input.rows).onConflictDoNothing();
  return { table: input.table, rows: input.rows.length };
}
