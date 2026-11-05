export const QUEUE_URL =
  "https://dxc.tagfans.com/mighty?_field%5B%5D=*&%24gid=10265&%24description=anouncingNumbers";

export const MIN_NUMBER = 1001;
export const MAX_NUMBER = 1200;

export type QueueReading = { number: number; changedAt: number };

type QueueRecord = { UpdDate: number; detail_json: string };

/** The shop's board API returns stale records too; the newest one carries the live number and when it changed. */
export function parseQueueResponse(records: QueueRecord[]): QueueReading | null {
  const latest = [...records].sort((a, b) => b.UpdDate - a.UpdDate)[0];
  if (!latest) return null;
  const detail = JSON.parse(latest.detail_json);
  const number = Number(detail.selections?.["目前號碼"]);
  if (!Number.isInteger(number)) return null;
  return { number, changedAt: Number(detail.UpdDate ?? latest.UpdDate) };
}

export function parseTargetNumber(text: string | undefined): number | null {
  if (!text || !/^\d{4}$/.test(text.trim())) return null;
  const number = Number(text.trim());
  return number >= MIN_NUMBER && number <= MAX_NUMBER ? number : null;
}
