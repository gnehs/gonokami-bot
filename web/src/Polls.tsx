import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PollSummary } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { formatDateTime, formatMonth } from "./format.ts";
import { useSwipeBack } from "./gestures.ts";
import { nativeBackButton } from "./theme.ts";
import { Bear, Chip, Empty, ErrorView, Group, IconBubble, Pill, Row, Section, Spinner, toApiError } from "./ui.tsx";
import type { ApiError } from "./api.ts";

type Page = { polls: PollSummary[]; nextBefore: number | null; error: ApiError | null; loading: boolean };
/** `open: false` keeps the panel mounted while it slides out. */
type Detail = { poll: PollSummary; open: boolean } | null;

const CLOSE_MS = 260;

export function Polls({ chatId, userName }: { chatId: number; userName: string }) {
  const [page, setPage] = useState<Page>({ polls: [], nextBefore: null, error: null, loading: true });
  const [detail, setDetail] = useState<Detail>(null);
  const generation = useRef(0);

  const load = useCallback(
    (before?: number) => {
      const mine = ++generation.current;
      setPage((p) => ({ ...p, loading: true, error: null }));
      call("polls", before === undefined ? { chatId } : { chatId, before }).then(
        (result) => {
          if (mine !== generation.current) return;
          setPage((p) => ({
            polls: before === undefined ? result.polls : [...p.polls, ...result.polls],
            nextBefore: result.nextBefore,
            error: null,
            loading: false,
          }));
        },
        (error) => {
          if (mine !== generation.current) return;
          setPage((p) => ({ ...p, loading: false, error: toApiError(error) }));
        }
      );
    },
    [chatId]
  );

  useEffect(() => {
    setPage({ polls: [], nextBefore: null, error: null, loading: true });
    setDetail(null);
    load();
  }, [load]);

  const closeDetail = useCallback(() => setDetail((d) => d && { ...d, open: false }), []);
  useEffect(() => {
    if (detail?.open !== false) return;
    const timer = setTimeout(() => setDetail(null), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [detail]);

  const sentinel = useRef<HTMLDivElement>(null);
  const canMore = page.nextBefore !== null && !page.loading && !page.error;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && load(page.nextBefore!), { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canMore, page.nextBefore, load]);

  const greeting = <Greeting name={userName} />;
  if (page.error && page.polls.length === 0) return <>{greeting}<ErrorView error={page.error} onRetry={() => load()} /></>;
  if (page.loading && page.polls.length === 0) return <>{greeting}<Spinner /></>;
  if (page.polls.length === 0) {
    return (
      <>
        {greeting}
        <Empty bear="sleep" title="這裡還沒有投票">
          醬子冷冷清清的，快在群組裡揪個午餐，怕的是他沒人跟。
        </Empty>
      </>
    );
  }

  return (
    <>
      {greeting}
      {byMonth(page.polls).map(([month, polls]) => (
        <Section key={month} title={month}>
          <Group>
            {polls.map((poll) => (
              <Row
                key={poll.id}
                icon={<PollIcon poll={poll} />}
                title={poll.question}
                subtitle={formatDateTime(poll.createdAt)}
                footer={<ItemChips poll={poll} className="mt-2" />}
                value={`${poll.tally.people} 人`}
                detail={<span className={poll.isClosed ? "text-hint" : "text-up"}>{poll.isClosed ? "已結束" : "進行中"}</span>}
                onClick={() => setDetail({ poll, open: true })}
              />
            ))}
          </Group>
        </Section>
      ))}
      {page.error && <ErrorView error={page.error} onRetry={() => load(page.nextBefore ?? undefined)} />}
      {page.loading && <Spinner />}
      {canMore && (
        <div ref={sentinel} className="pt-4 text-center">
          <button type="button" onClick={() => load(page.nextBefore!)} className="press rounded-full bg-card px-6 py-2.5 text-[15px] font-semibold text-accent">
            載入更多
          </button>
        </div>
      )}
      {page.nextBefore === null && !page.loading && <p className="py-6 text-center text-[15px] text-hint">已經到底囉，再翻就是考古了</p>}
      {detail && <PollDetail poll={detail.poll} open={detail.open} onClose={closeDetail} />}
    </>
  );
}

/** `openCount` is null until the first page arrives, so the right side never shows a guess. */
/** Polls arrive newest first, so each month's group stays in order as pages append. */
function byMonth(polls: PollSummary[]): [string, PollSummary[]][] {
  const groups = new Map<string, PollSummary[]>();
  for (const poll of polls) {
    const month = formatMonth(poll.createdAt);
    groups.set(month, [...(groups.get(month) ?? []), poll]);
  }
  return [...groups];
}

function Greeting({ name }: { name: string }) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return (
    <Group className="mt-2 flex min-h-[80px] items-center gap-3 px-4 py-3">
      <Bear pose="hello" size={52} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[19px] font-bold leading-snug">嗨 {firstName}</p>
        <p className="mt-0.5 truncate text-[15px] text-hint">今天要ㄘ什麼？怕的是他</p>
      </div>
    </Group>
  );
}

function PollIcon({ poll, size }: { poll: PollSummary; size?: number }) {
  return (
    <IconBubble size={size} tone={poll.kind === "ramen" ? "soft" : "accent"}>
      {poll.kind === "ramen" ? (
        "🍜"
      ) : (
        <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </IconBubble>
  );
}

function ItemChips({ poll, className = "" }: { poll: PollSummary; className?: string }) {
  const items = Object.entries(poll.tally.items).filter(([, count]) => count > 0);
  if (items.length === 0) return null;
  return (
    <span className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map(([item, count]) => (
        <Chip key={item}>
          {item} <b className="num">{count}</b>
        </Chip>
      ))}
    </span>
  );
}

function PollDetail({ poll, open, onClose }: { poll: PollSummary; open: boolean; onClose: () => void }) {
  const native = nativeBackButton();
  useEffect(() => {
    if (!native || !open) return;
    native.show();
    native.onClick(onClose);
    return () => {
      native.offClick(onClose);
      native.hide();
    };
  }, [native, open, onClose]);

  const swipe = useSwipeBack<HTMLDivElement>(onClose);
  const hasItems = Object.values(poll.tally.items).some((count) => count > 0);
  return (
    <div
      ref={swipe.ref}
      {...swipe.handlers}
      role="dialog"
      aria-modal="true"
      aria-label={poll.question}
      data-open={open}
      className="sheet fixed inset-0 z-40 touch-pan-y overflow-y-auto overscroll-contain bg-bg"
    >
      <div
        className="mx-auto max-w-xl px-4"
        style={{
          paddingTop: "calc(var(--safe-top) + 0.75rem)",
          paddingBottom: "calc(var(--safe-bottom) + 2rem)",
          paddingLeft: "calc(var(--safe-left) + 1rem)",
          paddingRight: "calc(var(--safe-right) + 1rem)",
        }}
      >
        {!native && (
          <button
            type="button"
            onClick={onClose}
            aria-label="返回投票紀錄"
            className="press glass flex size-11 items-center justify-center rounded-full"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}

        <div className="mt-6 flex items-center gap-3 px-1">
          <PollIcon poll={poll} size={36} />
          <h1 className="min-w-0 break-words text-[20px] font-semibold leading-snug">{poll.question}</h1>
        </div>
        <p className="num mt-3 px-1 text-[64px] font-bold leading-none">
          {poll.tally.people}
          <span className="ml-1.5 text-[34px]">人</span>
        </p>
        <p className="mt-2 px-1 text-[17px] text-hint">{poll.voters.length} 位投票</p>

        <Group className="mt-6">
          <Field label="狀態">
            <Pill tone={poll.isClosed ? "neutral" : "up"}>{poll.isClosed ? "已結束" : "進行中"}</Pill>
          </Field>
          <Field label="日期">{formatDateTime(poll.createdAt)}</Field>
          {hasItems && (
            <Field label="品項">
              <ItemChips poll={poll} className="mt-1" />
            </Field>
          )}
        </Group>

        {poll.voters.length > 0 && (
          <Section title="投票名單" aside={`${poll.voters.length} 位`}>
            <Group>
              {poll.voters.map((voter) => (
                <Row
                  key={voter.userId}
                  icon={<IconBubble>{Array.from(voter.name)[0]}</IconBubble>}
                  title={voter.name}
                  subtitle={voter.choices.join("、")}
                  value={`${voter.people} 人`}
                />
              ))}
            </Group>
          </Section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row pl-4">
      <div className="row-body py-3 mr-4">
        <p className="text-[15px] text-hint">{label}</p>
        <div className="mt-0.5 text-[17px]">{children}</div>
      </div>
    </div>
  );
}
