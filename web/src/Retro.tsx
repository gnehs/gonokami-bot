import { useId, type ReactNode } from "react";
import type { ChatRetro, RetroResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { formatDate, formatDayKey, formatMinuteOfDay } from "./format.ts";
import { Empty, ErrorView, Spinner, useRemote } from "./ui.tsx";
import "./retro.css";

const TOPPING_GRAYS = ["#262626", "#8a8a8a", "#c9c9c6", "#4f4f4f", "#adadaa", "#6b6b6b"];
const SHOP = "五之神製作所台灣";

function Ticket({ children }: { children: ReactNode }) {
  return <section className="retro-ticket">{children}</section>;
}

const Perf = () => <div className="retro-perf" aria-hidden="true" />;

function Section({ no, year, title, meta, children }: { no: number; year: number; title: string; meta: string; children: ReactNode }) {
  return (
    <Ticket>
      <header className="retro-head">
        <p className="retro-shop">
          {year} 年度回顧　No. {String(no).padStart(3, "0")}
        </p>
        <h2 className="retro-title">{title}</h2>
        <p className="retro-meta">{meta}</p>
      </header>
      <Perf />
      {children}
    </Ticket>
  );
}

/** "YYYY/MM/DD HH:mm" in Taipei time, the way the shop's ticket printer stamps it. */
function printedAt(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(ms)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** Decorative QR-looking pattern; it encodes nothing. */
function FakeQr({ seed }: { seed: string }) {
  const n = 25;
  let h = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const next = () => (h = (h * 1664525 + 1013904223) >>> 0) / 4294967296;
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  const cells: string[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && next() < 0.48) cells.push(`M${x} ${y}h1v1h-1z`);
  const finder = (x: number, y: number) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg className="retro-qr" viewBox={`-1 -1 ${n + 2} ${n + 2}`} aria-hidden="true" shapeRendering="crispEdges">
      <path d={cells.join("") + finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7)} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function Leader({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="retro-leader">
      <span className="retro-leader-label">{label}</span>
      <span className="retro-leader-dots" aria-hidden="true" />
      <span className="retro-leader-value">{children}</span>
    </div>
  );
}

/** Hand-pressed seal: four characters read top-to-bottom, right column first. */
function Stamp({ chars, band, round }: { chars: string; band?: string; round?: boolean }) {
  const id = useId();
  const [a, b, c, d] = [...chars];
  const top = band ? 30 : 36;
  const step = band ? 30 : 34;
  return (
    <svg className={`retro-stamp${round ? " round" : ""}`} viewBox="0 0 100 100" role="img" aria-label={band ? `${chars} ${band}` : chars}>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 3.9" result="speckle" />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" result="inked" />
          <feDisplacementMap in="inked" in2="noise" scale="3" />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="currentColor" stroke="currentColor">
        {round ? (
          <>
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="5" />
            <circle cx="50" cy="50" r="38.5" fill="none" strokeWidth="1.5" />
          </>
        ) : (
          <rect x="5" y="5" width="90" height="90" rx="6" fill="none" strokeWidth="5" />
        )}
        <g stroke="none" fontSize={band ? 26 : 27} fontWeight="900" textAnchor="middle" className="retro-stamp-text">
          <text x="66" y={top + 2}>{a}</text>
          <text x="66" y={top + step}>{b}</text>
          <text x="34" y={top + 2}>{c}</text>
          <text x="34" y={top + step}>{d}</text>
        </g>
        {band && (
          <>
            <rect x="5" y="70" width="90" height="25" stroke="none" />
            <text x="50" y="89" fontSize="16" fontWeight="900" textAnchor="middle" stroke="none" fill="#f6efe2" letterSpacing="6" className="retro-stamp-text">{band}</text>
          </>
        )}
      </g>
    </svg>
  );
}

function Tile({ name, value, unit, detail }: { name: string; value: string | number; unit?: string; detail?: string }) {
  return (
    <div className="retro-tile">
      <div className="retro-tile-name">{name}</div>
      <div className="retro-tile-value">
        {value}
        {unit && <span className="retro-tile-unit">{unit}</span>}
      </div>
      {detail && <div className="retro-tile-detail">{detail}</div>}
    </div>
  );
}

function BarList({ rows }: { rows: { key: number; name: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="retro-bars">
      {rows.map((row, i) => (
        <li key={row.key} data-top={i === 0 || undefined}>
          <span className="retro-bar-rank">{String(i + 1).padStart(2, "0")}</span>
          <span className="retro-bar-name" title={row.name}>{row.name}</span>
          <span className="retro-bar-track">
            <span className="retro-bar" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="retro-bar-value">{row.value}</span>
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
  const peak = values.indexOf(max);
  const colMin = wide ? "1.125rem" : "0";
  return (
    <div className={wide ? "retro-scroll" : undefined}>
      <div style={wide ? { width: "max-content", minWidth: "100%" } : undefined}>
        <div className="retro-columns">
          {values.map((v, i) => (
            <div key={i} className="retro-col" data-peak={i === peak || undefined} style={{ minWidth: colMin }} title={labels[i]}>
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

/** The share of each item, drawn as toppings in a bowl seen from above. */
function Bowl({ entries }: { entries: [string, number][] }) {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const r = 29;
  const c = 2 * Math.PI * r;
  const gap = entries.length > 1 ? 1.2 : 0;
  let offset = 0;
  return (
    <>
      <div className="retro-bowl">
        <svg viewBox="0 0 100 100" width="100%" role="img" aria-label="品項占比">
          <circle cx="50" cy="50" r="49" fill="#262626" />
          <circle cx="50" cy="50" r="45.5" fill="none" stroke="#fbfbf9" strokeWidth="0.8" strokeDasharray="3.2 1.6" />
          <circle cx="50" cy="50" r="42" fill="#fbfbf9" />
          <circle cx="50" cy="50" r="39" fill="#efefec" />
          <g transform="rotate(-90 50 50)" fill="none" strokeWidth="13">
            {entries.map(([item, n], i) => {
              const len = (n / total) * c;
              const arc = (
                <circle
                  key={item}
                  cx="50"
                  cy="50"
                  r={r}
                  stroke={TOPPING_GRAYS[i % TOPPING_GRAYS.length]}
                  strokeDasharray={`${Math.max(0.5, len - gap)} ${c - Math.max(0.5, len - gap)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return arc;
            })}
          </g>
        </svg>
        <div className="retro-bowl-center">
          <span className="retro-bowl-total">{total}</span>
          <span className="retro-bowl-unit">份</span>
        </div>
      </div>
      <div className="retro-receipt">
        {entries.map(([item, n], i) => (
          <Leader
            key={item}
            label={
              <>
                <span className="retro-swatch" style={{ background: TOPPING_GRAYS[i % TOPPING_GRAYS.length] }} />
                {item}
              </>
            }
          >
            {n} 份 · {Math.round((n / total) * 100)}%
          </Leader>
        ))}
        <div className="retro-total">
          <Leader label="合計">{total} 份</Leader>
        </div>
      </div>
    </>
  );
}

const Figure = ({ children, unit }: { children: ReactNode; unit?: string }) => (
  <p className="retro-figure">
    {children}
    {unit && <small>{unit}</small>}
  </p>
);

/** formatDayKey gives "8/15 (六)"; the weekday drops to unit size so the date fits a phone. */
function DayFigure({ dayKey }: { dayKey: string }) {
  const [day, weekday] = formatDayKey(dayKey).split(" ");
  return <Figure unit={weekday}>{day}</Figure>;
}

export function Retro({ chatId, title }: { chatId: number; title: string }) {
  const { data, error, loading, reload } = useRemote<RetroResult>(() => call("retro", { chatId }), `retro:${chatId}`);
  if (loading) return <Spinner label="榮勾絲揪翻舊帳中…" />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  const { chat, queue } = data!;
  if (chat.pollCount === 0) {
    return (
      <Empty emoji="🫥" title={`${chat.year} 年這裡沒有投票`}>
        今年沒揪過團，回顧只好空空的。明年再一起吃，醬子。
      </Empty>
    );
  }

  let no = 2;
  const year = chat.year;
  const topJoined = chat.voters.slice(0, 15).map((v) => ({ key: v.userId, name: v.name, value: v.pollsJoined }));
  const topQQ = chat.voters
    .filter((v) => v.qqCount > 0)
    .sort((a, b) => b.qqCount - a.qqCount)
    .slice(0, 10)
    .map((v) => ({ key: v.userId, name: v.name, value: v.qqCount }));
  const items = Object.entries(chat.itemTotals).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const attendees = chat.voters.filter((v) => v.pollsJoined > 0).length;

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

  const active = chat.monthPeople.map((n, m) => ({ n, m })).filter((x) => x.n > 0);
  const monthLow = active.reduce((a, b) => (b.n < a.n ? b : a), active[0]);
  const monthHigh = active.reduce((a, b) => (b.n > a.n ? b : a), active[0]);
  const monthAvg = active.reduce((s, x) => s + x.n, 0) / (active.length || 1);

  return (
    <div className="retro">
      <Ticket>
        <div className="retro-intro">
          <p className="retro-shop">{SHOP}</p>
          <p className="retro-group">{title}</p>
          <p className="retro-year">{year}</p>
          <p className="retro-stamped">{printedAt(Date.now())}</p>
        </div>
        <Perf />
        <ol className="retro-rules">
          <li>本群今年揪了 {chat.pollCount} 次團，其中 {chat.ramenPollCount} 次是<span className="retro-nowrap">拉麵團</span>，怕的是他。</li>
          <li>共 {attendees} 位勇者出席，合計吃掉 <span className="retro-nowrap">{chat.totalPeople} 人份</span>，<span className="retro-nowrap">很ㄅㄧㄤˋ</span>。</li>
          <li>憑本號碼牌可向榮勾絲揪領取年度回顧一份，請往下滑。</li>
          <li>QQ 的朋友請自行面壁，明年記得準時出現，醬子。</li>
          <li>本回顧數字皆為群組投票所得，如有不服請找榮勾絲揪理論。</li>
        </ol>
        <FakeQr seed={`${title}${year}`} />
        <p className="retro-powered">powered by 榮勾絲揪</p>
        <Stamp chars="怕的是他" round />
      </Ticket>

      {topJoined.length > 0 && (
        <Section no={no++} year={year} title="誰來最多次？" meta="依出席次數排序 · TOP 15">
          <BarList rows={topJoined} />
        </Section>
      )}

      {chat.voters.some((v) => v.pollsJoined > 0) && (
        <Section no={no++} year={year} title="誰來最多週？" meta="每格是一週，印得越黑代表那週去越多次">
          <Heatmap chat={chat} />
        </Section>
      )}

      {topQQ.length > 0 && (
        <Section no={no++} year={year} title="誰 QQ 最多次？" meta="投了「不吃」的次數 · TOP 10">
          <BarList rows={topQQ} />
        </Section>
      )}

      {g.length > 0 && (
        <Section no={no++} year={year} title="哪次最多人來？" meta={`拉麵團 ${g.length} 場 · 每根是一場`}>
          <Columns values={gPeople} labels={gLabels} wide />
          <div className="retro-tiles">
            <Tile name="最低" value={Math.min(...gPeople)} unit="人" />
            <Tile name="平均人數" value={(gPeople.reduce((s, n) => s + n, 0) / gPeople.length).toFixed(2)} unit="人" />
            <Tile name="最高" value={Math.max(...gPeople)} unit="人" />
            <Tile name="最多人" value={formatDate(gTop.createdAt)} />
          </div>
        </Section>
      )}

      {active.length > 0 && (
        <Section no={no++} year={year} title="哪個月最多人來？" meta="每月出席人次合計">
          <Columns values={chat.monthPeople} labels={chat.monthPeople.map((_, m) => `${m + 1}月`)} />
          <div className="retro-tiles three">
            <Tile name="最低" value={`${monthLow.m + 1}月`} detail={`${monthLow.n} 人`} />
            <Tile name="平均" value={monthAvg.toFixed(1)} detail="人 / 月" />
            <Tile name="最高" value={`${monthHigh.m + 1}月`} detail={`${monthHigh.n} 人`} />
          </div>
        </Section>
      )}

      {items.length > 0 && (
        <Section no={no++} year={year} title="哪種最多人吃？" meta="點單統計 · 從碗上方看">
          <Bowl entries={items} />
        </Section>
      )}

      <Section no={no++} year={year} title="你" meta="本人專屬號碼牌">
        {chat.me ? (
          <>
            <Figure unit="名">{chat.me.rank}</Figure>
            <p className="retro-caption">年度排名</p>
            <div className="retro-receipt">
              <Leader label="去了">{chat.me.pollsJoined} 次</Leader>
              <Leader label="一共吃了">{chat.me.people} 人份</Leader>
              <Leader label="QQ">{chat.me.qqCount} 次</Leader>
            </div>
            <p className="retro-note">
              {chat.me.qqCount > 0 ? `QQ 了 ${chat.me.qqCount} 次。` : "一次都沒 QQ，很穩。"}
              {chat.me.favoriteItem ? `最愛點 ${chat.me.favoriteItem}，口味很堅定。` : "還沒點過特定品項，路過打個醬油也行。"}
            </p>
            <Stamp chars="榮勾絲揪" band="認證" />
          </>
        ) : (
          <>
            <p className="retro-absent">今年沒看到你</p>
            <p className="retro-note">你今年沒有參加過這個群組的投票，偶不吃了？</p>
          </>
        )}
      </Section>

      {queue.openDays > 0 && (
        <>
          <Section no={no++} year={queue.year} title={`${queue.year} 五之神開了`} meta="叫號機有開機的日子">
            <Figure unit="天">{queue.openDays}</Figure>
          </Section>
          {queue.medianLastNumber !== null && (
            <Section no={no++} year={queue.year} title="最後通常叫到" meta="每日最終號碼 · 中位數">
              <Figure unit="號">{queue.medianLastNumber}</Figure>
              <p className="retro-note">每天最後一個號碼的中位數。</p>
            </Section>
          )}
          {queue.busiestDay && (
            <Section no={no++} year={queue.year} title="最瘋狂的一天" meta="叫號最多的一天">
              <DayFigure dayKey={queue.busiestDay.date} />
              <p className="retro-note">一路叫到 {queue.busiestDay.lastNumber} 號，隊伍超長。</p>
            </Section>
          )}
          {queue.earliestOpen && (
            <Section no={no++} year={queue.year} title="最早開門的一天" meta="第一個號碼被叫到的時間">
              <Figure>{formatMinuteOfDay(queue.earliestOpen.minute)}</Figure>
              <p className="retro-note">{formatDayKey(queue.earliestOpen.date)} 這天最早開始叫號。</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
