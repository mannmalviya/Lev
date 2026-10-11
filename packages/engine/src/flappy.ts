// Flappy Bird, ported from the classic FlapPyBird main loop (sourabhv/FlapPyBird, MIT).
// Same constants as flappy-bird-gymnasium. One step = one frame at 30 FPS.

import { randomInt } from "./rng";
import type { ChoiceQuestion, Game } from "./types";

export const FLAPPY = {
  WIDTH: 288,
  HEIGHT: 512,
  BASE_Y: 404, // SCREENHEIGHT * 0.79
  BASE_SHIFT: 48, // base.png width (336) - background width (288)
  PIPE_W: 52,
  PIPE_H: 320,
  PIPE_GAP: 100,
  PIPE_VEL_X: -4,
  BIRD_X: 57, // int(SCREENWIDTH * 0.2)
  BIRD_W: 34,
  BIRD_H: 24,
  MAX_VEL_Y: 8, // was 10: slower falls
  ACC_Y: 1,
  FLAP_VEL: -6, // was -9: smaller, finer hops
  ROT_START: 45,
  ROT_VEL: 3,
} as const;

export type FlappyAction = "flap" | "wait";

export interface Pipe {
  x: number;
  gapY: number; // y of the top of the gap
}

export interface FlappyState {
  frame: number;
  rng: { seed: number };
  birdY: number; // top of the bird
  vy: number;
  rot: number;
  flapped: boolean;
  pipes: Pipe[];
  score: number;
  baseX: number;
  over: boolean;
}

const F = FLAPPY;

function randomGapY(rng: { seed: number }): number {
  // random.randrange(0, int(BASEY * 0.6 - PIPEGAPSIZE)) + int(BASEY * 0.2)
  return randomInt(rng, 0, Math.floor(F.BASE_Y * 0.6 - F.PIPE_GAP) - 1) + Math.floor(F.BASE_Y * 0.2);
}

function hits(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function crashed(s: FlappyState): boolean {
  if (s.birdY + F.BIRD_H >= F.BASE_Y - 1) return true;
  for (const p of s.pipes) {
    const upper = hits(F.BIRD_X, s.birdY, F.BIRD_W, F.BIRD_H, p.x, p.gapY - F.PIPE_H, F.PIPE_W, F.PIPE_H);
    const lower = hits(F.BIRD_X, s.birdY, F.BIRD_W, F.BIRD_H, p.x, p.gapY + F.PIPE_GAP, F.PIPE_W, F.PIPE_H);
    if (upper || lower) return true;
  }
  return false;
}

/** The first pipe the bird has not fully passed. */
export function nextPipes(s: FlappyState): Pipe[] {
  return s.pipes.filter((p) => p.x + F.PIPE_W > F.BIRD_X);
}

// Heights are measured UP from the floor. Screen y (down = bigger) confused both Jev and
// Qwen in tests, so the state never shows raw screen coordinates.
export const FLAPPY_QUESTION: ChoiceQuestion = {
  type: "choice",
  instructions:
    "Flappy Bird. Keep the bird inside the gap of the next pipe. Heights are in pixels above the floor. Flapping pushes the bird up; waiting lets gravity pull it down. Pick the action for this moment.",
  criteria: {
    flap: "Flap: push the bird up. Right when the bird is below the gap, or falling toward the bottom of the gap.",
    wait: "Wait: let the bird fall. Right when the bird is above the gap, or rising toward the top of the gap.",
  },
};

/** Height above the floor of a screen y. */
const height = (y: number) => Math.round(F.BASE_Y - y);

export const flappy: Game<FlappyState, FlappyAction> = {
  id: "flappy",
  fps: 30,
  width: F.WIDTH,
  height: F.HEIGHT,
  actions: ["flap", "wait"],
  defaultAction: "wait",
  questionId: "action",
  question: FLAPPY_QUESTION,

  init(seed) {
    const rng = { seed };
    return {
      frame: 0,
      rng,
      birdY: Math.floor((F.HEIGHT - F.BIRD_H) / 2),
      vy: F.FLAP_VEL,
      rot: F.ROT_START,
      flapped: false,
      pipes: [
        { x: F.WIDTH + 200, gapY: randomGapY(rng) },
        { x: F.WIDTH + 200 + F.WIDTH / 2, gapY: randomGapY(rng) },
      ],
      score: 0,
      baseX: 0,
      over: false,
    };
  },

  step(s, input) {
    if (s.over) return;
    s.frame++;

    if (input === "flap" && s.birdY > -2 * F.BIRD_H) {
      s.vy = F.FLAP_VEL;
      s.flapped = true;
    }

    if (crashed(s)) {
      s.over = true;
      return;
    }

    const birdMid = F.BIRD_X + F.BIRD_W / 2;
    for (const p of s.pipes) {
      const pipeMid = p.x + F.PIPE_W / 2;
      if (pipeMid <= birdMid && birdMid < pipeMid + 4) s.score++;
    }

    s.baseX = -((-s.baseX + 100) % F.BASE_SHIFT);

    if (s.rot > -90) s.rot -= F.ROT_VEL;
    if (s.vy < F.MAX_VEL_Y && !s.flapped) s.vy += F.ACC_Y;
    if (s.flapped) {
      s.flapped = false;
      s.rot = F.ROT_START;
    }
    s.birdY += Math.min(s.vy, F.BASE_Y - s.birdY - F.BIRD_H);

    for (const p of s.pipes) p.x += F.PIPE_VEL_X;
    if (s.pipes[0].x > 0 && s.pipes[0].x < 5) s.pipes.push({ x: F.WIDTH + 10, gapY: randomGapY(s.rng) });
    if (s.pipes[0].x < -F.PIPE_W) s.pipes.shift();
  },

  hold: () => "wait",

  clone: (s) => ({ ...s, rng: { ...s.rng }, pipes: s.pipes.map((p) => ({ ...p })) }),

  isOver: (s) => s.over,

  score: (s) => s.score,

  stateText(s) {
    const [p1, p2] = nextPipes(s);
    const bird = height(s.birdY + F.BIRD_H / 2);
    const gapBottom = height(p1.gapY + F.PIPE_GAP);
    const gapTop = height(p1.gapY);
    const center = (gapBottom + gapTop) / 2;
    const d = Math.round(bird - center);
    const lines = [
      `bird_height=${bird} bird_speed=${Math.abs(s.vy)} moving_${s.vy < 0 ? "up" : "down"}`,
      `next_pipe_distance=${p1.x - (F.BIRD_X + F.BIRD_W)} gap_bottom=${gapBottom} gap_top=${gapTop} gap_center=${center}`,
      `bird_is ${Math.abs(d)} px ${d > 0 ? "ABOVE" : "BELOW"} the gap center`,
    ];
    if (p2) lines.push(`pipe_after_distance=${p2.x - (F.BIRD_X + F.BIRD_W)} pipe_after_gap_center=${height(p2.gapY + F.PIPE_GAP / 2)}`);
    return lines.join("\n");
  },
};
