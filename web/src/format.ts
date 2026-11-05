const TZ = "Asia/Taipei";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const dateFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, month: "numeric", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export const weekdayLabel = (index: number) => WEEKDAYS[index] ?? "?";

export function formatDate(ms: number): string {
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayFmt.format(ms));
  return `${dateFmt.format(ms)} (${weekdayLabel(weekday)})`;
}

export const formatTime = (ms: number) => timeFmt.format(ms);

const dayKey = (ms: number) => dayKeyFmt.format(ms);

/** "2026/11/5 (四) 14:56": records outlive the year they were made in. */
export function formatDateTime(ms: number): string {
  const [y, m, d] = dayKey(ms).split("-").map(Number);
  return `${y}/${m}/${d} (${weekdayLabel(new Date(Date.UTC(y, m - 1, d)).getUTCDay())}) ${formatTime(ms)}`;
}

/** "2026/11/5 14:56", for list rows where the weekday would crowd out the rest. */
export function formatShortDateTime(ms: number): string {
  const [y, m, d] = dayKey(ms).split("-").map(Number);
  return `${y}/${m}/${d} ${formatTime(ms)}`;
}

/** "2026 年 11 月", for grouping records by month. */
export function formatMonth(ms: number): string {
  const [y, m] = dayKey(ms).split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

export const isToday = (ms: number) => dayKey(ms) === dayKey(Date.now());

/** Today shows only the clock; any other day gets its date too. */
export function formatPredicted(ms: number): string {
  return isToday(ms) ? `今天 ${formatTime(ms)}` : formatDateTime(ms);
}

export function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = Math.round(minute % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatAgo(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小時前` : formatDateTime(ms);
}

/** "2026-12-03" from the retro payload → "12/3 (四)". */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d} (${weekdayLabel(weekday)})`;
}
