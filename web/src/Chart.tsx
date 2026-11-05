import type { Point } from "../../src/lib/api-types.ts";
import { formatMinuteOfDay } from "./format.ts";

const W = 320;
const H = 190;
// Price-style labels sit in the right gutter; the two time labels sit under the plot's ends.
const PAD = { l: 2, r: 40, t: 8, b: 26 };
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

export function QueueChart({ points }: { points: Point[] }) {
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  const minutes = sorted.map((p) => p[1]);
  const numbers = sorted.map((p) => p[0]);
  const lo = Math.min(...numbers);
  const hi = Math.max(lo + 1, Math.max(...numbers));
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? 200;
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.max(y0 + step, Math.ceil(hi / step) * step);
  const x0 = minutes[0];
  const x1 = Math.max(x0 + 1, minutes[minutes.length - 1]);
  const x = (minute: number) => PAD.l + ((minute - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const y = (n: number) => H - PAD.b - ((n - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = sorted.map(([n, m], i) => `${i ? "L" : "M"}${x(m).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let n = y0; n <= y1; n += step) ticks.push(n);
  const last = sorted[sorted.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" role="img" aria-label={`今天叫號曲線，目前 ${last[0]} 號`}>
      {ticks.map((n) => (
        <g key={n}>
          <line x1={PAD.l} x2={W - PAD.r + 6} y1={y(n)} y2={y(n)} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
          <text x={W} y={y(n) + 4} textAnchor="end" fontSize="12" fill="var(--hint)" className="num">{n}</text>
        </g>
      ))}
      <text x={PAD.l} y={H - 4} fontSize="12" fill="var(--hint)" className="num">{formatMinuteOfDay(x0)}</text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize="12" fill="var(--hint)" className="num">{formatMinuteOfDay(last[1])}</text>
      <path d={path} fill="none" stroke="var(--up)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last[1])} cy={y(last[0])} r="7" fill="color-mix(in srgb, var(--up) 22%, var(--card))" />
      <circle cx={x(last[1])} cy={y(last[0])} r="3.5" fill="var(--up)" />
    </svg>
  );
}
