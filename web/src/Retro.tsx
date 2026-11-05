import type { ReactNode } from "react";
import type { ChatRetro, RetroResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { formatDate, formatDayKey, formatMinuteOfDay } from "./format.ts";
import { Empty, ErrorView, Spinner, useRemote } from "./ui.tsx";
import "./retro.css";

const FOGS = ["01", "03", "05", "07"];
const DONUT_COLORS = ["#0369a1", "#7dd3fc", "#0ea5e9", "#075985", "#bae6fd", "#38bdf8"];

function Card({ index, title, subtitle, children }: { index: number; title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="retro-card" data-title={title}>
      <img className="retro-fog" src={`/fog/${FOGS[index % FOGS.length]}.jpg`} alt="" />
      <div className="retro-noise" />
      {title && <h2 className="retro-title">{title}</h2>}
      {subtitle && <p className="retro-sub">{subtitle}</p>}
      {children}
    </section>
  );
}

function Tile({ name, value, unit }: { name: string; value: string | number; unit?: string }) {
  return (
    <div className="retro-tile">
      <div className="retro-tile-name">{name}</div>
      <div className="retro-tile-value">
        {value}
        {unit && <span className="retro-tile-unit">{unit}</span>}
      </div>
    </div>
  );
}

function BarList({ rows }: { rows: { key: number; name: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="retro-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="retro-bar-name" title={row.name}>{row.name}</span>
          <div className="retro-bar" style={{ width: `${(row.value / max) * 100}%` }}>{row.value}</div>
        </li>
      ))}
    </ol>
  );
}

/** Index of the week (0-based, 1–7 January first) containing the 1st of each month. */
function monthStartWeeks(year: number): number[] {
  return Array.from({ length: 12 }, (_, m) => Math.floor((Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)) / 86_400_000 / 7));
}

function Heatmap({ chat }: { chat: ChatRetro }) {
  const voters = chat.voters.filter((v) => v.pollsJoined > 0);
  const starts = monthStartWeeks(chat.year);
  const labelAt = new Map(starts.map((week, m) => [week, `${m + 1}月`]));
  return (
    <>
      <div className="retro-scroll">
        <div className="retro-heat">
          <div className="retro-heat-row" aria-hidden="true">
            <span className="retro-heat-name" />
            {Array.from({ length: 53 }, (_, w) => (
              <span key={w} className="retro-heat-month" style={{ gridColumn: w + 2, gridRow: 1 }}>{labelAt.get(w)}</span>
            ))}
          </div>
          {voters.map((voter) => (
            <div key={voter.userId} className="retro-heat-row">
              <span className="retro-heat-name" title={voter.name}>{voter.name}</span>
              {voter.weekCounts.map((n, w) => (
                <span key={w} className="retro-cell" data-n={Math.min(n, 3)} title={`第 ${w + 1} 週 · ${n} 次`} />
              ))}
              <span className="retro-heat-count">{voter.weekCounts.filter((n) => n > 0).length}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="retro-legend">
        少
        {[0, 1, 2, 3].map((n) => <span key={n} className="retro-cell" data-n={n} />)}
        多
      </div>
    </>
  );
}

function Columns({ values, labels, wide }: { values: number[]; labels: string[]; wide?: boolean }) {
  const max = Math.max(1, ...values);
  const colMin = wide ? "1.125rem" : "0";
  return (
    <div className={wide ? "retro-scroll" : undefined}>
      <div style={wide ? { width: "max-content", minWidth: "100%" } : undefined}>
        <div className="retro-columns">
          {values.map((v, i) => (
            <div key={i} className="retro-col" style={{ minWidth: colMin }} title={labels[i]}>
              <span className="retro-col-val">{v}</span>
              <div className="retro-col-fill" style={{ height: `${(v / max) * 82}%`, minHeight: v > 0 ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="retro-axis">
          {labels.map((label, i) => <span key={i} style={{ minWidth: colMin }}>{label}</span>)}
        </div>
      </div>
    </div>
  );
}

function Donut({ entries }: { entries: [string, number][] }) {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <>
      <div className="retro-donut-wrap">
        <svg viewBox="0 0 100 100" width="100%" role="img" aria-label="品項占比">
          <g transform="rotate(-90 50 50)" fill="none" strokeWidth="16">
            {entries.map(([item, n], i) => {
              const len = (n / total) * c;
              const circle = (
                <circle key={item} cx="50" cy="50" r={r} stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
              );
              offset += len;
              return circle;
            })}
          </g>
        </svg>
        <div className="retro-donut-center">
          <span style={{ fontSize: "1.75rem", fontVariantNumeric: "tabular-nums" }}>{total}</span>
          <span style={{ fontSize: "0.8125rem", color: "var(--r-muted)" }}>份</span>
        </div>
      </div>
      <ul className="retro-donut-list">
        {entries.map(([item, n], i) => (
          <li key={item}>
            <span className="retro-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{item}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{n} 份 · {Math.round((n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const Big = ({ children, unit }: { children: ReactNode; unit?: string }) => (
  <p className="retro-big" style={{ margin: 0 }}>
    {children}
    {unit && <small>{unit}</small>}
  </p>
);

export function Retro({ chatId, title }: { chatId: number; title: string }) {
  const { data, error, loading, reload } = useRemote<RetroResult>(() => call("retro", { chatId }), `retro:${chatId}`);
  if (loading) return <Spinner label="榮勾斯揪翻舊帳中…" />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  const { chat, queue } = data!;
  if (chat.pollCount === 0) {
    return (
      <Empty emoji="🫥" title={`${chat.year} 年這裡沒有投票`}>
        今年沒揪過團，回顧只好空空的。明年再一起吃，醬子。
      </Empty>
    );
  }

  let i = 0;
  const topJoined = chat.voters.slice(0, 15).map((v) => ({ key: v.userId, name: v.name, value: v.pollsJoined }));
  const topQQ = chat.voters
    .filter((v) => v.qqCount > 0)
    .sort((a, b) => b.qqCount - a.qqCount)
    .slice(0, 10)
    .map((v) => ({ key: v.userId, name: v.name, value: v.qqCount }));
  const items = Object.entries(chat.itemTotals).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  const g = chat.gatherings;
  const gPeople = g.map((x) => x.people);
  const gTop = g.reduce((best, x) => (x.people > best.people ? x : best), g[0]);
  let lastMonth = -1;
  const gLabels = g.map((x) => {
    const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", month: "numeric" }).format(x.createdAt));
    const label = month !== lastMonth ? `${month}月` : "";
    lastMonth = month;
    return label;
  });
  const gTitles = g.map((x) => `${formatDate(x.createdAt)} · ${x.people} 人`);

  const active = chat.monthPeople.map((n, m) => ({ n, m })).filter((x) => x.n > 0);
  const monthLow = active.reduce((a, b) => (b.n < a.n ? b : a), active[0]);
  const monthHigh = active.reduce((a, b) => (b.n > a.n ? b : a), active[0]);
  const monthAvg = active.reduce((s, x) => s + x.n, 0) / (active.length || 1);

  return (
    <div className="retro">
      <Card index={i++}>
        <div className="retro-hero">
          <div style={{ fontSize: "5rem", lineHeight: 1 }}>🍜</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "100%" }}>
            <div className="retro-hero-name">{title}</div>
            <div style={{ fontSize: "2.25rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--r-muted)" }}>{chat.year}</div>
            <div style={{ fontSize: "1.5rem", color: "var(--r-muted)" }}>年度回顧</div>
          </div>
        </div>
      </Card>

      {topJoined.length > 0 && (
        <Card index={i++} title="誰來最多次？">
          <BarList rows={topJoined} />
        </Card>
      )}

      {chat.voters.some((v) => v.pollsJoined > 0) && (
        <Card index={i++} title="誰來最多週？" subtitle="每格是一週，顏色越深代表那週去越多次">
          <Heatmap chat={chat} />
        </Card>
      )}

      {topQQ.length > 0 && (
        <Card index={i++} title="誰 QQ 最多次？">
          <BarList rows={topQQ} />
        </Card>
      )}

      {g.length > 0 && (
        <Card index={i++} title="哪次最多人來？">
          <Columns values={gPeople} labels={gLabels} wide />
          <div className="retro-tiles">
            <Tile name="最低" value={Math.min(...gPeople)} unit="人" />
            <Tile name="平均人數" value={(gPeople.reduce((s, n) => s + n, 0) / gPeople.length).toFixed(2)} unit="人" />
            <Tile name="最高" value={Math.max(...gPeople)} unit="人" />
            <Tile name="最多人" value={formatDate(gTop.createdAt)} />
          </div>
        </Card>
      )}

      {active.length > 0 && (
        <Card index={i++} title="哪個月最多人來？">
          <Columns values={chat.monthPeople} labels={chat.monthPeople.map((_, m) => `${m + 1}月`)} />
          <div className="retro-tiles three">
            <Tile name="最低" value={`${monthLow.m + 1}月`} unit={`${monthLow.n} 人`} />
            <Tile name="平均" value={monthAvg.toFixed(1)} unit="人" />
            <Tile name="最高" value={`${monthHigh.m + 1}月`} unit={`${monthHigh.n} 人`} />
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <Card index={i++} title="哪種最多人吃？">
          <Donut entries={items} />
        </Card>
      )}

      <Card index={i++} title="你">
        {chat.me ? (
          <div className="retro-center">
            <Big unit="名">{chat.me.rank}</Big>
            <p className="retro-note" style={{ fontSize: "1.125rem", color: "var(--r-text)" }}>
              去了 {chat.me.pollsJoined} 次，一共吃了 {chat.me.people} 人份
            </p>
            <p className="retro-note">
              {chat.me.qqCount > 0 ? `QQ 了 ${chat.me.qqCount} 次。` : "一次都沒 QQ，很穩。"}
              {chat.me.favoriteItem ? `最愛點 ${chat.me.favoriteItem}，口味很堅定。` : "還沒點過特定品項，路過打個醬油也行。"}
            </p>
          </div>
        ) : (
          <div className="retro-center">
            <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>今年沒看到你</p>
            <p className="retro-note">你今年沒有參加過這個群組的投票，偶不吃了？</p>
          </div>
        )}
      </Card>

      {queue.openDays > 0 && (
        <>
          <Card index={i++} title={`${queue.year} 五之神開了`}>
            <div className="retro-center"><Big unit="天">{queue.openDays}</Big></div>
          </Card>
          {queue.medianLastNumber !== null && (
            <Card index={i++} title="最後通常叫到">
              <div className="retro-center">
                <Big unit="號">{queue.medianLastNumber}</Big>
                <p className="retro-note">每天最後一個號碼的中位數。</p>
              </div>
            </Card>
          )}
          {queue.busiestDay && (
            <Card index={i++} title="最瘋狂的一天">
              <div className="retro-center">
                <Big>{formatDayKey(queue.busiestDay.date)}</Big>
                <p className="retro-note">一路叫到 {queue.busiestDay.lastNumber} 號，隊伍超長。</p>
              </div>
            </Card>
          )}
          {queue.earliestOpen && (
            <Card index={i++} title="最早開門的一天">
              <div className="retro-center">
                <Big>{formatMinuteOfDay(queue.earliestOpen.minute)}</Big>
                <p className="retro-note">{formatDayKey(queue.earliestOpen.date)} 這天最早開始叫號。</p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
