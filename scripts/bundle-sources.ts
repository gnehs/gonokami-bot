// Freezes the compiled tgcloud modules into the cron Worker, since /run executes the sources it is sent.
import fs from "node:fs";
import path from "node:path";
import { collectSources } from "./tgcloud-run.ts";

const out = path.resolve(import.meta.dirname, "../worker/sources.generated.json");
fs.writeFileSync(out, JSON.stringify(collectSources()));
console.log(`wrote ${out}`);
