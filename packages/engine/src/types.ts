// Question/answer shapes follow docs/API.md (Jev's System One wire format).

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export type Questions = Record<string, ChoiceQuestion>;

export interface SystemOneRequest {
  state: string;
  questions: Questions;
}

/**
 * A game is a deterministic simulation. `step` mutates the state in place;
 * use `clone` before stepping when you need to keep the old state (the bot does this).
 */
export interface Game<S, A extends string> {
  id: string;
  fps: number;
  width: number;
  height: number;
  actions: readonly A[];
  /** The "do nothing" action. Used before the first answer and as the safe fallback. */
  defaultAction: A;
  /** The question id the action answer comes back under. */
  questionId: string;
  question: ChoiceQuestion;
  init(seed: number): S;
  /** Advance one frame with the given input. */
  step(s: S, input: A): void;
  /** The input for the frames after a decision frame (a flap happens once, a duck stays held). */
  hold(action: A): A;
  clone(s: S): S;
  isOver(s: S): boolean;
  score(s: S): number;
  stateText(s: S): string;
}

/** Game frames between model decisions. */
export const DECISION_EVERY = 3;
