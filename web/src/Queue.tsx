import { useState, type FormEvent, type ReactNode } from "react";
import type { Point, QueueResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { QueueChart } from "./Chart.tsx";
import { formatAgo, formatDateTime, formatPredicted, isToday } from "./format.ts";
import { Empty, ErrorView, Group, IconBubble, Pill, Row, Section, Spinner, toApiError, useRemote } from "./ui.tsx";
import type { ApiError } from "./api.ts";

const glyph = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const TICKET = glyph(<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />);
const CLOCK = glyph(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></>);
const BELL = glyph(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);

/** Tickets called per hour across this session's readings, or null before there is a span to measure. */
function pace(today: Point[]): { called: number; perHour: number } | null {
  if (today.length < 2) return null;
  const sorted = [...today].sort((a, b) => a[1] - b[1]);
  const [n0, m0] = sorted[0];
  const [n1, m1] = sorted[sorted.length - 1];
  if (m1 <= m0) return null;
  return { called: n1 - n0, perHour: ((n1 - n0) / (m1 - m0)) * 60 };
}

export function Queue() {
  const initial = useRemote(() => call("queue", {}), "queue");
  const [override, setOverride] = useState<QueueResult | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);

  if (initial.loading) return <Spinner />;
  if (initial.error) return <ErrorView error={initial.error} onRetry={initial.reload} />;
  const data = override ?? initial.data!;
  const valid = /^\d{4}$/.test(target) && Number(target) >= 1001 && Number(target) <= 1200;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      setOverride(await call("queue", { target }));
    } catch (error) {
      setFormError(toApiError(error));
    } finally {
      setBusy(false);
    }
  }

  const { reading, today, prediction, accuracy, subscriptions } = data;
  const todayPace = pace(today);
  // Outside calling days the board keeps its last number; showing it, or predicting from it, would mislead.
  const calling = reading !== null && isToday(reading.changedAt);
  return (
    <div>
      {calling ? (
        <div className="pb-2 pt-8 text-center">
          <p className="text-[17px] font-semibold">目前叫到</p>
          <p className="num mt-1 text-[76px] font-bold leading-none">
            {reading.number}
            <span className="ml-1 text-[38px] text-hint">號</span>
          </p>
          <p className="mt-3 text-[17px] text-hint">{formatAgo(reading.changedAt)}換號</p>
          {todayPace && (
            <p className="mt-1.5 flex items-center justify-center gap-2 text-[17px]">
              <span className="num font-semibold text-up">+{todayPace.called}</span>
              <Pill tone="up">↑ {todayPace.perHour.toFixed(1)} 號/時</Pill>
              <span className="text-hint">這場</span>
            </p>
          )}
        </div>
      ) : (
        <Empty bear="sleep" title="今天還沒開始叫號">
          {reading
            ? `上次叫到 ${reading.number} 號，是 ${formatDateTime(reading.changedAt)}。開始叫號後這裡會即時更新，醬子。`
            : "店家可能還沒開張，榮勾絲揪也在蓋被被。"}
        </Empty>
      )}

      {calling && (
        <>
          <Section title="這場的叫號曲線">
            <Group className="px-4 pb-3 pt-4">
              {today.length >= 2 ? (
                <QueueChart points={today} />
              ) : (
                <p className="py-6 text-center text-[15px] text-hint">這場還沒有足夠的點可以畫線，晚點再來看看。</p>
              )}
            </Group>
          </Section>

          <Section title="想知道幾點輪到你？">
            <Group>
              <form onSubmit={submit} className="row flex items-center pl-4">
                <span className="mr-3"><IconBubble>{TICKET}</IconBubble></span>
                <span className="row-body flex min-h-[62px] min-w-0 flex-1 items-center gap-3 py-2 mr-3">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[13px] text-hint">你的號碼</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      enterKeyHint="go"
                      value={target}
                      onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
                      placeholder="1001–1200"
                      aria-label="目標號碼"
                      className="num block w-full bg-transparent text-[20px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-soft"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!valid || busy}
                    className="press shrink-0 rounded-full bg-accent px-5 py-2 text-[15px] font-semibold text-accent-fg disabled:bg-fill disabled:text-hint"
                  >
                    {busy ? "算算中…" : "預測"}
                  </button>
                </span>
              </form>
              {prediction && (
                <Row icon={<IconBubble>{CLOCK}</IconBubble>} title={`${prediction.target} 號`} subtitle="預計叫到" value={formatPredicted(prediction.at)} />
              )}
            </Group>
            {target !== "" && !valid && target.length === 4 && <p className="mt-2 px-4 text-[13px] text-danger">號碼要在 1001 到 1200 之間喔。</p>}
            {formError && <p className="mt-2 px-4 text-[13px] text-danger">{formError.message}</p>}
          </Section>
        </>
      )}

      <Section title="我訂閱的號碼">
        {subscriptions.length === 0 ? (
          <Group className="px-6 py-5">
            <p className="text-center text-[15px] text-hint">還沒有訂閱。在群組裡跟榮勾絲揪說一聲，到號前他會敲你。</p>
          </Group>
        ) : (
          <Group>
            {subscriptions.map((sub, i) => (
              <Row
                key={i}
                icon={<IconBubble>{BELL}</IconBubble>}
                title={`${sub.targetNumber} 號`}
                subtitle={sub.chatTitle}
                value={calling && sub.predictedAt ? formatPredicted(sub.predictedAt) : "—"}
                detail={<span className="text-hint">{!calling ? "等開始叫號" : sub.predictedAt ? "預計叫到" : "還算不出來"}</span>}
              />
            ))}
          </Group>
        )}
      </Section>

      {accuracy && (
        <Section title="預測準不準" aside={`回測 ${accuracy.dayCount} 天`}>
          <Group className="px-4 py-4">
            <p className="text-[15px] text-hint">誤差中位數</p>
            <p className="num mt-0.5 text-[34px] font-bold leading-tight">
              {accuracy.medianAbsErrorMinutes.toFixed(1)}
              <span className="ml-1 text-[20px]">分鐘</span>
            </p>
            <p className="mt-2 flex items-center gap-2">
              <Pill tone="up">✓ {Math.round(accuracy.within10MinutesRate * 100)}%</Pill>
              <span className="text-[15px] text-hint">誤差在 10 分鐘內</span>
            </p>
          </Group>
        </Section>
      )}
    </div>
  );
}
