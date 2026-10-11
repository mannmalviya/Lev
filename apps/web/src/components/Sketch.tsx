// Hand-drawn SVG pieces in the Excalidraw look of the reference site: two loose strokes per edge,
// hatched fills, Virgil labels. Jitter is seeded by coordinates, so server and client render the same.

import type { ReactNode } from "react";

type Pt = [number, number];
export type Color = "ink" | "orange" | "blue" | "purple" | "green" | "red" | "gray";

const STROKE: Record<Color, string> = {
  ink: "var(--ink)", orange: "var(--orange)", blue: "var(--blue)", purple: "var(--purple)",
  green: "var(--green)", red: "var(--red)", gray: "var(--muted)",
};
const FILL: Record<Color, string> = {
  ink: "var(--fill-gray)", orange: "var(--fill-orange)", blue: "var(--fill-blue)", purple: "var(--fill-purple)",
  green: "var(--fill-green)", red: "#ffe3e3", gray: "var(--fill-gray)",
};

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
}

const f = (n: number) => n.toFixed(1);

function roughPath(points: Pt[], closed = false, j = 1.6) {
  let seed = 7;
  for (const n of points.flat()) seed = (seed * 31 + Math.round(n)) % 2147483646;
  const r = rng(seed + 1);
  const pts = closed ? [...points, points[0]] : points;
  let d = "";
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const mid = (t: number) => `${f(x1 + (x2 - x1) * t + r() * j * 2)} ${f(y1 + (y2 - y1) * t + r() * j * 2)}`;
      d += `M${f(x1 + r() * j)} ${f(y1 + r() * j)} C${mid(0.3)}, ${mid(0.7)}, ${f(x2 + r() * j)} ${f(y2 + r() * j)} `;
    }
  }
  return d;
}

export function Sketch({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        {(Object.keys(STROKE) as Color[]).map((c) => (
          <pattern key={c} id={`hatch-${c}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="9" height="9" style={{ fill: FILL[c] }} />
            <line x1="0" y1="0" x2="0" y2="9" strokeWidth="1.2" style={{ stroke: STROKE[c] }} opacity="0.25" />
          </pattern>
        ))}
      </defs>
      {children}
    </svg>
  );
}

export function Label({ x, y, children, size = 18, color = "ink", anchor = "middle" }: {
  x: number; y: number; children: ReactNode; size?: number; color?: Color; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} dominantBaseline="middle" className="font-hand" style={{ fill: STROKE[color] }}>
      {children}
    </text>
  );
}

export function Box({ x, y, w, h, color = "ink", title, sub, dashed, fill = true }: {
  x: number; y: number; w: number; h: number; color?: Color; title?: string; sub?: string; dashed?: boolean; fill?: boolean;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      {fill && <rect x={x} y={y} width={w} height={h} style={{ fill: `url(#hatch-${color})` }} />}
      <path
        d={roughPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true)}
        fill="none" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={dashed ? "6 7" : undefined}
        style={{ stroke: STROKE[color] }}
      />
      {title && <Label x={cx} y={sub ? cy - 11 : cy} size={20}>{title}</Label>}
      {sub && <Label x={cx} y={cy + 13} size={14} color="gray">{sub}</Label>}
    </g>
  );
}

export function Arrow({ pts, color = "ink", dashed }: { pts: Pt[]; color?: Color; dashed?: boolean }) {
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (da: number): Pt => [x2 - 13 * Math.cos(a + da), y2 - 13 * Math.sin(a + da)];
  return (
    <g fill="none" strokeWidth="1.8" strokeLinecap="round" style={{ stroke: STROKE[color] }}>
      <path d={roughPath(pts, false, 1)} strokeDasharray={dashed ? "6 7" : undefined} />
      <path d={roughPath([head(0.45), [x2, y2], head(-0.45)], false, 0.6)} />
    </g>
  );
}

/** A horizontal bar for showing scores. */
export function Bar({ x, y, w, color = "purple" }: { x: number; y: number; w: number; color?: Color }) {
  return <Box x={x} y={y} w={w} h={16} color={color} />;
}
