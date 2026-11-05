import type { Avatar, MeResult, PollsResult, QueueResult, RetroResult } from "../../src/lib/api-types.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

export type Endpoints = {
  me: { input: Record<string, never>; result: MeResult };
  polls: { input: { chatId: number; before?: number }; result: PollsResult };
  queue: { input: { target?: string }; result: QueueResult };
  retro: { input: { chatId: number }; result: RetroResult };
  avatars: { input: { chatId: number; userIds: number[] }; result: Avatar[] };
};

export async function call<N extends keyof Endpoints>(name: N, input: Endpoints[N]["input"]): Promise<Endpoints[N]["result"]> {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.initData) {
    return new Promise((resolve, reject) => {
      webApp.Serverless.call(name, input, (err, result) => {
        if (err) reject(new ApiError(err.message, err.parameters?.code));
        else resolve(result as Endpoints[N]["result"]);
      });
    });
  }
  if (import.meta.env.DEV) {
    const { mockCall } = await import("./mock.ts");
    return mockCall(name, input) as Promise<Endpoints[N]["result"]>;
  }
  throw new ApiError("請從 Telegram 裡開啟這個小程式", "NO_TELEGRAM");
}
