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

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-4">
        <h2 className="text-[17px] font-semibold text-hint">{title}</h2>
        {aside && <div className="shrink-0 text-[15px] text-hint">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** An inset grouped card, the container every Wallet list lives in. */
export function Group({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[22px] bg-card ${className}`}>{children}</div>;
}

export function IconBubble({
  children,
  size = 40,
  tone = "accent",
}: {
  children: ReactNode;
  size?: number;
  tone?: "accent" | "soft";
}) {
  return (
    <span
      aria-hidden="true"
      className={`${tone === "soft" ? "icon-bubble-soft" : "icon-bubble"} flex shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {children}
    </span>
  );
}

type RowProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
};

/** A grouped-list row; consecutive rows get a hairline that starts past the icon. */
export function Row({ icon, title, subtitle, value, detail, footer, onClick }: RowProps) {
  const body = (
    <>
      {icon && <span className="mr-3">{icon}</span>}
      <span className="row-body flex min-h-[62px] min-w-0 flex-1 items-center gap-3 py-2.5 mr-4">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[17px] font-medium leading-snug">{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-[15px] leading-snug text-hint">{subtitle}</span>}
          {footer}
        </span>
        {(value !== undefined || detail) && (
          <span className="shrink-0 text-right">
            {value !== undefined && <span className="num block text-[17px] font-semibold leading-snug">{value}</span>}
            {detail && <span className="mt-0.5 block text-[15px] leading-snug">{detail}</span>}
          </span>
        )}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="row row-tap flex w-full items-center pl-4 text-left">
      {body}
    </button>
  ) : (
    <div className="row flex w-full items-center pl-4">{body}</div>
  );
}

export function Pill({ tone, children }: { tone: "up" | "down" | "neutral"; children: ReactNode }) {
  return <span className={`pill-${tone} num inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[15px] font-semibold`}>{children}</span>;
}

/** Tinted so it reads against the card in both schemes; callers pass only non-zero counts. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none">{children}</span>;
}

export function Spinner({ label = "載入中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[15px] text-hint" role="status">
      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      {label}
    </div>
  );
}

export type BearPose = "hello" | "sleep" | "ramen" | "confused" | "crown";

/** The 榮勾絲揪 mascot; until /bear/<pose>.png exists (or if it fails), a 🐻 in a soft circle stands in. */
export function Bear({ pose, size = 48 }: { pose: BearPose; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full bg-fill" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        🐻
      </span>
    );
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}bear/${pose}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="shrink-0 select-none object-contain"
      style={{ width: size, height: size }}
    />
  );
}

type EmptyProps = { title: string; children?: ReactNode } & ({ emoji: string } | { bear: BearPose });

export function Empty(props: EmptyProps) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      {"bear" in props ? (
        <Bear pose={props.bear} size={96} />
      ) : (
        <div className="flex size-20 items-center justify-center rounded-full bg-card text-[40px]" aria-hidden="true">
          {props.emoji}
        </div>
      )}
      <p className="mt-4 text-[20px] font-bold">{props.title}</p>
      {props.children && <div className="mt-1.5 text-[15px] leading-relaxed text-hint">{props.children}</div>}
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.code === "NOT_MEMBER") {
    return (
      <Empty bear="confused" title="你不在這個群組裡">
        榮勾絲揪不能偷偷給你看，先加入這個群組再來吧。
      </Empty>
    );
  }
  return (
    <Empty bear="confused" title="哎呀，出了點狀況">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press mt-5 rounded-full bg-accent px-7 py-3 text-[17px] font-semibold text-accent-fg">
          再試一次
        </button>
      )}
    </Empty>
  );
}
