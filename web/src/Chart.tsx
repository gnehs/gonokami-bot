import { useState, type PointerEvent } from "react";
import type { Point } from "../../src/lib/api-types.ts";
import { formatMinuteOfDay } from "./format.ts";

const W = 320;
const H = 190;
// Price-style labels sit in the right gutter; the time labels sit under the plot.
const PAD = { l: 2, r: 40, t: 8, b: 26 };
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
// Time labels land on round clock times; the step widens with the session so about five fit at phone width.
const TIME_STEPS = [10, 15, 20, 30, 60, 120];
const MAX_TIME_LABELS = 5;
const TOOLTIP_ROOM = 44;

export function QueueChart({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
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
  const plotW = W - PAD.l - PAD.r;
  const x = (minute: number) => PAD.l + ((minute - x0) / (x1 - x0)) * plotW;
  const y = (n: number) => H - PAD.b - ((n - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = sorted.map(([n, m], i) => `${i ? "L" : "M"}${x(m).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let n = y0; n <= y1; n += step) ticks.push(n);
  const timeStep = TIME_STEPS.find((s) => (x1 - x0) / s < MAX_TIME_LABELS) ?? 180;
  const timeTicks: number[] = [];
  for (let m = Math.ceil(x0 / timeStep) * timeStep; m <= x1; m += timeStep) timeTicks.push(m);
  const last = sorted[sorted.length - 1];
  const picked = active === null ? null : sorted[active];

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const minute = x0 + (((event.clientX - rect.left) / rect.width) * W - PAD.l) / plotW * (x1 - x0);
    let best = 0;
    sorted.forEach(([, m], i) => {
      if (Math.abs(m - minute) < Math.abs(sorted[best][1] - minute)) best = i;
    });
    setActive(best);
  };
  const clear = () => setActive(null);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y select-none overflow-visible"
        role="img"
        aria-label={`今天叫號曲線，目前 ${last[0]} 號`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
        }}
        onPointerUp={(event) => event.pointerType !== "mouse" && clear()}
        onPointerCancel={clear}
        onPointerLeave={(event) => event.pointerType === "mouse" && clear()}
      >
        {ticks.map((n) => (
          <g key={n}>
            <line x1={PAD.l} x2={W - PAD.r + 6} y1={y(n)} y2={y(n)} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
            <text x={W} y={y(n) + 4} textAnchor="end" fontSize="12" fill="var(--hint)" className="num">{n}</text>
          </g>
        ))}
        {timeTicks.map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={H - PAD.b} y2={H - PAD.b + 5} stroke="var(--hint)" strokeWidth="1" />
            <text x={Math.max(x(m), 16)} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--hint)" className="num">
              {formatMinuteOfDay(m)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--up)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {picked ? (
          <>
            <line x1={x(picked[1])} x2={x(picked[1])} y1={PAD.t} y2={H - PAD.b} stroke="var(--hint)" strokeWidth="1" />
            <circle cx={x(picked[1])} cy={y(picked[0])} r="5" fill="var(--card)" stroke="var(--up)" strokeWidth="2.25" />
          </>
        ) : (
          <>
            <circle cx={x(last[1])} cy={y(last[0])} r="7" fill="color-mix(in srgb, var(--up) 22%, var(--card))" />
            <circle cx={x(last[1])} cy={y(last[0])} r="3.5" fill="var(--up)" />
          </>
        )}
      </svg>
      {picked && (
        <div
          className="pointer-events-none absolute whitespace-nowrap rounded-xl bg-card px-3 py-1.5 text-center shadow-[var(--shadow)]"
          style={tooltipPosition(x(picked[1]) / W, y(picked[0]))}
        >
          <span className="num text-[17px] font-semibold text-fg">{picked[0]}</span>
          <span className="ml-0.5 text-[13px] text-hint">號</span>
          <span className="num ml-2 text-[13px] text-hint">{formatMinuteOfDay(picked[1])}</span>
        </div>
      )}
    </div>
  );
}

// Above the point, or below it when the point sits too near the top; pinned to the chart's edge
// near either end so it never spills out of the card.
function tooltipPosition(fraction: number, pointY: number) {
  const above = pointY > TOOLTIP_ROOM;
  const top = `calc(${(pointY / H) * 100}% ${above ? "- 12px" : "+ 12px"})`;
  const dy = above ? "-100%" : "0";
  if (fraction < 0.2) return { top, left: 0, translate: `0 ${dy}` };
  if (fraction > 0.8) return { top, right: 0, translate: `0 ${dy}` };
  return { top, left: `${fraction * 100}%`, translate: `-50% ${dy}` };
}
