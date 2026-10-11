// The "Doom trick" (as in TypeSafe's Doom demo): the model picks an intent a few times
// per second, and a small controller turns that intent into key presses on EVERY frame.
// A slow answer then costs a little steering, not a missed jump.
// Used the same way for every model lane, so the comparison stays fair. Dino only (see PILOTS).

import { DINO, upcoming, type DinoState } from "./dino";
import type { ChoiceQuestion } from "./types";

export const INTENT_ID = "intent";

export interface Pilot {
  question: ChoiceQuestion;
  /** The intent to use before the first answer. */
  defaultIntent: string;
  /** Called when an answer arrives. */
  set(state: unknown, intent: string): void;
  /** The key press for this frame. */
  input(state: unknown): string;
}

/** Start a jump when the obstacle is this many frames away (passes the oracle test with 200 ms lag). */
const JUMP_FRAMES = 12;
const DUCK_PX = 220;

function dinoPilot(): Pilot {
  let intent = "run";
  return {
    question: {
      type: "choice",
      instructions:
        "Chrome Dino. Decide what to do about the next obstacle. Jump over cactuses and low birds. Duck under birds at head height. Birds high in the sky need nothing.",
      criteria: {
        jump: "Jump: clear the next obstacle. The dino jumps at the right moment.",
        duck: "Duck: crouch under the next obstacle while it passes.",
        run: "Run: nothing to do yet.",
      },
    },
    defaultIntent: "run",
    set(_state, next) {
      intent = next;
    },
    input(state) {
      const s = state as DinoState;
      const next = upcoming(s)[0];
      if (!next || intent === "run") return "run";
      const dx = next.x - (DINO.TREX_X + DINO.TREX_W);
      if (intent === "duck") return dx < DUCK_PX ? "duck" : "run";
      return dx / (s.speed + next.speedOffset) <= JUMP_FRAMES ? "jump" : "run";
    },
  };
}

/**
 * Games with an intent controller. Flappy Bird has none: a flap must be timed to the frame,
 * and the only controller that survived the big gap changes was the lookahead bot itself,
 * so code (not the model) would be doing the flying.
 */
export const PILOTS: Record<string, () => Pilot> = { dino: dinoPilot };

export function createPilot(gameId: string): Pilot | null {
  return PILOTS[gameId]?.() ?? null;
}

