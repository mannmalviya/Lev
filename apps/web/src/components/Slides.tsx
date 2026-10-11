"use client";

// Slide deck in the style of https://jev-to-kernels-by-hand.vercel.app/.
// Scroll mode: every slide stacked, every build shown. Present mode: one slide fills the screen;
// click / arrow keys / space / mouse wheel step through the builds, then the slides. Esc leaves.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Arrow, Bar, Box, Label, Sketch } from "@/components/Sketch";

/** Slides are drawn on a 1920×1080 canvas and scaled to fit. */
const W = 1920;
const H = 1080;

function Fit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative aspect-video w-full overflow-hidden bg-paper">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** Hidden until the deck reaches build `at`. */
function Build({ at, step, className = "", children }: { at: number; step: number; className?: string; children: ReactNode }) {
  const on = step >= at;
  return (
    <div className={`transition-[opacity,translate] duration-500 ease-out ${on ? "opacity-100" : "translate-y-12 opacity-0"} ${className}`}>
      {children}
    </div>
  );
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="text-[24px] tracking-[4px] text-muted">{children}</div>
);

// ---------- Slide 1: title + Jev posts on X ----------

const CLIPS = [1, 2, 3, 4, 5, 6].map((n) => `/slides/jev-x-${n}.webm`);

/** A clip that starts over each time its build shows it. */
function Clip({ src, at, step, label, className = "aspect-[5/6] w-full" }: {
  src: string; at: number; step: number; label?: string; className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const on = step >= at;
  useEffect(() => {
    const v = ref.current;
    if (!v || !on) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }, [on]);
  return (
    <Build at={at} step={step} className="relative">
      <video ref={ref} src={src} autoPlay muted loop playsInline className={`rounded-2xl bg-black object-contain ${className}`} />
      {label && <div className="absolute bottom-4 left-4 rounded-xl bg-paper/90 px-4 py-1 font-hand text-[32px] text-purple">{label}</div>}
    </Build>
  );
}

function TitleSlide({ step }: { step: number }) {
  return (
    <div className="flex h-full items-center gap-16 p-[96px]">
      <div className="w-[600px] shrink-0 space-y-6">
        <Kicker>UCSC AI HACKATHON</Kicker>
        <div>
          <h1 className="text-[104px] leading-[1.05]">System 1</h1>
          <div className="font-hand text-[96px] leading-[1.1] text-orange">Playground</div>
        </div>
        <p className="text-[36px] italic leading-[1.3] text-muted">
          Small local models vs Jev vs a text LLM, racing in Flappy Bird and Chrome Dino.
        </p>
      </div>
      <div className="flex-1 space-y-4">
        <div className="font-hand text-[32px] text-purple">Jev on X</div>
        <div className="grid grid-cols-3 gap-6">
          {CLIPS.map((src, i) => (
            <Clip key={src} src={src} at={i + 1} step={step} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Slide 2: one real Jev call ----------

// A real call to Jev from 11 Oct 2026 (0.25 s round trip). Only the line breaks in "state" are reflowed.
const REQUEST = `{
  "model": "jev-latest",
  "state": "bird_height=212 bird_speed=4 moving_down
            next_pipe_distance=96 gap_bottom=180
            gap_top=280 gap_center=230
            bird_is 18 px BELOW the gap center",
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Flappy Bird. Should the bird flap now?",
      "criteria": {
        "flap": "Flap: jump up.",
        "wait": "Wait: let the bird fall."
      }
    }
  }
}`;

const RESPONSE = `{
  "model": "jev-1.13.0",
  "answers": {
    "action": {
      "type": "choice",
      "choice": "flap",
      "confidence": 0.28,
      "probabilities": { "flap": 0.64, "wait": 0.36 }
    }
  },
  "usage": { "input_tokens": 370, "output_tokens": 33 }
}`;

function Code({ title, color, children }: { title: string; color: string; children: string }) {
  return (
    <div className="sketch space-y-3 bg-paper p-8" style={{ borderColor: color }}>
      <div className="font-hand text-[28px]" style={{ color }}>{title}</div>
      <pre className="font-mono text-[21px] leading-[1.45] text-ink">{children}</pre>
    </div>
  );
}

function JevCallSlide() {
  return (
    <div className="flex h-full flex-col gap-10 p-[96px] pt-[80px]">
      <div className="space-y-2">
        <Kicker>WHAT JEV DOES</Kicker>
        <h2 className="text-[72px] leading-[1.1]">
          Ask a question. <span className="font-hand text-purple">Get a decision.</span>
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-center gap-6">
        <Code title="Request · POST api.typesafe.ai/v1/systemone" color="var(--blue)">{REQUEST}</Code>
        <div className="font-hand text-[64px] text-purple">→</div>
        <Code title="Response · 0.25 s round trip" color="var(--purple)">{RESPONSE}</Code>
      </div>
    </div>
  );
}

// ---------- Slide 3: System 2 vs System 1 ----------

const TOKENS = ["The", "bird", "is", "18", "px", "below", "the", "gap", ",", "so", "…", "flap"];

function SystemsSlide({ step }: { step: number }) {
  return (
    <div className="flex h-full flex-col p-[96px] pt-[80px]">
      <div className="space-y-2">
        <Kicker>TWO WAYS TO THINK</Kicker>
        <h2 className="text-[72px] leading-[1.1]">
          Slow and careful, or <span className="font-hand text-orange">fast and sure</span>
        </h2>
      </div>
      <div className="mt-12 flex flex-1 items-stretch gap-12">
        <Build at={1} step={step} className="sketch flex flex-1 flex-col gap-6 bg-fill-blue p-12">
          <div className="font-hand text-[48px] text-blue">System 2</div>
          <div className="text-[44px] leading-[1.15]">LLMs think token by token</div>
          <div className="flex flex-wrap items-center gap-3">
            {TOKENS.map((t, i) => (
              <span key={i} className="sketch-soft bg-paper px-5 py-2 font-mono text-[36px]">{t}</span>
            ))}
          </div>
          <div className="mt-auto text-[30px] italic text-muted">Many words out, one at a time. Slow.</div>
        </Build>

        <Build at={2} step={step} className="sketch flex flex-1 flex-col gap-6 bg-fill-purple p-12">
          <div className="font-hand text-[48px] text-purple">System 1</div>
          <div className="text-[44px] leading-[1.15]">Jev just decides</div>
          <div className="space-y-6 font-mono text-[36px]">
            {[["flap", 0.64], ["wait", 0.36]].map(([k, p]) => (
              <div key={k} className="flex items-center gap-4">
                <span className="w-28">{k}</span>
                <span className="sketch-soft h-14 bg-purple/70" style={{ width: `${Number(p) * 420}px` }} />
                <span>{p}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto text-[30px] italic text-muted">One look, one answer. Fast.</div>
        </Build>

        <Build at={3} step={step} className="flex w-[300px] shrink-0 flex-col items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slides/thinking-fast-and-slow.jpg" alt="Thinking, Fast and Slow by Daniel Kahneman" className="w-[260px] rotate-2 shadow-xl" />
          <div className="text-center text-[24px] italic leading-[1.3] text-muted">
            Daniel Kahneman,<br />Thinking, Fast and Slow
          </div>
        </Build>
      </div>
    </div>
  );
}

// ---------- Slide 4: race, LLM streaming vs Jev (simulated) ----------

// Fake timings: the LLM waits for its first token, then streams one token every TOKEN_MS.
// Jev answers in one shot at JEV_MS (about our measured 0.25 s round trip).
const LLM_TEXT =
  "The bird is 18 px below the gap center and moving down at speed 4. If it waits, gravity pulls it further below the gap and it may hit the bottom pipe. To get back toward the center it needs to go up. Answer: flap";
const LLM_TOKENS = LLM_TEXT.match(/\S+\s*/g)!;
const FIRST_TOKEN_MS = 400;
const TOKEN_MS = 90;
const LLM_MS = FIRST_TOKEN_MS + LLM_TOKENS.length * TOKEN_MS;
const JEV_MS = 250;
const PAUSE_MS = 2500;

/** Milliseconds since the race started; loops after both lanes finish. */
function useRaceClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setT((now - t0) % (LLM_MS + PAUSE_MS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

function Lane({ name, sub, color, fill, ms, doneMs, children }: {
  name: string; sub: string; color: string; fill: string; ms: number; doneMs: number; children: ReactNode;
}) {
  const done = ms >= doneMs;
  const shown = Math.min(ms, doneMs);
  return (
    <div className="sketch flex flex-1 flex-col gap-5 p-10" style={{ background: fill }}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-hand text-[48px]" style={{ color }}>{name}</div>
          <div className="text-[26px] italic text-muted">{sub}</div>
        </div>
        <div className="font-mono text-[56px] tabular-nums" style={{ color }}>{(shown / 1000).toFixed(2)} s</div>
      </div>
      <div className="sketch-soft h-6 overflow-hidden bg-paper">
        <div className="h-full" style={{ width: `${(shown / LLM_MS) * 100}%`, background: color }} />
      </div>
      <div className="flex-1">{children}</div>
      <div className="h-[64px] font-hand text-[44px]" style={{ color }}>{done ? "✓ flap" : ""}</div>
    </div>
  );
}

function RaceSlide() {
  const t = useRaceClock();
  const n = t < FIRST_TOKEN_MS ? 0 : Math.min(LLM_TOKENS.length, Math.floor((t - FIRST_TOKEN_MS) / TOKEN_MS) + 1);
  const jevDone = t >= JEV_MS;
  return (
    <div className="flex h-full flex-col p-[96px] pt-[80px]">
      <div className="space-y-2">
        <Kicker>SIDE-BY-SIDE RACE · SIMULATED</Kicker>
        <h2 className="text-[72px] leading-[1.1]">
          Same question, <span className="font-hand text-purple">one answer each</span>
        </h2>
      </div>
      <div className="mt-12 flex flex-1 items-stretch gap-12">
        <Lane name="Text LLM" sub="streams tokens, one at a time" color="var(--blue)" fill="var(--fill-blue)" ms={t} doneMs={LLM_MS}>
          <p className="font-mono text-[28px] leading-[1.45]">
            {n === 0 ? <span className="text-muted">thinking…</span> : LLM_TOKENS.slice(0, n).join("")}
            {n < LLM_TOKENS.length && <span className="animate-pulse">▍</span>}
          </p>
          <div className="mt-4 font-mono text-[24px] text-muted">{n} / {LLM_TOKENS.length} tokens</div>
        </Lane>
        <Lane name="Jev" sub="one look, one answer" color="var(--purple)" fill="var(--fill-purple)" ms={t} doneMs={JEV_MS}>
          {jevDone ? (
            <div className="space-y-6 font-mono text-[36px]">
              {[["flap", 0.64], ["wait", 0.36]].map(([k, p]) => (
                <div key={k} className="flex items-center gap-4">
                  <span className="w-28">{k}</span>
                  <span className="sketch-soft h-14 bg-purple/70" style={{ width: `${Number(p) * 420}px` }} />
                  <span>{p}</span>
                </div>
              ))}
              {t < LLM_MS && <div className="pt-4 font-serif text-[30px] italic text-muted">Done. The LLM is still typing…</div>}
            </div>
          ) : (
            <span className="font-mono text-[28px] text-muted">thinking…</span>
          )}
        </Lane>
      </div>
    </div>
  );
}

// ---------- Slide 5: use cases ----------

function UseCasesSlide({ step }: { step: number }) {
  return (
    <div className="flex h-full flex-col px-[96px] pt-[56px] pb-[64px]">
      <div className="space-y-2">
        <Kicker>WHAT PEOPLE BUILD WITH JEV</Kicker>
        <h2 className="text-[64px] leading-[1.1]">
          Use <span className="font-hand text-purple">cases</span>
        </h2>
      </div>
      <div className="mt-6 flex flex-1 items-start justify-center gap-12">
        <Clip src="/slides/use-tool-calling.mp4" at={1} step={step} label="Tool calling" className="h-[810px] aspect-[4/5]" />
        <div className="flex flex-col gap-6">
          <Clip src="/slides/use-robotics.mp4" at={2} step={step} label="Robotics" className="h-[393px] aspect-video" />
          <Clip src="/slides/use-doom.mp4" at={3} step={step} label="Doom" className="h-[393px] aspect-video" />
        </div>
      </div>
    </div>
  );
}

// ---------- Slide 6: Jev is closed source ----------

function ClosedSourceSlide() {
  return (
    <div className="flex h-full flex-col items-center gap-8 p-[96px] pt-[72px]">
      <h2 className="font-hand text-[96px] leading-[1.1] text-red">JEV IS CLOSED SOURCE!!</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/slides/typesafe-usage.png" alt="TypeSafe console usage page: spend, tokens and requests" className="sketch max-h-[720px] w-auto bg-white p-2" />
      <div className="text-[28px] italic text-muted">console.typesafe.ai/usage · every decision is a paid API call</div>
    </div>
  );
}

// ---------- Slide 7: open-source System 1 models ----------

// Only Laya ships a logo; the others get their name in big type.
const OPEN_MODELS = [
  { name: "Laya", logo: "/slides/logo-laya.png", repo: "github.com/NandhaKishorM/laya" },
  { name: "Kev", repo: "github.com/jaredpalmer/kev" },
  { name: "OpenJev", repo: "github.com/TheoLeeCJ/SemIf-OpenJev" },
  { name: "NanoJev", repo: "github.com/TianyuCodings/NanoJev" },
];

function OpenModelsSlide() {
  return (
    <div className="flex h-full flex-col p-[96px] pt-[80px]">
      <div className="space-y-2">
        <Kicker>BUT THERE ARE OPEN ONES</Kicker>
        <h2 className="text-[72px] leading-[1.1]">
          Open-source <span className="font-hand text-green">System 1 models</span>
        </h2>
      </div>
      <div className="mt-12 grid flex-1 grid-cols-2 gap-10">
        {OPEN_MODELS.map((m) => (
          <div key={m.name} className="sketch flex flex-col items-center justify-center gap-4 bg-white p-8">
            {m.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.logo} alt={m.name} className="h-[150px] w-auto" />
            ) : (
              <div className="text-[120px] leading-none">{m.name}</div>
            )}
            <div className="font-mono text-[24px] text-muted">{m.repo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Slide 8: Lev ----------

function LevSlide() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="font-hand text-[320px] leading-none text-orange">Lev</div>
      <div className="text-[48px] italic text-muted">Turn any open-weight model into a Jev-style System 1 model</div>
    </div>
  );
}

// ---------- Slides 9-10: how we built Lev ----------

const BACKBONES = [
  { name: "Qwen", logo: "/slides/logo-qwen.svg" },
  { name: "DeepSeek", logo: "/slides/logo-deepseek.svg" },
  { name: "Kimi", logo: "/slides/logo-kimi.svg" },
  { name: "Mistral", logo: "/slides/logo-mistral.svg" },
];

function Show({ on, children }: { on: boolean; children: ReactNode }) {
  return <g style={{ opacity: on ? 1 : 0, transition: "opacity .5s ease-out" }}>{children}</g>;
}

// A fully connected network drawn as circles and lines; it turns gray when frozen.
function Net({ layers, x, dx, cy, dy, r, frozen }: { layers: number[]; x: number; dx: number; cy: number; dy: number; r: number; frozen: boolean }) {
  const net = layers.map((n, l) => Array.from({ length: n }, (_, k): [number, number] => [x + l * dx, cy + (k - (n - 1) / 2) * dy]));
  const stroke = frozen ? "var(--faint)" : "var(--blue)";
  const fill = frozen ? "var(--fill-gray)" : "var(--fill-blue)";
  const t = { transition: "stroke .6s, fill .6s" };
  return (
    <g>
      <g strokeWidth="1.2" opacity={frozen ? 0.6 : 0.5} style={{ stroke, ...t }}>
        {net.slice(1).flatMap((layer, l) =>
          layer.flatMap(([x2, y2], j) => net[l].map(([x1, y1], i) => <line key={`${l}-${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />)),
        )}
      </g>
      {net.flat().map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={r} strokeWidth="2" style={{ stroke, fill, ...t }} />
      ))}
    </g>
  );
}

// Build 1 freezes the model, build 2 swaps its next-word layer for a decision head.
function BackboneSlide({ step }: { step: number }) {
  const frozen = step >= 1;
  const swapped = step >= 2;
  return (
    <div className="flex h-full flex-col p-[96px] pt-[72px]">
      <div className="space-y-2">
        <Kicker>HOW WE BUILT LEV</Kicker>
        <h2 className="text-[64px] leading-[1.1]">
          Keep the big model. <span className="font-hand text-orange">Swap its last layer.</span>
        </h2>
      </div>
      <div className="mt-6">
        <Sketch w={1152} h={500} label="A frozen open-weight LLM whose next-word layer is replaced by a small decision head">
          <Label x={55} y={190} size={22}>text</Label>
          <Arrow pts={[[80, 190], [112, 190]]} />
          <Net layers={[4, 6, 6, 6, 4]} x={135} dx={88} cy={190} dy={50} r={13} frozen={frozen} />
          <Label x={311} y={22} size={24}>open-weight LLM</Label>
          <Show on={frozen}>
            <Label x={500} y={22} size={24} color="blue">❄ frozen</Label>
            <Label x={548} y={190} size={16} color="gray">numbers</Label>
          </Show>

          {/* Curly brace and the backbones it stands for */}
          <path d="M115 350 Q115 368 137 368 L289 368 Q311 368 311 388 Q311 368 333 368 L485 368 Q507 368 507 350" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
          {BACKBONES.map((b, i) => (
            <g key={b.name}>
              <image href={b.logo} x={131 + i * 120 - 24} y={402} width={48} height={48} />
              <Label x={131 + i * 120} y={472} size={18}>{b.name}</Label>
            </g>
          ))}

          {/* The original next-word layer: one score for every word in the vocabulary */}
          <g style={{ opacity: swapped ? 0.35 : 1, transition: "opacity .5s ease-out" }}>
            <Arrow pts={[[525, 170], [618, 108]]} />
            <Box x={620} y={70} w={190} h={76} color="gray" title="next-word layer" sub="the model's output" />
            <Arrow pts={[[812, 108], [858, 108]]} />
            {["the  0.031", "a  0.024", "bird  0.012"].map((w, i) => (
              <Label key={w} x={872} y={70 + i * 24} size={17} anchor="start" color="gray">{w}</Label>
            ))}
            <Label x={872} y={146} size={17} anchor="start" color="gray">… 150,000 words</Label>
          </g>
          <Show on={swapped}>
            <path d="M606 58 L1100 160 M606 160 L1100 58" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: "var(--red)" }} />
          </Show>

          {/* The new decision head: one probability for each allowed action, all at once */}
          <Show on={swapped}>
            <Arrow pts={[[525, 210], [618, 270]]} />
            <Box x={620} y={232} w={190} h={76} color="orange" title="decision head" sub="small, trained" />
            <Arrow pts={[[812, 270], [858, 270]]} />
            <Label x={920} y={250} size={20} anchor="end">flap</Label>
            <Bar x={932} y={242} w={128} color="purple" />
            <Label x={1070} y={250} size={17} anchor="start">0.64</Label>
            <Label x={920} y={290} size={20} anchor="end">wait</Label>
            <Bar x={932} y={282} w={72} color="purple" />
            <Label x={1014} y={290} size={17} anchor="start">0.36</Label>
            <Label x={990} y={340} size={18} color="gray">only the allowed actions</Label>
          </Show>
        </Sketch>
      </div>
    </div>
  );
}

// Build 1 caches the action side, so only the state runs on each decision.
function CachingSlide({ step }: { step: number }) {
  const cached = step >= 1;
  return (
    <div className="flex h-full flex-col p-[96px] pt-[72px]">
      <div className="space-y-2">
        <Kicker>HOW WE BUILT LEV</Kicker>
        <h2 className="text-[64px] leading-[1.1]">
          Actions run once. <span className="font-hand text-orange">Only the state runs live.</span>
        </h2>
      </div>
      <div className="mt-6">
        <Sketch w={1152} h={500} label="State and actions go through the frozen LLM separately and meet at the softmax; the action side is cached">
          {/* State side: runs on every decision */}
          <Show on={cached}>
            <Box x={20} y={48} w={800} h={150} color="orange" dashed fill={false} />
            <Label x={30} y={28} size={22} color="orange" anchor="start">every decision: only this runs</Label>
          </Show>
          <Label x={70} y={113} size={22}>state</Label>
          <Label x={70} y={138} size={14} color="gray">as text</Label>
          <Arrow pts={[[110, 123], [142, 123]]} />
          <Net layers={[3, 4, 4, 4, 3]} x={165} dx={88} cy={123} dy={34} r={11} frozen />
          <Arrow pts={[[540, 123], [618, 123]]} />
          <Box x={620} y={88} w={170} h={70} color="orange" title="state head" sub="small MLP" />

          {/* Action side: each action is embedded once, then reused for every state */}
          <g style={{ opacity: cached ? 0.45 : 1, transition: "opacity .5s ease-out" }}>
            <Label x={70} y={318} size={22}>"flap"</Label>
            <Label x={70} y={343} size={22}>"wait"</Label>
            <Arrow pts={[[110, 330], [142, 330]]} />
            <Net layers={[3, 4, 4, 4, 3]} x={165} dx={88} cy={330} dy={34} r={11} frozen />
            <Arrow pts={[[540, 330], [618, 330]]} />
            <Box x={620} y={295} w={170} h={70} color="orange" title="action head" sub="small MLP" />
          </g>
          <Show on={cached}>
            <Box x={20} y={255} w={800} h={150} color="green" dashed fill={false} />
            <Label x={30} y={428} size={22} color="green" anchor="start">✓ computed once, cached, reused for every state</Label>
          </Show>
          <Label x={300} y={226} size={18} color="blue">❄ same frozen LLM, separate contexts</Label>

          {/* The two sides meet only at the end */}
          <Arrow pts={[[792, 123], [868, 200]]} />
          <Arrow pts={[[792, 330], [868, 252]]} />
          <Box x={870} y={191} w={180} h={70} color="purple" title="softmax" sub="state meets actions" />
          <Arrow pts={[[1052, 226], [1084, 226]]} />
          <Label x={1118} y={214} size={20}>flap</Label>
          <Label x={1118} y={240} size={17} color="gray">0.64</Label>
        </Sketch>
      </div>
    </div>
  );
}

// ---------- Slides 11-12: Playground races (recorded) ----------

function PlaygroundSlide({ game, src }: { game: string; src: string }) {
  return (
    <div className="flex h-full flex-col items-center px-[96px] pt-[56px] pb-[48px]">
      <div className="w-full space-y-2">
        <Kicker>PLAYGROUND · JEV VS LEV VS A TEXT LLM</Kicker>
        <h2 className="text-[64px] leading-[1.1]">
          Live race: <span className="font-hand text-orange">{game}</span>
        </h2>
      </div>
      <div className="mt-6">
        <Clip src={src} at={0} step={0} className="h-[780px] aspect-video" />
      </div>
    </div>
  );
}

// ---------- Deck ----------

type SlideDef = { builds: number; render: (step: number) => ReactNode };

const SLIDES: SlideDef[] = [
  { builds: CLIPS.length, render: (step) => <TitleSlide step={step} /> },
  { builds: 0, render: () => <JevCallSlide /> },
  { builds: 3, render: (step) => <SystemsSlide step={step} /> },
  { builds: 0, render: () => <RaceSlide /> },
  { builds: 3, render: (step) => <UseCasesSlide step={step} /> },
  { builds: 0, render: () => <ClosedSourceSlide /> },
  { builds: 0, render: () => <OpenModelsSlide /> },
  { builds: 0, render: () => <LevSlide /> },
  { builds: 2, render: (step) => <BackboneSlide step={step} /> },
  { builds: 1, render: (step) => <CachingSlide step={step} /> },
  { builds: 0, render: () => <PlaygroundSlide game="Flappy Bird" src="/slides/playground-flappy.mp4" /> },
  { builds: 0, render: () => <PlaygroundSlide game="Dino Runner" src="/slides/playground-dino.mp4" /> },
];

type Pos = { i: number; step: number };

export default function Slides() {
  const [pos, setPos] = useState<Pos | null>(null);

  const go = useCallback((dir: 1 | -1) => {
    setPos((p) => {
      if (!p) return p;
      if (dir > 0) {
        if (p.step < SLIDES[p.i].builds) return { i: p.i, step: p.step + 1 };
        return p.i < SLIDES.length - 1 ? { i: p.i + 1, step: 0 } : p;
      }
      if (p.step > 0) return { i: p.i, step: p.step - 1 };
      return p.i > 0 ? { i: p.i - 1, step: SLIDES[p.i - 1].builds } : p;
    });
  }, []);

  const start = (i: number) => {
    setPos({ i, step: 0 });
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const exit = useCallback(() => {
    setPos(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const presenting = pos !== null;
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") exit();
      else if ((k === " " && e.shiftKey) || k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") { e.preventDefault(); go(-1); }
      else if (k === " " || k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") { e.preventDefault(); go(1); }
      else if (k === "Home") setPos({ i: 0, step: 0 });
      else if (k === "End") setPos({ i: SLIDES.length - 1, step: SLIDES[SLIDES.length - 1].builds });
    };
    // A wheel flick moves one step; the lock stops one flick from skipping several.
    let sum = 0;
    let locked = false;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(timer);
      timer = window.setTimeout(() => { locked = false; sum = 0; }, 250);
      if (locked) return;
      sum += e.deltaMode ? Math.sign(e.deltaY) * 60 : e.deltaY;
      if (Math.abs(sum) >= 60) { locked = true; go(sum > 0 ? 1 : -1); sum = 0; }
    };
    const onFullscreen = () => { if (!document.fullscreenElement) setPos(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("fullscreenchange", onFullscreen);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.body.style.overflow = "";
      clearTimeout(timer);
    };
  }, [presenting, go, exit]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => start(0)} className="sketch px-4 py-1 font-hand text-xl hover:bg-fill-orange">
          ▶ Present
        </button>
        <span className="text-base text-muted">Click, → or scroll to step through. Esc to leave.</span>
      </div>

      {SLIDES.map((s, i) => (
        <div key={i} className="sketch-soft overflow-hidden">
          <Fit>{s.render(Infinity)}</Fit>
        </div>
      ))}

      {pos && (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer select-none items-center justify-center bg-paper"
          onClick={(e) => go(e.clientX < window.innerWidth / 2 ? -1 : 1)}
        >
          <div style={{ width: "min(100vw, calc(100dvh * 16 / 9))" }}>
            <Fit key={pos.i}>{SLIDES[pos.i].render(pos.step)}</Fit>
          </div>
          <div className="fixed bottom-4 right-4 font-hand text-sm text-muted">
            {pos.i + 1} / {SLIDES.length}
          </div>
        </div>
      )}
    </div>
  );
}
