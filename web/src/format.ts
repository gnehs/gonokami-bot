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

export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** Today shows only the clock; any other day gets its date too. */
export function formatPredicted(ms: number): string {
  return dayKeyFmt.format(ms) === dayKeyFmt.format(Date.now()) ? `今天 ${formatTime(ms)}` : formatDateTime(ms);
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
