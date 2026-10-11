import { describe, expect, it } from "vitest";
import {
  BOT_DEPTH,
  DINO,
  FLAPPY,
  applyDecision,
  buildRequest,
  dino,
  expertLabel,
  flappy,
  safeActions,
  type Game,
} from "../src/index";

function playBot<S, A extends string>(game: Game<S, A>, seed: number, maxDecisions: number) {
  const s = game.init(seed);
  let n = 0;
  while (!game.isOver(s) && n < maxDecisions) {
    applyDecision(game, s, expertLabel(game, safeActions(game, s, BOT_DEPTH[game.id])));
    n++;
  }
  return { s, n };
}

function trace<S, A extends string>(game: Game<S, A>, seed: number, actions: A[]) {
  const s = game.init(seed);
  return actions.map((a) => {
    applyDecision(game, s, a);
    return game.stateText(s);
  });
}

describe("flappy", () => {
  it("is deterministic for a seed", () => {
    const acts = Array.from({ length: 40 }, (_, i): "flap" | "wait" => (i % 4 === 0 ? "flap" : "wait"));
    expect(trace(flappy, 7, acts)).toEqual(trace(flappy, 7, acts));
    expect(trace(flappy, 7, acts)).not.toEqual(trace(flappy, 8, acts));
  });

  it("falls to the floor when it never flaps", () => {
    const s = flappy.init(1);
    let frames = 0;
    while (!flappy.isOver(s) && frames < 500) {
      flappy.step(s, "wait");
      frames++;
    }
    expect(flappy.isOver(s)).toBe(true);
    expect(s.birdY + FLAPPY.BIRD_H).toBeGreaterThanOrEqual(FLAPPY.BASE_Y - 1);
  });

  it("the expert bot passes 20 pipes", () => {
    for (const seed of [1, 2, 3]) {
      const { s } = playBot(flappy, seed, 20 * 13 + 40);
      expect(flappy.isOver(s)).toBe(false);
      expect(flappy.score(s)).toBeGreaterThanOrEqual(20);
    }
  });

  it("state text has the agreed fields", () => {
    const text = flappy.stateText(flappy.init(3));
    expect(text).toMatch(/^bird_height=\d+ bird_speed=\d+ moving_(up|down)$/m);
    expect(text).toMatch(/^next_pipe_distance=-?\d+ gap_bottom=\d+ gap_top=\d+ gap_center=\d+(\.5)?$/m);
    expect(text).toMatch(/^bird_is \d+ px (ABOVE|BELOW) the gap center$/m);
    expect(text).toMatch(/^pipe_after_distance=-?\d+ pipe_after_gap_center=\d+$/m);
  });
});

describe("dino", () => {
  it("is deterministic for a seed", () => {
    const acts = Array.from({ length: 200 }, (_, i) => (["run", "jump", "duck"] as const)[i % 3]);
    expect(trace(dino, 5, acts)).toEqual(trace(dino, 5, acts));
  });

  it("a jump goes up and lands back on the ground", () => {
    const s = dino.init(1);
    dino.step(s, "jump");
    let top = s.trex.y;
    let frames = 0;
    while (s.trex.jumping && frames < 200) {
      dino.step(s, "run");
      top = Math.min(top, s.trex.y);
      frames++;
    }
    expect(top).toBeLessThan(DINO.GROUND_Y - 30);
    expect(s.trex.y).toBe(DINO.GROUND_Y);
  });

  // A model that always answers "jump" must not look perfect (it does with the intent pilot).
  it("dies early when it always jumps", () => {
    for (const seed of [1, 7, 42]) {
      const s = dino.init(seed);
      for (let n = 0; n < 600 && !dino.isOver(s); n++) applyDecision(dino, s, "jump");
      expect(dino.isOver(s)).toBe(true);
    }
  });

  it("dies on the first cactus when it only runs", () => {
    const s = dino.init(2);
    let frames = 0;
    while (!dino.isOver(s) && frames < 2000) {
      dino.step(s, "run");
      frames++;
    }
    expect(dino.isOver(s)).toBe(true);
  });

  it("the expert bot survives 60 game seconds", () => {
    for (const seed of [1, 2, 3]) {
      const { s } = playBot(dino, seed, (60 * 60) / 3);
      expect(dino.isOver(s)).toBe(false);
      expect(s.speed).toBeGreaterThan(8.5); // pterodactyls are in play
    }
  });

  it("state text has the agreed fields", () => {
    const s = dino.init(4);
    expect(dino.stateText(s)).toBe("speed=6.0 dino=running dino_height=0 dino_up_speed=0\nobs1=none");
    for (let i = 0; i < 260; i++) dino.step(s, "run");
    expect(dino.stateText(s)).toMatch(
      /^obs1=(cactus_small|cactus_large|pterodactyl) obs1_dx=-?\d+ obs1_width=\d+ obs1_height=\d+ obs1_bottom=\d+ frames_to_hit=\d+$/m,
    );
  });
});

it("buildRequest uses the shared question", () => {
  const req = buildRequest(flappy, flappy.init(1));
  expect(Object.keys(req.questions)).toEqual(["action"]);
  expect(Object.keys(req.questions.action.criteria)).toEqual(["flap", "wait"]);
});
