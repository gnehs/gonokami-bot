import { useEffect, useState, type ReactNode } from "react";
import type { ChatSummary, MeResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { Polls } from "./Polls.tsx";
import { Queue } from "./Queue.tsx";
import { Retro } from "./Retro.tsx";
import { Empty, ErrorView, Spinner, useRemote } from "./ui.tsx";

type Tab = "polls" | "queue" | "retro";

// Filled glyphs; evenodd cuts the inner shape out so it shows the glass behind.
const ICONS: Record<Tab, ReactNode> = {
  polls: <path fillRule="evenodd" d="M6.5 3h11A3.5 3.5 0 0 1 21 6.5v11a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 17.5v-11A3.5 3.5 0 0 1 6.5 3zM7.2 12.6l1.4-1.4 2 2 4.9-4.9 1.4 1.4-6.3 6.3z" />,
  queue: <path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM11 7h2v4.6l3 1.8-1 1.7-4-2.4z" />,
  retro: <path d="M12 2.8l2.8 5.7 6.3.9-4.5 4.4 1 6.3L12 17.1l-5.6 3 1-6.3-4.5-4.4 6.3-.9z" strokeLinejoin="round" />,
};

const chatLabel = (chat: ChatSummary, userId: number) => (chat.id === userId ? "私訊" : chat.title);

export function App() {
  const me = useRemote(() => call("me", {}), "me");
  if (me.loading) return <div className="pt-[var(--safe-top)]"><Spinner /></div>;
  if (me.error) return <div className="pt-[var(--safe-top)]"><ErrorView error={me.error} onRetry={me.reload} /></div>;
  return <Shell me={me.data!} />;
}

function Shell({ me }: { me: MeResult }) {
  const [tab, setTab] = useState<Tab>("polls");
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["polls"]));
  const [chatId, setChatId] = useState<number | null>(me.startChatId ?? me.chats[0]?.id ?? null);

  useEffect(() => setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))), [tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "polls", label: "投票紀錄" },
    { id: "queue", label: "叫號" },
    ...(me.retroYear !== null ? [{ id: "retro" as const, label: "年度回顧" }] : []),
  ];
  const activeIndex = tabs.findIndex((t) => t.id === tab);
  const needsChat = tab !== "queue";
  const showChats = needsChat && me.chats.length > 0;

  return (
    <div className="mx-auto max-w-xl">
      {showChats && (
        <nav aria-label="切換群組" className="sticky top-0 z-10 bg-bg" style={{ paddingTop: "var(--safe-top)" }}>
          <div className="overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            <div className="inline-flex gap-0.5 rounded-full bg-fill p-[3px]">
              {me.chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  aria-pressed={chat.id === chatId}
                  onClick={() => setChatId(chat.id)}
                  className="segment max-w-[12rem] shrink-0 truncate rounded-full px-4 py-[7px] text-[15px] font-semibold"
                >
                  {chatLabel(chat, me.user.id)}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      <main
        className="px-4"
        style={{
          paddingTop: showChats ? "0.25rem" : "calc(var(--safe-top) + 0.75rem)",
          paddingBottom: "calc(6.5rem + var(--safe-bottom))",
        }}
      >
        {needsChat && chatId === null ? (
          <Empty bear="hello" title="還沒有可以看的群組">
            先把榮勾絲揪拉進五之神群組，或是私訊他一下，這裡就會有東西了。
          </Empty>
        ) : (
          <>
            <Pane active={tab === "polls"} show={visited.has("polls")}>{chatId !== null && <Polls chatId={chatId} userName={me.user.name} />}</Pane>
            <Pane active={tab === "queue"} show={visited.has("queue")}><Queue /></Pane>
            {me.retroYear !== null && <Pane active={tab === "retro"} show={visited.has("retro")}>{chatId !== null && <div className="mt-3"><Retro chatId={chatId} title={chatLabel(me.chats.find((c) => c.id === chatId)!, me.user.id)} /></div>}</Pane>}
          </>
        )}
      </main>

      <nav
        aria-label="主選單"
        className="fixed inset-x-0 bottom-0 z-20 px-3"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)", paddingLeft: "calc(var(--safe-left) + 0.75rem)", paddingRight: "calc(var(--safe-right) + 0.75rem)" }}
      >
        <div className="glass relative mx-auto flex max-w-md rounded-full p-1.5">
          <span
            aria-hidden="true"
            className="tab-capsule absolute inset-y-1.5 left-1.5 rounded-full"
            style={{ width: `calc((100% - 0.75rem) / ${tabs.length})`, transform: `translateX(${activeIndex * 100}%)` }}
          />
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-semibold"
                style={{ color: active ? "var(--accent)" : "var(--fg)" }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {ICONS[t.id]}
                </svg>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Pane({ active, show, children }: { active: boolean; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <div hidden={!active}>{children}</div>;
}
