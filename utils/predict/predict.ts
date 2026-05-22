import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_MINUTES_PER_TICKET = 3;
const MODEL_VERSION = 2;
const TAIPEI_TIME_ZONE = "Asia/Taipei";

type ModelDay = {
  date: string;
  weekday: number;
  isLimitedDay: boolean;
  firstNumber: number;
  lastNumber: number;
  medianMinutesPerTicket?: number;
  usableForTiming: boolean;
  points: [number, number][];
};

type PredictionModel = {
  version: number;
  days: ModelDay[];
  globalMedianMinutesPerTicket?: number;
  weekdayMedianMinutesPerTicket?: number[];
};

let model: PredictionModel | null = null;

function getModelPath(): string {
  const sourcePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "model_data.json"
  );
  if (fs.existsSync(sourcePath)) return sourcePath;

  return path.join(process.cwd(), "utils", "predict", "model_data.json");
}

function loadModel(): PredictionModel {
  if (model) return model;

  const modelPath = getModelPath();
  if (!fs.existsSync(modelPath)) {
    throw new Error("Missing utils/predict/model_data.json.");
  }

  const parsed = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  if (parsed.version !== MODEL_VERSION || !Array.isArray(parsed.days)) {
    throw new Error("Unsupported model_data.json format.");
  }

  model = parsed;
  return model;
}

function taipeiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: weekdayMap[get("weekday")],
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function minutesFromMidnight(date: Date): number {
  const parts = taipeiDateParts(date);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function localDateKey(date: Date): string {
  const parts = taipeiDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function interpolateMinute(day: ModelDay, number: number): number {
  const { points } = day;
  if (number <= points[0][0]) return points[0][1];

  for (let i = 1; i < points.length; i += 1) {
    const [rightNumber, rightMinute] = points[i];
    if (number <= rightNumber) {
      const [leftNumber, leftMinute] = points[i - 1];
      if (rightNumber === leftNumber) return rightMinute;
      const ratio = (number - leftNumber) / (rightNumber - leftNumber);
      return leftMinute + ratio * (rightMinute - leftMinute);
    }
  }

  const [lastNumber, lastMinute] = points[points.length - 1];
  const rate = day.medianMinutesPerTicket || DEFAULT_MINUTES_PER_TICKET;
  return lastMinute + (number - lastNumber) * rate;
}

function weightedQuantile(
  candidates: { waitMinutes: number; weight: number }[],
  quantile: number
): number | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.waitMinutes - b.waitMinutes);
  const totalWeight = sorted.reduce(
    (sum, candidate) => sum + candidate.weight,
    0
  );
  if (totalWeight <= 0) return null;

  const threshold = totalWeight * quantile;
  let running = 0;

  for (const candidate of sorted) {
    running += candidate.weight;
    if (running >= threshold) return candidate.waitMinutes;
  }

  return sorted[sorted.length - 1].waitMinutes;
}

function buildWaitCandidates(
  trainedModel: PredictionModel,
  currentTime: Date,
  currentNum: number,
  targetNum: number
): { waitMinutes: number; weight: number }[] | 0 {
  if (targetNum <= currentNum) return 0;

  const { weekday } = taipeiDateParts(currentTime);
  const currentMinute = minutesFromMidnight(currentTime);
  const dateKey = localDateKey(currentTime);
  const isLimitedDay = weekday === 5 || weekday === 6 || weekday === 0;
  const exactDay = trainedModel.days.find((day) => day.date === dateKey);

  if (
    exactDay &&
    exactDay.usableForTiming &&
    currentNum >= exactDay.firstNumber - 20 &&
    currentNum <= exactDay.lastNumber + 20
  ) {
    const historicalCurrentMinute = interpolateMinute(exactDay, currentNum);
    const historicalTargetMinute = interpolateMinute(exactDay, targetNum);
    return [
      {
        waitMinutes: Math.max(
          0,
          historicalTargetMinute - historicalCurrentMinute
        ),
        weight: 1,
      },
    ];
  }

  const candidates: { waitMinutes: number; weight: number }[] = [];

  for (const day of trainedModel.days) {
    if (currentNum < day.firstNumber - 20 || currentNum > day.lastNumber + 20) {
      continue;
    }

    const historicalCurrentMinute = interpolateMinute(day, currentNum);
    const historicalTargetMinute = interpolateMinute(day, targetNum);
    const waitMinutes = Math.max(
      0,
      historicalTargetMinute - historicalCurrentMinute
    );
    const clockDiff = Math.abs(historicalCurrentMinute - currentMinute);

    const exactDateWeight = day.date === dateKey ? 100 : 1;
    const weekdayWeight = day.weekday === weekday ? 2.75 : 1;
    const limitedDayWeight = day.isLimitedDay === isLimitedDay ? 1.7 : 0.75;
    const clockWeight = 1 / (1 + clockDiff / 45);
    const coverageWeight = targetNum <= day.lastNumber ? 1 : 0.45;

    candidates.push({
      waitMinutes,
      weight:
        exactDateWeight *
        weekdayWeight *
        limitedDayWeight *
        clockWeight *
        coverageWeight,
    });
  }

  if (candidates.length > 0) return candidates;

  const fallbackRate =
    trainedModel.weekdayMedianMinutesPerTicket?.[weekday] ||
    trainedModel.globalMedianMinutesPerTicket ||
    DEFAULT_MINUTES_PER_TICKET;
  return [{ waitMinutes: (targetNum - currentNum) * fallbackRate, weight: 1 }];
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.max(0, minutes) * 60 * 1000);
}

function validateInputs(
  currentTimeInput: Date | string | number,
  currentNum: number,
  targetNum: number
): Date {
  const currentTime = new Date(currentTimeInput);

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("Invalid time input");
  }
  if (!Number.isFinite(currentNum) || !Number.isFinite(targetNum)) {
    throw new Error("Queue numbers must be finite numbers");
  }

  return currentTime;
}

export async function predictTime(
  currentTimeInput: Date | string | number,
  currentNum: number,
  targetNum: number
): Promise<Date> {
  const trainedModel = loadModel();
  const currentTime = validateInputs(currentTimeInput, currentNum, targetNum);

  const candidates = buildWaitCandidates(
    trainedModel,
    currentTime,
    currentNum,
    targetNum
  );

  if (candidates === 0) {
    return currentTime;
  }

  const medianWait = weightedQuantile(candidates, 0.5) || 0;
  return addMinutes(currentTime, medianWait);
}

export function formatTaipeiTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatPredictionTime(predictedTime: Date): string {
  return `預估叫號時間 *${formatTaipeiTime(predictedTime)}*`;
}

export async function getPredictionText(
  currentNumber: number,
  targetNumber: number,
  now: Date = new Date()
): Promise<string | null> {
  if (!Number.isFinite(currentNumber) || !Number.isFinite(targetNumber)) {
    return null;
  }

  if (targetNumber <= currentNumber) return null;

  try {
    const predictedTime = await predictTime(now, currentNumber, targetNumber);
    return formatPredictionTime(predictedTime);
  } catch (error) {
    console.error("Failed to predict queue time:", error);
    return "預測叫號時間暫時不可用，模型資料讀不到或格式不對，晚點再試。";
  }
}
