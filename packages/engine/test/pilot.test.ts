import { describe, expect, it } from "vitest";
import { createPilot, dino, upcoming, type DinoState, type Game } from "../src/index";

// A perfect intent picker, fed a STALE state (like a slow model): the controller must still play well.
function run<S>(game: Game<S, string>, seed: number, pick: (s: S) => string, lagFrames: number, frames: number) {
  const pilot = createPilot(game.id)!;
  const s = game.init(seed);
  const history: S[] = [];
  for (let f = 0; f < frames && !game.isOver(s); f++) {
    history.push(game.clone(s));
    if (f % 3 === 0) pilot.set(s, pick(history[Math.max(0, history.length - 1 - lagFrames)]));
    game.step(s, pilot.input(s));
  }
  return s;
}

const dinoOracle = (s: DinoState) => {
  const o = upcoming(s)[0];
  if (!o) return "run";
  if (o.type === "PTERODACTYL" && o.y === 75) return "duck";
  if (o.type === "PTERODACTYL" && o.y === 50) return "run";
  return "jump";
};

describe("pilot (Doom trick)", () => {
  for (const lag of [0, 3, 6]) {
    it(`dino: perfect intents with ${lag} frames of lag survive 30 game seconds`, () => {
      for (const seed of [1, 2, 3]) {
        const s = run(dino, seed, dinoOracle, lag, 60 * 30);
        expect(dino.isOver(s)).toBe(false);
      }
    });
  }
});
