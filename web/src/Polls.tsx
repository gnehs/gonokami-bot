import { useCallback, useEffect, useRef, useState } from "react";
import type { PollSummary } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { formatDateTime } from "./format.ts";
import { Empty, ErrorView, Spinner, toApiError } from "./ui.tsx";
import type { ApiError } from "./api.ts";

type Page = { polls: PollSummary[]; nextBefore: number | null; error: ApiError | null; loading: boolean };

export function Polls({ chatId }: { chatId: number }) {
  const [page, setPage] = useState<Page>({ polls: [], nextBefore: null, error: null, loading: true });
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
    load();
  }, [load]);

  const sentinel = useRef<HTMLDivElement>(null);
  const canMore = page.nextBefore !== null && !page.loading && !page.error;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && load(page.nextBefore!), { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canMore, page.nextBefore, load]);

  if (page.error && page.polls.length === 0) return <ErrorView error={page.error} onRetry={() => load()} />;
  if (page.loading && page.polls.length === 0) return <Spinner />;
  if (page.polls.length === 0) {
    return (
      <Empty emoji="🍜" title="這裡還沒有投票">
        醬子冷冷清清的，快在群組裡揪個午餐，怕的是他沒人跟。
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {page.polls.map((poll) => (
        <PollCard key={poll.id} poll={poll} />
      ))}
      {page.error && <ErrorView error={page.error} onRetry={() => load(page.nextBefore ?? undefined)} />}
      {page.loading && <Spinner />}
      {canMore && (
        <div ref={sentinel} className="py-2 text-center">
          <button type="button" onClick={() => load(page.nextBefore!)} className="rounded-full bg-card px-5 py-2 text-sm font-medium text-accent active:brightness-95">
            載入更多
          </button>
        </div>
      )}
      {page.nextBefore === null && !page.loading && <p className="py-4 text-center text-sm text-hint">已經到底囉，再翻就是考古了</p>}
    </div>
  );
}

function PollCard({ poll }: { poll: PollSummary }) {
  const [open, setOpen] = useState(false);
  const items = Object.entries(poll.tally.items);
  return (
    <article className="rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-base font-semibold leading-snug">{poll.question}</h3>
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${poll.isClosed ? "bg-line text-hint" : "bg-accent text-accent-fg"}`}
        >
          {poll.isClosed ? "已結束" : "進行中"}
        </span>
      </div>
      <p className="mt-1 text-xs text-hint">{formatDateTime(poll.createdAt)}</p>

      <p className="mt-3 text-sm">
        共 <b className="tabular text-lg">{poll.tally.people}</b> 人
      </p>
      {poll.kind === "ramen" && items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map(([item, count]) => (
            <li key={item} className="rounded-full border border-line px-3 py-1 text-sm">
              {item} <b className="tabular">{count}</b>
            </li>
          ))}
        </ul>
      )}

      {poll.voters.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-3 flex w-full items-center gap-1 text-sm font-medium text-accent"
          >
            {open ? "收起名單" : `看誰投了 (${poll.voters.length})`}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? "rotate-180" : ""}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {open && (
            <ul className="mt-2 divide-y divide-line">
              {poll.voters.map((voter) => (
                <li key={voter.userId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{voter.name}</span>
                    <span className="ml-2 break-words text-hint">{voter.choices.join("、")}</span>
                  </span>
                  <span className="tabular shrink-0 text-hint">{voter.people} 人</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}
