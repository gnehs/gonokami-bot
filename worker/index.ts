import sources from "./sources.generated.json";

type Env = { TGCLOUD_TOKEN: string };

export default {
  async scheduled(_controller: ScheduledController, env: Env) {
    const appId = env.TGCLOUD_TOKEN.split(":")[0];
    const res = await fetch(`https://cloud.telegram.org/${appId}/manage/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TGCLOUD_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ module: "endpoints/tick", sources, args: {}, ctx: {} }),
    });
    const envelope = (await res.json()) as { ok: boolean; description?: string; result?: { result?: unknown; log?: unknown } };
    if (!envelope.ok) throw new Error(`tick failed: ${envelope.description ?? res.status}`);
    console.log(JSON.stringify(envelope.result));
  },
} satisfies ExportedHandler<Env>;
