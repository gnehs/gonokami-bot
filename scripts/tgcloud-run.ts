import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODULE_ROOT = path.join(ROOT, "tgcloud");

/** Same module map `tgcloud run` sends: every compiled .js under tgcloud/, keyed by module name. */
export function collectSources(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const file of fs.readdirSync(MODULE_ROOT, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".js")) continue;
    sources[file.split(path.sep).join("/").slice(0, -3)] = fs.readFileSync(path.join(MODULE_ROOT, file), "utf8");
  }
  if (!sources.schema) throw new Error("tgcloud/ is empty; run `pnpm build:cloud` first");
  return sources;
}

export function resolveToken(): string {
  if (process.env.TGCLOUD_TOKEN) return process.env.TGCLOUD_TOKEN;
  const credentials = path.join(ROOT, ".tgcloud", "credentials");
  if (fs.existsSync(credentials)) return JSON.parse(fs.readFileSync(credentials, "utf8")).token;
  throw new Error("No tgcloud token: run `pnpm exec tgcloud login` or set TGCLOUD_TOKEN");
}

export async function runModule(token: string, module: string, sources: Record<string, string>, args: object) {
  const appId = token.split(":")[0];
  const res = await fetch(`https://cloud.telegram.org/${appId}/manage/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ module, sources, args, ctx: {} }),
  });
  const envelope = await res.json();
  if (!envelope.ok) throw new Error(`${module}: ${envelope.description ?? res.status}`);
  return envelope.result;
}
