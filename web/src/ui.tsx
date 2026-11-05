import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "./api.ts";

export type Remote<T> = { data: T | null; error: ApiError | null; loading: boolean; reload: () => void };

/** Runs `load` whenever `key` changes; stale responses from a previous key are dropped. */
export function useRemote<T>(load: () => Promise<T>, key: string): Remote<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null, loading: true });
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error: toApiError(error), loading: false })
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : "出了點問題");
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-card p-4 ${className}`}>{children}</section>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-5 px-1 text-sm font-semibold text-hint">{children}</h2>;
}

export function Spinner({ label = "載入中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-hint" role="status">
      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      {label}
    </div>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="text-5xl" aria-hidden="true">{emoji}</div>
      <p className="mt-3 text-base font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-hint">{children}</p>}
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.code === "NOT_MEMBER") {
    return (
      <Empty emoji="🚪" title="你不在這個群組裡">
        榮勾斯揪不能偷偷給你看，先加入這個群組再來吧。
      </Empty>
    );
  }
  return (
    <Empty emoji="🐻‍❄️" title="哎呀，出了點狀況">
      {error.message}
      {onRetry && (
        <>
          <br />
          <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg active:brightness-90">
            再試一次
          </button>
        </>
      )}
    </Empty>
  );
}
