// Chrome Dino (t-rex runner), ported from Chromium's offline.js (via wayou/t-rex-runner, BSD-3).
// One step = one frame at a fixed 60 FPS, so deltaTime is always 1000/60 ms.
// Clouds, night mode and the bumpy horizon are cosmetic and live in the renderer.

import { nextRandom, randomInt } from "./rng";
import type { ChoiceQuestion, Game } from "./types";

export const DINO = {
  WIDTH: 600,
  HEIGHT: 150,
  ACCELERATION: 0.001,
  CLEAR_FRAMES: 180, // CLEAR_TIME 3000 ms at 60 FPS
  GAP_COEFFICIENT: 0.6,
  MAX_GAP_COEFFICIENT: 1.5,
  MAX_OBSTACLE_LENGTH: 3,
  MAX_OBSTACLE_DUPLICATION: 2,
  MAX_SPEED: 13,
  SPEED: 6,
  TREX_X: 50,
  TREX_W: 44,
  TREX_H: 47,
  TREX_W_DUCK: 59,
  GROUND_Y: 93, // HEIGHT - TREX_H - BOTTOM_PAD(10)
  GROUND_LINE: 140, // GROUND_Y + TREX_H: bottom of everything on the ground
  INITIAL_JUMP_VELOCITY: -10,
  GRAVITY: 0.6,
  DROP_VELOCITY: -5,
  MIN_JUMP_HEIGHT: 30,
  MAX_JUMP_HEIGHT: 30,
  SPEED_DROP_COEFFICIENT: 3,
  DISTANCE_COEFFICIENT: 0.025,
} as const;

const D = DINO;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

export type ObstacleType = "CACTUS_SMALL" | "CACTUS_LARGE" | "PTERODACTYL";

interface ObstacleSpec {
  type: ObstacleType;
  width: number;
  height: number;
  yPos: number[];
  multipleSpeed: number;
  minGap: number;
  minSpeed: number;
  speedOffset: number;
  boxes: Box[];
}

export const OBSTACLES: ObstacleSpec[] = [
  {
    type: "CACTUS_SMALL", width: 17, height: 35, yPos: [105], multipleSpeed: 4, minGap: 120, minSpeed: 0, speedOffset: 0,
    boxes: [box(0, 7, 5, 27), box(4, 0, 6, 34), box(10, 4, 7, 14)],
  },
  {
    type: "CACTUS_LARGE", width: 25, height: 50, yPos: [90], multipleSpeed: 7, minGap: 120, minSpeed: 0, speedOffset: 0,
    boxes: [box(0, 12, 7, 38), box(8, 0, 7, 49), box(13, 10, 10, 38)],
  },
  {
    type: "PTERODACTYL", width: 46, height: 40, yPos: [100, 75, 50], multipleSpeed: 999, minGap: 150, minSpeed: 8.5, speedOffset: 0.8,
    boxes: [box(15, 15, 16, 5), box(18, 21, 24, 6), box(2, 14, 4, 3), box(6, 10, 4, 7), box(10, 8, 6, 9)],
  },
];

const TREX_BOXES_RUNNING = [box(22, 0, 17, 16), box(1, 18, 30, 9), box(10, 35, 14, 8), box(1, 24, 29, 5), box(5, 30, 21, 4), box(9, 34, 15, 4)];
const TREX_BOXES_DUCKING = [box(1, 18, 55, 25)];

export interface Obstacle {
  type: ObstacleType;
  x: number;
  y: number;
  size: number;
  width: number;
  gap: number;
  speedOffset: number;
  followingCreated: boolean;
}

export interface Trex {
  y: number;
  vy: number;
  jumping: boolean;
  ducking: boolean;
  speedDrop: boolean;
  reachedMinHeight: boolean;
}

export interface DinoState {
  frame: number;
  rng: { seed: number };
  speed: number;
  distance: number;
  trex: Trex;
  obstacles: Obstacle[];
  history: ObstacleType[];
  groundX: number;
  over: boolean;
}

export type DinoAction = "jump" | "duck" | "run";

const spec = (t: ObstacleType) => OBSTACLES.find((o) => o.type === t)!;

function addObstacle(s: DinoState) {
  for (;;) {
    const o = OBSTACLES[randomInt(s.rng, 0, OBSTACLES.length - 1)];
    let dup = 0;
    for (const h of s.history) dup = h === o.type ? dup + 1 : 0;
    if (dup >= D.MAX_OBSTACLE_DUPLICATION || s.speed < o.minSpeed) continue;

    let size = randomInt(s.rng, 1, D.MAX_OBSTACLE_LENGTH);
    if (size > 1 && o.multipleSpeed > s.speed) size = 1;
    const width = o.width * size;
    const y = o.yPos[randomInt(s.rng, 0, o.yPos.length - 1)];
    const speedOffset = o.speedOffset ? (nextRandom(s.rng) > 0.5 ? o.speedOffset : -o.speedOffset) : 0;
    const minGap = Math.round(width * s.speed + o.minGap * D.GAP_COEFFICIENT);
    const gap = randomInt(s.rng, minGap, Math.round(minGap * D.MAX_GAP_COEFFICIENT));

    s.obstacles.push({ type: o.type, x: D.WIDTH + o.width, y, size, width, gap, speedOffset, followingCreated: false });
    s.history.unshift(o.type);
    if (s.history.length > 1) s.history.splice(D.MAX_OBSTACLE_DUPLICATION);
    return;
  }
}

function overlap(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.h + a.y > b.y;
}

function collides(o: Obstacle, t: Trex): boolean {
  const sp = spec(o.type);
  const trexBox = box(D.TREX_X + 1, t.y + 1, D.TREX_W - 2, D.TREX_H - 2);
  const obsBox = box(o.x + 1, o.y + 1, o.width - 2, sp.height - 2);
  if (!overlap(trexBox, obsBox)) return false;

  const obsBoxes = sp.boxes.map((b) => ({ ...b }));
  if (o.size > 1 && o.type !== "PTERODACTYL") {
    obsBoxes[1].w = o.width - obsBoxes[0].w - obsBoxes[2].w;
    obsBoxes[2].x = o.width - obsBoxes[2].w;
  }
  for (const tb of t.ducking ? TREX_BOXES_DUCKING : TREX_BOXES_RUNNING) {
    for (const ob of obsBoxes) {
      const a = box(tb.x + trexBox.x, tb.y + trexBox.y, tb.w, tb.h);
      const b = box(ob.x + obsBox.x, ob.y + obsBox.y, ob.w, ob.h);
      if (overlap(a, b)) return true;
    }
  }
  return false;
}

function applyInput(s: DinoState, input: DinoAction) {
  const t = s.trex;
  if (input !== "duck" && (t.ducking || t.speedDrop)) {
    t.speedDrop = false;
    t.ducking = false;
  }
  if (input === "duck") {
    if (t.jumping) {
      if (!t.speedDrop) {
        t.speedDrop = true;
        t.vy = 1;
      }
    } else if (!t.ducking) {
      t.ducking = true;
    }
  }
  if (input === "jump" && !t.jumping && !t.ducking) {
    t.vy = D.INITIAL_JUMP_VELOCITY - s.speed / 10;
    t.jumping = true;
    t.reachedMinHeight = false;
    t.speedDrop = false;
  }
}

function updateJump(t: Trex) {
  t.y += Math.round(t.speedDrop ? t.vy * D.SPEED_DROP_COEFFICIENT : t.vy);
  t.vy += D.GRAVITY;
  if (t.y < D.GROUND_Y - D.MIN_JUMP_HEIGHT || t.speedDrop) t.reachedMinHeight = true;
  if ((t.y < D.MAX_JUMP_HEIGHT || t.speedDrop) && t.reachedMinHeight && t.vy < D.DROP_VELOCITY) t.vy = D.DROP_VELOCITY;
  if (t.y > D.GROUND_Y) {
    t.y = D.GROUND_Y;
    t.vy = 0;
    t.jumping = false;
    t.ducking = false;
    t.speedDrop = false;
  }
}

export const DINO_QUESTION: ChoiceQuestion = {
  type: "choice",
  instructions:
    "Keep the dino alive. Jump over obstacles on the ground or low birds. Duck under birds at head height. Pick the action for this moment.",
  criteria: {
    jump: "Jump: leap up. Works only on the ground.",
    duck: "Duck: crouch low. In the air, it drops the dino fast.",
    run: "Run: do nothing and keep running.",
  },
};

const NAMES: Record<ObstacleType, string> = {
  CACTUS_SMALL: "cactus_small",
  CACTUS_LARGE: "cactus_large",
  PTERODACTYL: "pterodactyl",
};

/** Obstacles the dino has not passed yet, nearest first. */
export function upcoming(s: DinoState): Obstacle[] {
  return s.obstacles.filter((o) => o.x + o.width > D.TREX_X);
}

export const dino: Game<DinoState, DinoAction> = {
  id: "dino",
  fps: 60,
  width: D.WIDTH,
  height: D.HEIGHT,
  actions: ["jump", "duck", "run"],
  defaultAction: "run",
  questionId: "action",
  question: DINO_QUESTION,

  init(seed) {
    return {
      frame: 0,
      rng: { seed },
      speed: D.SPEED,
      distance: 0,
      trex: { y: D.GROUND_Y, vy: 0, jumping: false, ducking: false, speedDrop: false, reachedMinHeight: false },
      obstacles: [],
      history: [],
      groundX: 0,
      over: false,
    };
  },

  step(s, input) {
    if (s.over) return;
    s.frame++;
    applyInput(s, input);
    if (s.trex.jumping) updateJump(s.trex);

    s.groundX -= Math.floor(s.speed);
    const hasObstacles = s.frame > D.CLEAR_FRAMES;
    if (hasObstacles) {
      for (const o of s.obstacles) o.x -= Math.floor(s.speed + o.speedOffset);
      s.obstacles = s.obstacles.filter((o) => o.x + o.width > 0);
      const last = s.obstacles[s.obstacles.length - 1];
      if (!last) addObstacle(s);
      else if (!last.followingCreated && last.x + last.width + last.gap < D.WIDTH) {
        addObstacle(s);
        last.followingCreated = true;
      }
    }

    if (hasObstacles && s.obstacles[0] && collides(s.obstacles[0], s.trex)) {
      s.over = true;
      return;
    }
    s.distance += s.speed;
    if (s.speed < D.MAX_SPEED) s.speed += D.ACCELERATION;
  },

  hold: (a) => (a === "duck" ? "duck" : "run"),

  clone: (s) => ({
    ...s,
    rng: { ...s.rng },
    trex: { ...s.trex },
    obstacles: s.obstacles.map((o) => ({ ...o })),
    history: [...s.history],
  }),

  isOver: (s) => s.over,

  score: (s) => Math.round(s.distance * D.DISTANCE_COEFFICIENT),

  stateText(s) {
    const t = s.trex;
    const pose = t.jumping ? "jumping" : t.ducking ? "ducking" : "running";
    const lines = [
      `speed=${s.speed.toFixed(1)} dino=${pose} dino_height=${D.GROUND_Y - t.y} dino_up_speed=${-Math.round(t.vy)}`,
    ];
    const [o1, o2] = upcoming(s);
    const dx = (o: Obstacle) => o.x - (D.TREX_X + D.TREX_W);
    const bottom = (o: Obstacle) => D.GROUND_LINE - (o.y + spec(o.type).height);
    if (!o1) {
      lines.push("obs1=none");
    } else {
      const frames = Math.max(0, Math.round(dx(o1) / (s.speed + o1.speedOffset)));
      lines.push(
        `obs1=${NAMES[o1.type]} obs1_dx=${dx(o1)} obs1_width=${o1.width} obs1_height=${spec(o1.type).height} obs1_bottom=${bottom(o1)} frames_to_hit=${frames}`,
      );
    }
    if (o2) lines.push(`obs2=${NAMES[o2.type]} obs2_dx=${dx(o2)} obs2_width=${o2.width} obs2_bottom=${bottom(o2)}`);
    return lines.join("\n");
  },
};
