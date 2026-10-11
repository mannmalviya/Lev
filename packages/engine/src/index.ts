export * from "./types";
export * from "./rng";
export * from "./flappy";
export * from "./dino";
export * from "./play";
export * from "./pilot";

import { dino } from "./dino";
import { flappy } from "./flappy";

export const GAMES = { flappy, dino } as const;
export type GameId = keyof typeof GAMES;
