"use client";

import { GAMES, PILOTS, type DinoState, type FlappyState, type Game, type GameId } from "@s1/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lane, type Control, type Difficulty, type Driver, type LaneStats, type Mode } from "@/lib/lane";
import { BASELINE_MODEL, listModels } from "@/lib/models";
import { drawDino, loadDinoSprite } from "@/lib/render-dino";
import { drawFlappy, loadFlappyImages, type FlappyImages } from "@/lib/render-flappy";

/** A race ends when every lane is done, or after this many seconds of real time. */
export const RACE_SECONDS = 60;

type LaneKey = "jev" | "baseline" | "ours" | "you";
const LANE_META: Record<LaneKey, { name: string; color: string; fill: string }> = {
  jev: { name: "Jev", color: "var(--purple)", fill: "var(--fill-purple)" },
  baseline: { name: "Baseline LLM", color: "var(--blue)", fill: "var(--fill-blue)" },
  ours: { name: "Lev", color: "var(--orange)", fill: "var(--fill-orange)" },
  you: { name: "You", color: "var(--green)", fill: "var(--fill-green)" },
};
/** Our lane always runs Lev: the gateway routes each game to its own head. */
const LEV_MODEL = "ours-lev";
const ACTION_COLORS = ["var(--orange)", "var(--blue)", "var(--purple)"];

type Phase = "idle" | "countdown" | "running" | "finished";

function driverFor(key: LaneKey): Driver {
  if (key === "jev") return { kind: "model", target: { via: "jev" } };
  if (key === "baseline") return { kind: "model", target: { via: "gateway", model: BASELINE_MODEL } };
  if (key === "ours") return { kind: "model", target: { via: "gateway", model: LEV_MODEL } };
  return { kind: "human" };
}


export default function Race({ gameId, title }: { gameId: GameId; title: string }) {
  const game = GAMES[gameId] as unknown as Game<unknown, string>;
  const vertical = gameId === "flappy";

  const [mode, setMode] = useState<Mode>("lockstep");
  const hasPilot = gameId in PILOTS;
  const [control, setControl] = useState<Control>(hasPilot ? "intent" : "direct");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [seed] = useState(42);
  const [withHuman, setWithHuman] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<Partial<Record<LaneKey, LaneStats>>>({});

  const keys: LaneKey[] = withHuman ? ["jev", "ours", "baseline", "you"] : ["jev", "ours", "baseline"];
  const lanes = useRef<Partial<Record<LaneKey, Lane>>>({});
  const canvases = useRef<Partial<Record<LaneKey, HTMLCanvasElement | null>>>({});
  const phaseRef = useRef<Phase>("idle");
  const settings = useRef({ mode, difficulty });
  settings.current = { mode, difficulty };
  const startedAt = useRef(0);
  const countdownId = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Only to show when the GX10 gateway is unreachable.
  useEffect(() => {
    listModels().catch((e) => setModelsError(String(e.message ?? e)));
  }, []);

  const buildLanes = useCallback(() => {
    for (const l of Object.values(lanes.current)) l?.stop();
    lanes.current = Object.fromEntries(keys.map((k) => [k, new Lane(game, driverFor(k), seed, control)]));
    setStats(Object.fromEntries(keys.map((k) => [k, { ...lanes.current[k]!.stats }])));
    setElapsed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, seed, withHuman, control]);

  // Fresh lanes whenever the setup changes while not racing.
  useEffect(() => {
    if (phaseRef.current === "running" || phaseRef.current === "countdown") return;
    buildLanes();
    setPhaseBoth("idle");
  }, [buildLanes]);

  function setPhaseBoth(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function start() {
    buildLanes();
    setPhaseBoth("countdown");
    setCountdown(3);
    let n = 3;
    clearInterval(countdownId.current);
    countdownId.current = setInterval(() => {
      n--;
      if (n > 0) return setCountdown(n);
      clearInterval(countdownId.current);
      startedAt.current = performance.now();
      for (const l of Object.values(lanes.current)) l?.start(settings.current.mode);
      setPhaseBoth("running");
    }, 1000);
  }

  function stop() {
    clearInterval(countdownId.current);
    for (const l of Object.values(lanes.current)) l?.stop();
    setPhaseBoth("finished");
  }

  // Main loop: tick real-time lanes, draw every lane, end the race.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let flappyImgs: FlappyImages | null = null;
    let dinoSprite: HTMLImageElement | null = null;
    if (gameId === "flappy") loadFlappyImages().then((i) => (flappyImgs = i));
    else loadDinoSprite().then((i) => (dinoSprite = i));

    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const p = phaseRef.current;
      const all = Object.values(lanes.current) as Lane[];
      if (p === "running") {
        for (const l of all) l.tick(dt, settings.current.mode, settings.current.difficulty);
        const done = all.every((l) => l.stats.status !== "running");
        if (done || now - startedAt.current >= RACE_SECONDS * 1000) {
          for (const l of all) l.stop();
          phaseRef.current = "finished";
          setPhase("finished");
        }
      }
      for (const [k, lane] of Object.entries(lanes.current) as [LaneKey, Lane][]) {
        const ctx = canvases.current[k]?.getContext("2d");
        if (!ctx) continue;
        const overlay = lane.stats.status === "ready" ? "ready" : lane.stats.status === "dead" ? "gameover" : null;
        if (gameId === "flappy" && flappyImgs) drawFlappy(ctx, lane.state as FlappyState, flappyImgs, overlay);
        if (gameId === "dino" && dinoSprite) {
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          drawDino(ctx, lane.state as DinoState, dinoSprite, overlay);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(countdownId.current);
      for (const l of Object.values(lanes.current)) l?.stop();
    };
  }, [gameId]);

  // Copy lane stats into React a few times per second.
  useEffect(() => {
    const id = setInterval(() => {
      setStats(Object.fromEntries(Object.entries(lanes.current).map(([k, l]) => [k, { ...l!.stats }])));
      if (phaseRef.current === "running") setElapsed((performance.now() - startedAt.current) / 1000);
    }, 150);
    return () => clearInterval(id);
  }, []);

  // Keyboard for the human lane.
  useEffect(() => {
    if (!withHuman) return;
    const down = (e: KeyboardEvent) => {
      const you = lanes.current.you;
      if (!you || phaseRef.current !== "running") return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (!e.repeat) you.press(gameId === "flappy" ? "flap" : "jump");
      } else if (e.code === "ArrowDown" && gameId === "dino") {
        e.preventDefault();
        you.press("duck");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "ArrowDown") lanes.current.you?.release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [withHuman, gameId]);

  function onCanvasPointer(k: LaneKey, e: React.PointerEvent<HTMLCanvasElement>) {
    if (k !== "you" || phaseRef.current !== "running") return;
    const you = lanes.current.you!;
    if (gameId === "flappy") return you.press("flap");
    const r = e.currentTarget.getBoundingClientRect();
    you.press(e.clientY - r.top < r.height / 2 ? "jump" : "duck");
  }

  const busy = phase === "countdown" || phase === "running";
  const ranking =
    phase === "finished"
      ? keys.map((k) => ({ k, score: stats[k]?.score ?? 0 })).sort((a, b) => b.score - a.score)
      : [];

  return (
    // Wider than the text column, so the game frames can be big.
    <div className="relative left-1/2 w-[min(calc(100vw-2rem),1500px)] -translate-x-1/2 space-y-4" style={{ "--lanes": keys.length } as React.CSSProperties}>
      {/* Controls */}
      <div className="sketch bg-white/60 px-4 py-2 flex flex-wrap items-end gap-x-5 gap-y-2 font-hand text-base">
        <h1 className="mr-2 self-center font-hand text-3xl">{title}</h1>
        <Field label="Mode">
          <Segmented value={mode} disabled={busy} onChange={(v) => setMode(v as Mode)}
            options={[["lockstep", "Lockstep"], ["realtime", "Real time"]]} />
        </Field>
        {hasPilot && (
          <Field label="Control">
            <Segmented value={control} disabled={busy} onChange={(v) => setControl(v as Control)}
              options={[["direct", "Keys"], ["intent", "Intent"]]} />
          </Field>
        )}
        <Field label={mode === "lockstep" ? "Speed (you only)" : "Speed"}>
          <Segmented value={difficulty} disabled={busy} onChange={(v) => setDifficulty(v as Difficulty)}
            options={[["easy", "Easy ¼×"], ["medium", "Medium ½×"], ["hard", "Hard 1×"]]} />
        </Field>
        <label className="flex items-center gap-2 pb-1">
          <input type="checkbox" checked={withHuman} disabled={busy} onChange={(e) => setWithHuman(e.target.checked)} className="size-4 accent-[var(--green)]" />
          Play too
        </label>
        <div className="ml-auto flex items-center gap-3">
          {phase === "running" && <span className="font-serif tabular-nums text-muted">{Math.max(0, RACE_SECONDS - elapsed).toFixed(0)} s left</span>}
          {busy ? (
            <button onClick={stop} className="sketch bg-fill-gray px-5 py-1 text-lg hover:bg-white">Stop</button>
          ) : (
            <button onClick={start} className="sketch bg-fill-orange px-5 py-1 text-lg hover:bg-orange hover:text-white">
              {phase === "finished" ? "Race again" : "Start race"}
            </button>
          )}
        </div>
      </div>

      <p className="-mt-3 text-sm text-muted">
        {withHuman && (gameId === "flappy" ? " You: Space / click / tap to flap." : " You: Space or ↑ to jump, ↓ to duck. On a phone, tap top half to jump, bottom half to duck.")}
        {modelsError && <span className="text-red"> · GX10 gateway unreachable ({modelsError}).</span>}
      </p>

      {phase === "finished" && (
        <div className="sketch bg-fill-green/50 px-4 py-2 font-hand text-lg flex flex-wrap gap-x-6">
          <span>Results:</span>
          {ranking.map((r, i) => (
            <span key={r.k}>
              {i + 1}. <span style={{ color: LANE_META[r.k].color }}>{LANE_META[r.k].name}</span> — {r.score}
            </span>
          ))}
        </div>
      )}

      {/* Lanes */}
      <div className={vertical ? `grid grid-cols-2 gap-5 ${keys.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}` : "flex flex-col gap-6"}>
        {keys.map((k) => {
          const canvas = (
            <div className="relative">
              <canvas
                ref={(el) => {
                  canvases.current[k] = el;
                }}
                width={gameId === "flappy" ? game.width : game.width * 2}
                height={gameId === "flappy" ? game.height : game.height * 2}
                onPointerDown={(e) => onCanvasPointer(k, e)}
                onPointerUp={() => k === "you" && gameId === "dino" && lanes.current.you?.release()}
                className={`pixelated block touch-none ${k === "ours" ? "border-4" : "border-2"} w-full md:w-auto ${vertical ? "md:h-[clamp(300px,calc(100dvh-330px),768px)]" : "md:h-[clamp(110px,calc((100dvh-175px-var(--lanes)*57px)/var(--lanes)),265px)]"}`}
                style={{ borderColor: LANE_META[k].color, boxShadow: k === "ours" ? "0 0 18px var(--orange)" : undefined }}
              />
              {k === "ours" && (
                <span className="sketch absolute -top-3 left-3 bg-orange px-2 font-hand text-sm text-white">OURS</span>
              )}
              {phase === "countdown" && (
                <div className="absolute inset-0 grid place-items-center font-hand text-6xl text-white" style={{ textShadow: "2px 2px 0 #000" }}>
                  {countdown}
                </div>
              )}
              {stats[k]?.status === "offline" && (
                <div className="absolute inset-0 grid place-items-center bg-white/70 font-hand text-xl text-red" title={stats[k]?.message ?? ""}>offline</div>
              )}
            </div>
          );
          const header = (
            <LaneHeader k={k} stats={stats[k]} />
          );
          const panel =
            k === "you" ? (
              <div className="border border-ink bg-white/70 px-3 py-2 font-serif text-sm text-muted">moves {stats[k]?.decisions ?? 0}</div>
            ) : (
              <JudgmentPanel options={Object.keys((lanes.current[k]?.question ?? game.question).criteria)} stats={stats[k]} />
            );
          return vertical ? (
            <div key={k} className="mx-auto w-full space-y-1.5 md:w-fit">
              {canvas}
              {header}
              {panel}
            </div>
          ) : (
            <div key={k} className="mx-auto w-full space-y-1 md:w-fit">
              {header}
              {/* The panel takes the canvas's height (h-0 + min-h-full), so their tops and bottoms line up. */}
              <div className="grid gap-3 md:grid-cols-[auto_18rem]">
                {canvas}
                <div className="md:h-0 md:min-h-full md:overflow-y-auto md:[&>*]:h-full">{panel}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange, disabled }: { value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button key={v} disabled={disabled} onClick={() => onChange(v)}
          className={`sketch-soft px-2.5 py-0.5 disabled:opacity-50 ${value === v ? "bg-ink text-paper" : "bg-white hover:bg-fill-gray"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function LaneHeader({ k, stats: s }: { k: LaneKey; stats?: LaneStats }) {
  const meta = LANE_META[k];
  const status = s?.status ?? "ready";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-3 font-hand text-lg">
        <span style={{ color: meta.color }}>
          {meta.name}
          {k === "ours" && <span className="text-sm text-muted"> · our model, runs on GX10</span>}
        </span>
        <span className="font-serif text-base">
          Score <b className="tabular-nums">{s?.score ?? 0}</b>
        </span>
      </div>
      <span className="rounded px-1.5 font-hand text-xs" style={{ background: status === "running" ? meta.fill : "var(--fill-gray)" }}>
        {status}
      </span>
    </div>
  );
}

/** One bar per action with its probability. The action the model picked is bold. */
function JudgmentPanel({ options, stats: s }: { options: string[]; stats?: LaneStats }) {
  const probs = s?.probabilities ?? null;
  return (
    <div className="flex flex-col justify-center gap-1.5 border border-ink bg-white/70 px-3 py-2">
      {options.map((opt, i) => {
        const p = probs?.[opt] ?? 0;
        const chosen = s?.lastAction === opt;
        return (
          <div key={opt} className="flex items-center gap-2 text-sm">
            <span className={`w-12 shrink-0 font-hand ${chosen ? "text-ink" : "text-faint"}`}>{opt}</span>
            <div className="h-2.5 flex-1 overflow-hidden border border-faint bg-fill-gray">
              <div className="h-full transition-[width] duration-100"
                style={{ width: `${p * 100}%`, background: ACTION_COLORS[i % 3], opacity: chosen ? 1 : 0.45 }} />
            </div>
            <span className={`w-9 shrink-0 text-right font-serif tabular-nums ${chosen ? "font-bold" : "text-muted"}`}>
              {probs ? p.toFixed(2) : "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
