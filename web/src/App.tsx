import { useEffect, useState, type ReactNode } from "react";
import type { ChatSummary, MeResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { Polls } from "./Polls.tsx";
import { Queue } from "./Queue.tsx";
import { Retro } from "./Retro.tsx";
import { Empty, ErrorView, Spinner, useRemote } from "./ui.tsx";

type Tab = "polls" | "queue" | "retro";

const ICONS: Record<Tab, ReactNode> = {
  polls: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  queue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  retro: (
    <>
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </>
  ),
};

const chatLabel = (chat: ChatSummary, userId: number) => (chat.id === userId ? "私訊" : chat.title);

export function App() {
  const me = useRemote(() => call("me", {}), "me");
  if (me.loading) return <Spinner />;
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
  const needsChat = tab !== "queue";
  const showChats = needsChat && me.chats.length > 0;

  return (
    <div className="mx-auto max-w-xl">
      {showChats && (
        <nav aria-label="切換群組" className="sticky top-0 z-10 bg-bg" style={{ paddingTop: "var(--safe-top)" }}>
          <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {me.chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                aria-pressed={chat.id === chatId}
                onClick={() => setChatId(chat.id)}
                className={`max-w-[12rem] shrink-0 truncate rounded-full px-4 py-1.5 text-sm font-medium ${
                  chat.id === chatId ? "bg-accent text-accent-fg" : "bg-card text-fg"
                }`}
              >
                {chatLabel(chat, me.user.id)}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main
        className="px-4"
        style={{
          paddingTop: showChats ? "0.25rem" : "calc(var(--safe-top) + 0.75rem)",
          paddingBottom: "calc(5.5rem + var(--safe-bottom))",
        }}
      >
        <p className="mb-3 px-1 text-sm text-hint">Hi {me.user.name}，榮勾斯揪來報到</p>
        {needsChat && chatId === null ? (
          <Empty emoji="🐻" title="還沒有可以看的群組">
            先把榮勾斯揪拉進五之神群組，或是私訊他一下，這裡就會有東西了。
          </Empty>
        ) : (
          <>
            <Pane active={tab === "polls"} show={visited.has("polls")}>{chatId !== null && <Polls chatId={chatId} />}</Pane>
            <Pane active={tab === "queue"} show={visited.has("queue")}><Queue /></Pane>
            {me.retroYear !== null && <Pane active={tab === "retro"} show={visited.has("retro")}>{chatId !== null && <Retro chatId={chatId} title={chatLabel(me.chats.find((c) => c.id === chatId)!, me.user.id)} />}</Pane>}
          </>
        )}
      </main>

      <nav
        aria-label="主選單"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg"
        style={{ paddingBottom: "var(--safe-bottom)", paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)" }}
      >
        <div className="mx-auto flex max-w-xl">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium"
                style={{ color: active ? "var(--accent)" : "var(--hint)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
