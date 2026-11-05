import type { Point } from "../../src/lib/api-types.ts";
import { formatMinuteOfDay } from "./format.ts";

const W = 320;
const H = 150;
const PAD = { l: 38, r: 10, t: 12, b: 24 };

export function QueueChart({ points }: { points: Point[] }) {
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  const minutes = sorted.map((p) => p[1]);
  const numbers = sorted.map((p) => p[0]);
  const x0 = Math.floor(Math.min(...minutes) / 60) * 60;
  const x1 = Math.max(x0 + 60, Math.ceil(Math.max(...minutes) / 60) * 60);
  const y0 = Math.min(...numbers);
  const y1 = Math.max(y0 + 1, Math.max(...numbers));
  const x = (minute: number) => PAD.l + ((minute - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const y = (n: number) => H - PAD.b - ((n - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = sorted.map(([n, m], i) => `${i ? "L" : "M"}${x(m).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const hours: number[] = [];
  for (let h = x0; h <= x1; h += 60) hours.push(h);
  const step = hours.length > 6 ? 2 : 1;
  const last = sorted[sorted.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`今天叫號曲線，目前 ${last[0]} 號`}>
      {[y0, Math.round((y0 + y1) / 2), y1].map((n) => (
        <g key={n}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(n)} y2={y(n)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(n) + 3.5} textAnchor="end" fontSize="10" fill="var(--hint)">{n}</text>
        </g>
      ))}
      {hours.map((h, i) =>
        i % step === 0 ? (
          <text key={h} x={x(h)} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--hint)">{formatMinuteOfDay(h)}</text>
        ) : null
      )}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last[1])} cy={y(last[0])} r="4.5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />
    </svg>
  );
}
