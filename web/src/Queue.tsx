import { useState, type FormEvent } from "react";
import type { QueueResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { QueueChart } from "./Chart.tsx";
import { formatAgo, formatPredicted, formatTime } from "./format.ts";
import { Card, Empty, ErrorView, SectionTitle, Spinner, toApiError, useRemote } from "./ui.tsx";
import type { ApiError } from "./api.ts";

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
  return (
    <div>
      <Card>
        {reading ? (
          <>
            <p className="text-sm text-hint">目前叫到</p>
            <p className="tabular text-6xl font-bold leading-tight">{reading.number}</p>
            <p className="text-sm text-hint">
              {formatAgo(reading.changedAt)}更新，{formatTime(reading.changedAt)} 換號
            </p>
          </>
        ) : (
          <Empty emoji="😴" title="現在沒有叫號資料">店家可能還沒開張，榮勾斯揪也在蓋被被。</Empty>
        )}
      </Card>

      <SectionTitle>今天的叫號曲線</SectionTitle>
      <Card>
        {today.length >= 2 ? (
          <QueueChart points={today} />
        ) : (
          <p className="py-6 text-center text-sm text-hint">今天還沒有足夠的點可以畫線，晚點再來看看。</p>
        )}
      </Card>

      <SectionTitle>想知道幾點輪到你？</SectionTitle>
      <Card>
        <form onSubmit={submit} className="flex gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
            placeholder="輸入你的號碼 (1001–1200)"
            aria-label="目標號碼"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!valid || busy}
            className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-fg active:brightness-90 disabled:bg-line disabled:text-hint"
          >
            {busy ? "算算中…" : "預測"}
          </button>
        </form>
        {target !== "" && !valid && target.length === 4 && <p className="mt-2 text-sm text-danger">號碼要在 1001 到 1200 之間喔。</p>}
        {formError && <p className="mt-2 text-sm text-danger">{formError.message}</p>}
        {prediction && (
          <p className="mt-3 text-sm">
            <b className="tabular">{prediction.target}</b> 號預計
            <b className="ml-1 text-base">{formatPredicted(prediction.at)}</b> 叫到
          </p>
        )}
      </Card>

      <SectionTitle>我訂閱的號碼</SectionTitle>
      {subscriptions.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-hint">還沒有訂閱。在群組裡跟榮勾斯揪說一聲，到號前他會敲你。</p>
        </Card>
      ) : (
        <Card className="divide-y divide-line !py-1">
          {subscriptions.map((sub, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="tabular text-lg font-semibold">{sub.targetNumber} 號</p>
                <p className="truncate text-xs text-hint">{sub.chatTitle}</p>
              </div>
              <p className="shrink-0 text-sm">{sub.predictedAt ? `預計 ${formatPredicted(sub.predictedAt)}` : "還算不出來"}</p>
            </div>
          ))}
        </Card>
      )}

      {accuracy && (
        <p className="mt-5 px-1 text-center text-xs leading-relaxed text-hint">
          過去 {accuracy.dayCount} 天回測：<b>{Math.round(accuracy.within10MinutesRate * 100)}%</b> 誤差在 10 分鐘內，
          誤差中位數約 {accuracy.medianAbsErrorMinutes.toFixed(1)} 分鐘。
        </p>
      )}
    </div>
  );
}
