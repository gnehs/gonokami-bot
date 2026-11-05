import type { CSSProperties, ReactNode } from "react";
import type { RetroResult } from "../../src/lib/api-types.ts";
import { call } from "./api.ts";
import { formatDayKey, formatMinuteOfDay, formatDate, weekdayLabel } from "./format.ts";
import { Empty, ErrorView, Spinner, useRemote } from "./ui.tsx";

const GRADIENTS = [
  ["#ff7a59", "#ff3d68"],
  ["#7c5cff", "#3a7bff"],
  ["#12b886", "#0b7285"],
  ["#f59f00", "#e8590c"],
  ["#e64980", "#862e9c"],
  ["#339af0", "#1864ab"],
];

function Slide({ index, label, children }: { index: number; label: string; children: ReactNode }) {
  const [a, b] = GRADIENTS[index % GRADIENTS.length];
  const style: CSSProperties = { background: `linear-gradient(145deg, ${a}, ${b})` };
  return (
    <section style={style} className="flex min-h-[18rem] flex-col justify-center rounded-3xl p-6 text-white shadow-sm">
      <p className="text-sm font-medium" style={{ color: "#ffe8ee" }}>{label}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const Big = ({ children, unit }: { children: ReactNode; unit?: string }) => (
  <p className="tabular text-7xl font-extrabold leading-none">
    {children}
    {unit && <span className="ml-2 text-2xl font-bold">{unit}</span>}
  </p>
);

const Note = ({ children }: { children: ReactNode }) => <p className="mt-4 text-base" style={{ color: "#fff2f5" }}>{children}</p>;

function argMax(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

export function Retro({ chatId }: { chatId: number }) {
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

  const items = Object.entries(chat.itemTotals).sort((a, b) => b[1] - a[1]);
  const maxItem = Math.max(1, ...items.map(([, n]) => n));
  const busyMonth = argMax(chat.monthCounts);
  const busyWeekday = argMax(chat.weekdayCounts);
  const top = chat.voters.slice(0, 10);
  let i = 0;

  return (
    <div className="space-y-4">
      <h2 className="px-1 text-center text-xl font-bold">{chat.year} 年度回顧</h2>

      <Slide index={i++} label="這一年，你們一共揪了">
        <Big unit="次">{chat.pollCount}</Big>
        <Note>其中 {chat.ramenPollCount} 次是拉麵團，很ㄅㄧㄤˋ。</Note>
      </Slide>

      <Slide index={i++} label="榮勾斯揪幫你們餵飽了">
        <Big unit="人次">{chat.totalPeople}</Big>
        <Note>怕的是他沒吃飽，結果大家都飽飽的。</Note>
      </Slide>

      {items.length > 0 && (
        <Slide index={i++} label="大家點了什麼">
          <ul className="space-y-3">
            {items.map(([item, count]) => (
              <li key={item}>
                <div className="flex justify-between text-base font-semibold">
                  <span>{item}</span>
                  <span className="tabular">{count}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full" style={{ background: "#ffffff40" }}>
                  <div className="h-full rounded-full bg-white" style={{ width: `${(count / maxItem) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Slide>
      )}

      {chat.biggestPoll && (
        <Slide index={i++} label="最盛大的一次">
          <Big unit="人">{chat.biggestPoll.people}</Big>
          <p className="mt-3 break-words text-lg font-semibold">{chat.biggestPoll.question}</p>
          <Note>{formatDate(chat.biggestPoll.createdAt)}，全場最ㄅㄧㄤˋ。</Note>
        </Slide>
      )}

      <Slide index={i++} label="最常開團的時候">
        <p className="text-5xl font-extrabold">{busyMonth + 1} 月</p>
        <p className="mt-2 text-3xl font-bold">星期{weekdayLabel(busyWeekday)}</p>
        <div className="mt-5 flex h-16 items-end gap-1" aria-hidden="true">
          {chat.monthCounts.map((n, m) => (
            <div key={m} className="flex-1 rounded-t bg-white" style={{ height: `${Math.max(6, (n / Math.max(1, chat.monthCounts[busyMonth])) * 100)}%`, background: m === busyMonth ? "#ffffff" : "#ffffff66" }} />
          ))}
        </div>
        <Note>月份分佈如上，那天特別容易有人喊餓。</Note>
      </Slide>

      <Slide index={i++} label="吃麵王排行榜">
        <ol className="space-y-2">
          {top.map((voter, rank) => (
            <li key={voter.userId} className="flex items-baseline gap-3 text-base">
              <span className="tabular w-6 text-right font-bold">{rank + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{voter.name}</span>
              <span className="tabular shrink-0 text-sm" style={{ color: "#fff2f5" }}>{voter.pollsJoined} 次 · {voter.people} 人份</span>
            </li>
          ))}
        </ol>
      </Slide>

      <Slide index={i++} label="你">
        {chat.me ? (
          <>
            <Big unit="名">{chat.me.rank}</Big>
            <p className="mt-3 text-lg font-semibold">參加了 {chat.me.pollsJoined} 次投票</p>
            <Note>{chat.me.favoriteItem ? `最愛點 ${chat.me.favoriteItem}，口味很堅定。` : "還沒點過特定品項，路過打個醬油也行。"}</Note>
          </>
        ) : (
          <>
            <p className="text-3xl font-extrabold">今年沒看到你</p>
            <Note>你今年沒有參加過這個群組的投票，偶不吃了？</Note>
          </>
        )}
      </Slide>

      {queue.openDays > 0 && (
        <>
          <h2 className="px-1 pt-4 text-center text-xl font-bold">{queue.year} 年排隊回顧</h2>
          <Slide index={i++} label="五之神今年開了">
            <Big unit="天">{queue.openDays}</Big>
          </Slide>
          {queue.medianLastNumber !== null && (
            <Slide index={i++} label="一般來說，最後會叫到">
              <Big unit="號">{queue.medianLastNumber}</Big>
              <Note>這是每天最後一個號碼的中位數。</Note>
            </Slide>
          )}
          {queue.busiestDay && (
            <Slide index={i++} label="最瘋狂的一天">
              <p className="text-4xl font-extrabold">{formatDayKey(queue.busiestDay.date)}</p>
              <Note>一路叫到 {queue.busiestDay.lastNumber} 號，隊伍超長。</Note>
            </Slide>
          )}
          {queue.earliestOpen && (
            <Slide index={i++} label="最早開門的一天">
              <p className="tabular text-6xl font-extrabold">{formatMinuteOfDay(queue.earliestOpen.minute)}</p>
              <Note>{formatDayKey(queue.earliestOpen.date)} 這天最早開始叫號。</Note>
            </Slide>
          )}
        </>
      )}
    </div>
  );
}
