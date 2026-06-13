"use client";

import { useRef } from "react";

const MAX_VAL = 10;
const MIN_VAL = 1;
const PAD_TOP = 12;
const PAD_BOTTOM = 36;
const PAD_LEFT = 28;
const PAD_RIGHT = 8;
const SVG_W = 600;
const SVG_H = 224;
const CHART_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = SVG_H - PAD_TOP - PAD_BOTTOM;

export type CurvePreset = "linear" | "exp-strong" | "exp-soft" | "sigmoid";

interface Props {
  values: number[];       // index 0 = most recent (left), index N-1 = oldest (right)
  onChange: (vals: number[]) => void;
  onPresetChange: (preset: CurvePreset) => void;
  activePreset: CurvePreset;
  hasCurrent?: boolean;  // if true, index 0 = current partial month ("Now")
}

const PRESETS: { key: CurvePreset; label: string }[] = [
  { key: "linear", label: "Linéaire" },
  { key: "exp-strong", label: "Décroissance forte" },
  { key: "exp-soft", label: "Décroissance douce" },
  { key: "sigmoid", label: "Sigmoïde" },
];

export function applyPreset(preset: CurvePreset, N: number, base: number): number[] {
  if (N === 0) return [];
  const arr = new Array(N).fill(0);
  // i=0 = most recent (LEFT), i=N-1 = oldest (RIGHT)
  // "décroissance" = bars decrease from left (recent/high) to right (old/low)
  switch (preset) {
    case "linear":
      return arr.map(() => Math.max(MIN_VAL, base));
    case "exp-strong":
      // i=0 (most recent/left) → base*2; i=N-1 (oldest/right) → 1
      return arr.map((_, i) => {
        const t = i / Math.max(N - 1, 1); // 0→1, left→right
        return Math.max(MIN_VAL, Math.min(MAX_VAL, Math.round(base * 2 * (1 - t))));
      });
    case "exp-soft":
      // Gentle decrease: 140% at most recent → 60% at oldest
      return arr.map((_, i) => {
        const t = i / Math.max(N - 1, 1);
        return Math.max(MIN_VAL, Math.min(MAX_VAL, Math.round(base * (1.4 - 0.8 * t))));
      });
    case "sigmoid":
      // S-curve: plateau at recent end (left), slow at old end (right)
      return arr.map((_, i) => {
        const t = i / Math.max(N - 1, 1);
        const s = 1 / (1 + Math.exp(-8 * (t - 0.5))); // 0→1 as left→right
        return Math.max(MIN_VAL, Math.min(MAX_VAL, Math.round((1 - s) * base * 2)));
      });
  }
}

function getMonthLabel(i: number, hasCurrent: boolean): string {
  if (i === 0 && hasCurrent) return "Now";
  const monthsAgo = hasCurrent ? i : i + 1; // hasCurrent: i=0→now, i=1→1mo ago; else i=0→1mo ago
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function CurveEditor({ values, onChange, onPresetChange, activePreset, hasCurrent = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const N = values.length;
  const slotW = N > 0 ? CHART_W / N : CHART_W;
  const barW = Math.max(4, slotW - 2);

  function barX(i: number) {
    return PAD_LEFT + i * slotW + (slotW - barW) / 2;
  }
  function barY(v: number) {
    return PAD_TOP + CHART_H - (v / MAX_VAL) * CHART_H;
  }

  function getValueFromClientY(clientY: number): number {
    if (!svgRef.current) return MIN_VAL;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleY = SVG_H / rect.height;
    const relY = (clientY - rect.top) * scaleY;
    const frac = 1 - (relY - PAD_TOP) / CHART_H;
    return Math.min(MAX_VAL, Math.max(MIN_VAL, Math.round(frac * MAX_VAL)));
  }

  function onPointerDown(e: React.PointerEvent, i: number) {
    e.preventDefault();
    dragging.current = i;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    const newVal = getValueFromClientY(e.clientY);
    const next = [...values];
    next[i] = newVal;
    onChange(next);
    // Do NOT call onPresetChange — dragging customizes the current preset in place
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragging.current === null) return;
    const newVal = getValueFromClientY(e.clientY);
    const next = [...values];
    next[dragging.current] = newVal;
    onChange(next);
  }

  function onPointerUp() {
    dragging.current = null;
  }

  const yTicks = [0, 2, 4, 6, 8, 10];

  // X-axis: show label every N/12 bars (max ~12 labels)
  const labelStep = Math.max(1, Math.round(N / 12));

  return (
    <div>
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPresetChange(p.key)}
            className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
              activePreset === p.key
                ? "bg-navy text-white border-navy"
                : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center ml-1">— drag bars to customize</span>
      </div>

      {/* SVG chart */}
      <div className="border border-gray-200 rounded bg-white overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full"
          style={{ touchAction: "none" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* Y-axis grid lines + labels */}
          {yTicks.map((tick) => {
            const y = barY(tick);
            return (
              <g key={tick}>
                <line
                  x1={PAD_LEFT} y1={y}
                  x2={SVG_W - PAD_RIGHT} y2={y}
                  stroke="#e5e7eb" strokeWidth="1"
                />
                <text
                  x={PAD_LEFT - 4} y={y + 4}
                  textAnchor="end" fontSize="9" fill="#9ca3af"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {values.map((v, i) => {
            const x = barX(i);
            const bH = Math.max(2, (v / MAX_VAL) * CHART_H);
            const y = PAD_TOP + CHART_H - bH;
            const hx = x + barW / 2;
            const hy = y;

            return (
              <g key={i}>
                {/* Full-height invisible hit area */}
                <rect
                  x={x} y={PAD_TOP}
                  width={barW} height={CHART_H}
                  fill="transparent"
                  style={{ cursor: "ns-resize" }}
                  onPointerDown={(e) => onPointerDown(e, i)}
                />
                {/* Bar — teal for "Now", navy for past months */}
                <rect
                  x={x} y={y}
                  width={barW} height={bH}
                  fill={i === 0 && hasCurrent ? "#0d9488" : "#1e3a6e"}
                  rx="1"
                  style={{ cursor: "ns-resize", pointerEvents: "none" }}
                />
                {/* Drag handle */}
                {barW >= 6 && (
                  <circle
                    cx={hx} cy={hy}
                    r={Math.min(5, barW / 2 - 1)}
                    fill="white"
                    stroke={i === 0 && hasCurrent ? "#0d9488" : "#1e3a6e"}
                    strokeWidth="1.5"
                    style={{ cursor: "ns-resize", pointerEvents: "none" }}
                  />
                )}
                {/* Value label */}
                {barW >= 14 && (
                  <text
                    x={hx} y={hy - 7}
                    textAnchor="middle" fontSize="8" fill="#374151" fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {v}
                  </text>
                )}
              </g>
            );
          })}

          {/* X-axis baseline */}
          <line
            x1={PAD_LEFT} y1={PAD_TOP + CHART_H}
            x2={SVG_W - PAD_RIGHT} y2={PAD_TOP + CHART_H}
            stroke="#d1d5db" strokeWidth="1"
          />

          {/* X-axis labels — month names */}
          {values.map((_, i) => {
            if (i % labelStep !== 0 && i !== N - 1) return null;
            const cx = barX(i) + barW / 2;
            return (
              <text
                key={i}
                x={cx} y={SVG_H - 4}
                textAnchor="middle" fontSize="8" fill="#9ca3af"
              >
                {getMonthLabel(i, hasCurrent)}
              </text>
            );
          })}

          {/* Y-axis label */}
          <text
            x={8} y={PAD_TOP + CHART_H / 2}
            textAnchor="middle" fontSize="8" fill="#9ca3af"
            transform={`rotate(-90, 8, ${PAD_TOP + CHART_H / 2})`}
          >
            articles/month
          </text>
        </svg>
      </div>

    </div>
  );
}
