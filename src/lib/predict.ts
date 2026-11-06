import { MIN_NUMBER } from "./queue.ts";
import { formatClock, taipeiParts } from "./time.ts";

const DEFAULT_MINUTES_PER_TICKET = 3;
// The board sitting this long is a break, the wait before opening, or a stale reading, not calling.
const CALLING_GAP_MINUTES = 45;
const MIN_SEGMENT_MINUTES = 40;
const MIN_SEGMENT_POINTS = 8;
// Sessions starting after this are dinner; the board is reset to 1000 before each session opens.
const DINNER_FROM_MINUTE = 14 * 60;
const MIN_CANDIDATES = 3;
const HISTORY_HALF_LIFE_DAYS = 250;
// Smaller drops are the staff correcting a mis-press, not the board starting a new session.
const RESET_MIN_DROP = 10;

export type Observation = { observedAt: number; number: number };

export type Point = [number: number, minuteOfDay: number];

/** One session's service curve. The shop runs a lunch and a dinner session and resets the board between them. */
export type ModelDay = {
  date: string;
  weekday: number;
  isLimitedDay: boolean;
  firstNumber: number;
  lastNumber: number;
  usableForTiming: boolean;
  points: Point[];
};

/** A stretch of a session in which the board kept moving; predictions never reach across a pause. */
export type Segment = {
  date: string;
  weekday: number;
  isLimitedDay: boolean;
  isDinner: boolean;
  points: Point[];
};

export type Model = { segments: Segment[]; minutesPerTicket: number };

/** Minutes until a number is called: the likeliest wait, and the range it lands in about four times in five. */
export type Wait = { likely: number; earliest: number; latest: number };

/** The same estimate as clock times (epoch ms). */
export type CallTime = Wait;

export function callTimeAfter(now: number, wait: Wait): CallTime {
  const at = (minutes: number) => now + minutes * 60_000;
  return { likely: at(wait.likely), earliest: at(wait.earliest), latest: at(wait.latest) };
}

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

function weightedQuantile(sorted: { value: number; weight: number }[], quantile: number): number {
  const goal = sorted.reduce((sum, candidate) => sum + candidate.weight, 0) * quantile;
  let running = 0;
  for (const candidate of sorted) {
    running += candidate.weight;
    if (running >= goal) return candidate.value;
  }
  return sorted[sorted.length - 1].value;
}

export function isLimitedWeekday(weekday: number): boolean {
  return weekday === 5 || weekday === 6 || weekday === 0;
}

function isReset(previous: number, next: number): boolean {
  return next < previous && (next < MIN_NUMBER || previous - next >= RESET_MIN_DROP);
}

/** Splits one day's observations wherever the board was reset to start a new session. */
export function splitSessions(observations: Observation[]): Observation[][] {
  const sessions: Observation[][] = [];
  for (const observation of [...observations].sort((a, b) => a.observedAt - b.observedAt)) {
    const current = sessions[sessions.length - 1];
    const last = current?.[current.length - 1];
    if (last && !isReset(last.number, observation.number)) current.push(observation);
    else sessions.push([observation]);
  }
  return sessions;
}

export function buildSessions(observations: Observation[]): ModelDay[] {
  return splitSessions(observations).flatMap((session) => buildDay(session) ?? []);
}

/** Distinguishes a day's lunch and dinner sessions, which share a date. */
export function sessionKey(day: ModelDay): string {
  return `${day.date} ${formatClock(Date.parse(`${day.date}T00:00:00+08:00`) + day.points[0][1] * 60_000)}`;
}

/**
 * The stretches of a session in which numbers were really being called. The reset reading (1000),
 * a number left on the board from before opening and the afternoon break all fall outside them.
 */
export function callingSegments(day: ModelDay): Segment[] {
  const runs: Point[][] = [];
  for (const point of day.points) {
    if (point[0] < MIN_NUMBER) continue;
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (last && point[1] - last[1] < CALLING_GAP_MINUTES) run.push(point);
    else runs.push([point]);
  }
  return runs
    .filter((points) => points.length >= MIN_SEGMENT_POINTS && points[points.length - 1][1] - points[0][1] >= MIN_SEGMENT_MINUTES)
    .map((points) => ({
      date: day.date,
      weekday: day.weekday,
      isLimitedDay: day.isLimitedDay,
      isDinner: points[0][1] >= DINNER_FROM_MINUTE,
      points,
    }));
}

/** One session's service curve from the observations taken during it. */
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
  const day: ModelDay = {
    date: dateKey,
    weekday,
    isLimitedDay: isLimitedWeekday(weekday),
    firstNumber: points[0][0],
    lastNumber: points[points.length - 1][0],
    usableForTiming: false,
    points,
  };
  day.usableForTiming = callingSegments(day).length > 0;
  return day;
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

function modelOf(segments: Segment[]): Model {
  const rates = segments.map(({ points }) => {
    const [firstNumber, firstMinute] = points[0];
    const [lastNumber, lastMinute] = points[points.length - 1];
    return (lastMinute - firstMinute) / (lastNumber - firstNumber);
  });
  return { segments, minutesPerTicket: median(rates) ?? DEFAULT_MINUTES_PER_TICKET };
}

export function buildModel(days: ModelDay[]): Model {
  return modelOf(days.flatMap(callingSegments));
}

export function historyBefore(model: Model, date: string): Model {
  return modelOf(model.segments.filter((segment) => segment.date < date));
}

/** The number the board showed at `minute`, or null outside the segment. */
function numberAt(segment: Segment, minute: number): number | null {
  const { points } = segment;
  if (minute < points[0][1] || minute > points[points.length - 1][1]) return null;
  let shown = points[0][0];
  for (const [number, at] of points) {
    if (at > minute) break;
    shown = number;
  }
  return shown;
}

/** The minute the board first showed `number` or higher, or null if the segment never got there. */
function minuteReaching(segment: Segment, number: number): number | null {
  return segment.points.find((point) => point[0] >= number)?.[1] ?? null;
}

function similarity(segment: Segment, weekday: number, nowDate: string): number {
  const ageDays = (Date.parse(nowDate) - Date.parse(segment.date)) / 86_400_000;
  return (
    (segment.weekday === weekday ? 2 : 1) *
    (segment.isLimitedDay === isLimitedWeekday(weekday) ? 1.5 : 0.75) *
    0.5 ** (ageDays / HISTORY_HALF_LIFE_DAYS)
  );
}

/**
 * How long until `target` is called with the board on `current` at `now`. Every past segment that was
 * calling at this clock time votes with how long it then took to move as many numbers on; votes are
 * weighted towards the same weekday, the same limited/regular kind of day and recent weeks. Clock time
 * rather than the ticket number lines the sessions up, because each session restarts at 1001.
 * Before the first call (the board on 1000) past sessions vote on the clock time of the target's place
 * in the session instead. The spread of the votes gives the range: waits run late far more often
 * than early, so a symmetric spread around the likeliest wait would be wrong on both sides.
 */
export function predictWait(model: Model, now: number, current: number, target: number): Wait {
  if (target <= current) return { likely: 0, earliest: 0, latest: 0 };
  const { minuteOfDay, weekday, dateKey } = taipeiParts(now);
  const lead = target - current;
  const candidates: { value: number; weight: number }[] = [];

  if (current < MIN_NUMBER) {
    const isDinner = minuteOfDay >= DINNER_FROM_MINUTE;
    for (const segment of model.segments) {
      if (segment.isDinner !== isDinner) continue;
      const minute = minuteReaching(segment, segment.points[0][0] + target - MIN_NUMBER);
      if (minute !== null) candidates.push({ value: minute - minuteOfDay, weight: similarity(segment, weekday, dateKey) });
    }
  } else {
    for (const segment of model.segments) {
      const shown = numberAt(segment, minuteOfDay);
      const minute = shown === null ? null : minuteReaching(segment, shown + lead);
      if (minute !== null) candidates.push({ value: minute - minuteOfDay, weight: similarity(segment, weekday, dateKey) });
    }
  }
  if (candidates.length < MIN_CANDIDATES) {
    const likely = lead * model.minutesPerTicket;
    return { likely, earliest: likely, latest: likely };
  }
  const sorted = candidates.sort((a, b) => a.value - b.value);
  const [earliest, likely, latest] = [0.1, 0.5, 0.9].map((quantile) => Math.max(0, weightedQuantile(sorted, quantile)));
  return { likely, earliest, latest };
}

const BACKTEST_LEADS = [5, 10, 20, 40];
const BACKTEST_STEP_MINUTES = 3;

export type DayScore = { date: string; samples: number; within10: number; medianAbsError: number };

/**
 * Replays one finished session against the history before it, the way people use the board: every
 * few minutes while numbers were being called, predict when a later number of the same stretch is
 * called and compare with when it actually was. One session at a time stays far below the
 * platform's ~3 s CPU budget.
 */
export function scoreDay(history: Model, day: ModelDay): DayScore | null {
  if (history.segments.length === 0) return null;
  const dayStart = Date.parse(`${day.date}T00:00:00+08:00`);
  const errors: number[] = [];
  for (const segment of callingSegments(day)) {
    const end = segment.points[segment.points.length - 1][1];
    for (let minute = segment.points[0][1]; minute < end; minute += BACKTEST_STEP_MINUTES) {
      const current = numberAt(segment, minute)!;
      for (const lead of BACKTEST_LEADS) {
        const actual = minuteReaching(segment, current + lead);
        if (actual === null) continue;
        const predicted = predictWait(history, dayStart + minute * 60_000, current, current + lead).likely;
        errors.push(Math.abs(predicted - (actual - minute)));
      }
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
    dayCount: new Set(scores.map((score) => score.date)).size,
    medianAbsErrorMinutes: median(scores.map((score) => score.medianAbsError)) ?? 0,
    within10MinutesRate: scores.reduce((sum, score) => sum + score.within10, 0) / samples,
  };
}
