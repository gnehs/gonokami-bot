const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type TaipeiParts = {
  dateKey: string;
  year: number;
  month: number;
  weekday: number;
  minuteOfDay: number;
};

// Taiwan has no DST, so a fixed offset avoids Intl, which the isolate may not ship with full ICU.
export function taipeiParts(at: number | Date): TaipeiParts {
  const shifted = new Date(new Date(at).getTime() + TAIPEI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    weekday: shifted.getUTCDay(),
    minuteOfDay:
      shifted.getUTCHours() * 60 +
      shifted.getUTCMinutes() +
      shifted.getUTCSeconds() / 60,
  };
}

export function taipeiMidnight(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`) - TAIPEI_OFFSET_MS;
}

export function formatClock(at: number | Date): string {
  const minutes = Math.floor(taipeiParts(at).minuteOfDay);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
