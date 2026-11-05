import { taipeiParts } from "./time.ts";

const DEFAULT_MINUTES_PER_TICKET = 3;
// A day counts only if the board was watched closely for a real stretch; the old monitor often
// logged a whole morning under one timestamp, which says nothing about when numbers were called.
const MIN_TIMING_DURATION_MINUTES = 120;
const MIN_TIMING_POINTS = 15;
const NUMBER_RANGE_SLACK = 20;

export type Observation = { observedAt: number; number: number };

export type Point = [number: number, minuteOfDay: number];

export type ModelDay = {
  date: string;
  weekday: number;
  isLimitedDay: boolean;
  firstNumber: number;
  lastNumber: number;
  medianMinutesPerTicket: number | null;
  usableForTiming: boolean;
  points: Point[];
};

export type Model = {
  days: ModelDay[];
  globalMedianMinutesPerTicket: number | null;
  weekdayMedianMinutesPerTicket: (number | null)[];
};

export type Accuracy = {
  sampleCount: number;
  dayCount: number;
  medianAbsErrorMinutes: number;
  within10MinutesRate: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function isLimitedWeekday(weekday: number): boolean {
  return weekday === 5 || weekday === 6 || weekday === 0;
}

/** One trading day's service curve from the observations taken that day. */
export function buildDay(observations: Observation[]): ModelDay | null {
  const sorted = [...observations].sort((a, b) => a.observedAt - b.observedAt);
  const points: Point[] = [];
  for (const observation of sorted) {
    const last = points[points.length - 1];
    if (last && observation.number <= last[0]) continue;
    const minute = Math.round(taipeiParts(observation.observedAt).minuteOfDay * 10) / 10;
    points.push([observation.number, minute]);
  }
  if (points.length === 0) return null;

  const { dateKey, weekday } = taipeiParts(sorted[0].observedAt);
  const slopes: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    slopes.push((points[i][1] - points[i - 1][1]) / (points[i][0] - points[i - 1][0]));
  }
  const first = points[0];
  const last = points[points.length - 1];

  return {
    date: dateKey,
    weekday,
    isLimitedDay: isLimitedWeekday(weekday),
    firstNumber: first[0],
    lastNumber: last[0],
    medianMinutesPerTicket: median(slopes.filter((slope) => slope > 0)),
    usableForTiming:
      last[1] - first[1] >= MIN_TIMING_DURATION_MINUTES &&
      points.length >= MIN_TIMING_POINTS,
    points,
  };
}

export function groupByDay(observations: Observation[]): Map<string, Observation[]> {
  const byDay = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = taipeiParts(observation.observedAt).dateKey;
    const list = byDay.get(key);
    if (list) list.push(observation);
    else byDay.set(key, [observation]);
  }
  return byDay;
}

export function buildModel(days: ModelDay[]): Model {
  const timingDays = days.filter((day) => day.usableForTiming);
  const rates = (list: ModelDay[]) =>
    list.flatMap((day) => (day.medianMinutesPerTicket ? [day.medianMinutesPerTicket] : []));
  return {
    days,
    globalMedianMinutesPerTicket: median(rates(timingDays)),
    weekdayMedianMinutesPerTicket: Array.from({ length: 7 }, (_, weekday) =>
      median(rates(timingDays.filter((day) => day.weekday === weekday)))
    ),
  };
}

function interpolateMinute(day: ModelDay, number: number): number {
  const { points } = day;
  if (number <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [rightNumber, rightMinute] = points[i];
    if (number <= rightNumber) {
      const [leftNumber, leftMinute] = points[i - 1];
      const ratio = (number - leftNumber) / (rightNumber - leftNumber);
      return leftMinute + ratio * (rightMinute - leftMinute);
    }
  }
  const [lastNumber, lastMinute] = points[points.length - 1];
  return lastMinute + (number - lastNumber) * (day.medianMinutesPerTicket ?? DEFAULT_MINUTES_PER_TICKET);
}

function weightedMedian(candidates: { wait: number; weight: number }[]): number {
  const sorted = [...candidates].sort((a, b) => a.wait - b.wait);
  const half = sorted.reduce((sum, candidate) => sum + candidate.weight, 0) / 2;
  let running = 0;
  for (const candidate of sorted) {
    running += candidate.weight;
    if (running >= half) return candidate.wait;
  }
  return sorted[sorted.length - 1].wait;
}

/**
 * Minutes until `target` is called. `today` is the partial curve observed so far today;
 * when it covers the current number it is trusted outright, otherwise history votes,
 * weighted towards the same weekday, the same limited/regular kind of day and the same clock time.
 */
export function predictWaitMinutes(
  model: Model,
  today: ModelDay | null,
  now: number,
  current: number,
  target: number
): number {
  if (target <= current) return 0;
  const near = (day: ModelDay) =>
    current >= day.firstNumber - NUMBER_RANGE_SLACK && current <= day.lastNumber + NUMBER_RANGE_SLACK;
  const waitOn = (day: ModelDay) =>
    Math.max(0, interpolateMinute(day, target) - interpolateMinute(day, current));

  if (today?.usableForTiming && near(today) && target <= today.lastNumber) {
    return waitOn(today);
  }

  const { weekday, minuteOfDay } = taipeiParts(now);
  const limited = isLimitedWeekday(weekday);
  const candidates = model.days.filter(near).map((day) => {
    const clockDiff = Math.abs(interpolateMinute(day, current) - minuteOfDay);
    return {
      wait: waitOn(day),
      weight:
        (day.weekday === weekday ? 2.75 : 1) *
        (day.isLimitedDay === limited ? 1.7 : 0.75) *
        (1 / (1 + clockDiff / 45)) *
        (target <= day.lastNumber ? 1 : 0.45),
    };
  });
  if (today?.usableForTiming && near(today)) {
    candidates.push({ wait: waitOn(today), weight: candidates.length || 1 });
  }
  if (candidates.length > 0) return weightedMedian(candidates);

  const rate =
    model.weekdayMedianMinutesPerTicket[weekday] ??
    model.globalMedianMinutesPerTicket ??
    DEFAULT_MINUTES_PER_TICKET;
  return (target - current) * rate;
}

const BACKTEST_LEADS = [5, 10, 20, 40];

export type DayScore = { date: string; samples: number; within10: number; medianAbsError: number };

/**
 * Replays one finished day against the history before it: at each observed number,
 * predict when a later number is called and compare with when it actually was.
 * Scoring one day at a time keeps each run far below the platform's ~3 s CPU budget.
 */
export function scoreDay(history: Model, day: ModelDay): DayScore | null {
  if (!day.usableForTiming || history.days.length === 0) return null;
  const dayStart = Date.parse(`${day.date}T00:00:00+08:00`);
  const errors: number[] = [];
  for (const [current, minute] of day.points) {
    for (const lead of BACKTEST_LEADS) {
      const target = current + lead;
      if (target > day.lastNumber) continue;
      const predicted = predictWaitMinutes(history, null, dayStart + minute * 60_000, current, target);
      errors.push(Math.abs(predicted - (interpolateMinute(day, target) - minute)));
    }
  }
  if (errors.length === 0) return null;
  return {
    date: day.date,
    samples: errors.length,
    within10: errors.filter((error) => error <= 10).length,
    medianAbsError: median(errors) ?? 0,
  };
}

export function summarizeAccuracy(scores: DayScore[]): Accuracy | null {
  const samples = scores.reduce((sum, score) => sum + score.samples, 0);
  if (samples === 0) return null;
  return {
    sampleCount: samples,
    dayCount: scores.length,
    medianAbsErrorMinutes: median(scores.map((score) => score.medianAbsError)) ?? 0,
    within10MinutesRate: scores.reduce((sum, score) => sum + score.within10, 0) / samples,
  };
}

export function historyBefore(model: Model, date: string): Model {
  return buildModel(model.days.filter((day) => day.date < date));
}
