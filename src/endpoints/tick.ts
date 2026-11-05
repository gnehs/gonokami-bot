import { requireOperator, type EndpointContext } from "../lib/guard.ts";
import { notifySubscribers } from "../lib/number.ts";
import { rollupFinishedDays } from "../lib/rollup.ts";
import { readQueue } from "../lib/store.ts";

export default async function (_input: object, ctx: EndpointContext) {
  requireOperator(ctx);
  const reading = await readQueue();
  const notified = reading ? await notifySubscribers(reading) : 0;
  const rolledUp = await rollupFinishedDays(Date.now());
  return { reading, notified, rolledUp };
}
