import { DECISION_EVERY, type Game, type SystemOneRequest } from "./types";

/** Run one decision: the action on the first frame, then its held input for the rest. */
export function applyDecision<S, A extends string>(game: Game<S, A>, s: S, action: A): void {
  for (let i = 0; i < DECISION_EVERY && !game.isOver(s); i++) {
    game.step(s, i === 0 ? action : game.hold(action));
  }
}

/** The exact request every model sees (docs/API.md, without `model`). */
export function buildRequest<S, A extends string>(game: Game<S, A>, s: S): SystemOneRequest {
  return { state: game.stateText(s), questions: { [game.questionId]: game.question } };
}

/**
 * Lookahead expert. For each action, it searches for any sequence of later decisions
 * that keeps the game alive for `depth` more decisions. It tries the "do nothing"
 * action first, so the search usually ends fast. A node budget stops the search from
 * exploding when every path dies; running out of budget counts as "not safe".
 */
export function safeActions<S, A extends string>(game: Game<S, A>, s: S, depth: number, budget = 4000): A[] {
  const order = [game.defaultAction, ...game.actions.filter((a) => a !== game.defaultAction)];
  let nodes = 0;
  const survives = (state: S, left: number): boolean => {
    if (game.isOver(state)) return false;
    if (left === 0) return true;
    if (++nodes > budget) return false;
    return order.some((a) => {
      const next = game.clone(state);
      applyDecision(game, next, a);
      return survives(next, left - 1);
    });
  };
  return game.actions.filter((a) => {
    nodes = 0;
    const next = game.clone(s);
    applyDecision(game, next, a);
    return survives(next, depth - 1);
  });
}

/** The bot's label: the "do nothing" action when it is safe, else the first safe action. */
export function expertLabel<S, A extends string>(game: Game<S, A>, safe: A[]): A {
  if (safe.includes(game.defaultAction)) return game.defaultAction;
  return safe[0] ?? game.defaultAction;
}

/** Lookahead depth in decisions (≈ 45 frames for Flappy Bird, 60 for Dino). */
export const BOT_DEPTH: Record<string, number> = { flappy: 15, dino: 20 };
