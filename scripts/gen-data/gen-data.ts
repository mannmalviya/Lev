// Plays games with the lookahead expert bot and writes one JSONL line per decision.
// Usage: pnpm gen-data --game flappy --episodes 2000 --noise 0.1 --out data/flappy.jsonl
// DAgger: add --model <gateway model id>. The model then drives (the expert still writes every label),
// and --noise becomes the share of decisions the expert drives instead (keeps episodes going).

import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  BOT_DEPTH,
  GAMES,
  applyDecision,
  buildRequest,
  expertLabel,
  nextRandom,
  randomInt,
  safeActions,
  type Game,
  type GameId,
} from "@s1/engine";

const { values } = parseArgs({
  options: {
    game: { type: "string", default: "flappy" },
    episodes: { type: "string", default: "100" },
    noise: { type: "string", default: "0.1" },
    model: { type: "string" },
    gateway: { type: "string", default: process.env.GATEWAY_URL ?? "http://100.123.182.15:8000" },
    token: { type: "string", default: process.env.GATEWAY_TOKEN ?? "dev-token" },
    out: { type: "string" },
    "seed-start": { type: "string", default: "0" },
    // Episodes end on death or at this many decisions (≈ 60 game seconds by default).
    "max-decisions": { type: "string" },
  },
});

const gameId = values.game as GameId;
const game = GAMES[gameId] as unknown as Game<unknown, string>;
if (!game) throw new Error(`Unknown game "${values.game}". Use one of: ${Object.keys(GAMES).join(", ")}`);

const episodes = Number(values.episodes);

async function modelChoice(req: object, questionId: string): Promise<string> {
  const res = await fetch(`${values.gateway}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${values.token}` },
    body: JSON.stringify({ ...req, model: values.model }),
  });
  if (!res.ok) throw new Error(`gateway: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).answers[questionId].choice;
}
const noise = Number(values.noise);
const seedStart = Number(values["seed-start"]);
const maxDecisions = Number(values["max-decisions"] ?? Math.round((60 * game.fps) / 3));
// pnpm runs scripts inside this package, so resolve --out against the directory pnpm was called from.
const out = resolve(process.env.INIT_CWD ?? process.cwd(), values.out ?? `data/${gameId}.jsonl`);

mkdirSync(dirname(out), { recursive: true });
const file = createWriteStream(out);

let lines = 0;
let deaths = 0;
let totalScore = 0;
for (let e = 0; e < episodes; e++) {
  const seed = seedStart + e;
  const s = game.init(seed);
  const noiseRng = { seed: seed ^ 0x9e3779b9 };
  for (let n = 0; n < maxDecisions && !game.isOver(s); n++) {
    const safe = safeActions(game, s, BOT_DEPTH[gameId]);
    const label = expertLabel(game, safe);
    file.write(
      JSON.stringify({ game: gameId, seed, frame: (s as { frame: number }).frame, request: buildRequest(game, s), label, safe_actions: safe }) + "\n",
    );
    lines++;
    // DAgger-style noise: sometimes do a random action, but keep the expert's label.
    // The random action comes from the safe ones, so noise visits odd states without crashing on purpose.
    const pool = safe.length ? safe : game.actions;
    const act = values.model
      ? nextRandom(noiseRng) < noise ? label : await modelChoice(buildRequest(game, s), game.questionId)
      : nextRandom(noiseRng) < noise ? pool[randomInt(noiseRng, 0, pool.length - 1)] : label;
    applyDecision(game, s, act);
  }
  if (game.isOver(s)) deaths++;
  totalScore += game.score(s);
  if ((e + 1) % 50 === 0 || e + 1 === episodes) {
    process.stderr.write(`episode ${e + 1}/${episodes}  lines=${lines}  deaths=${deaths}  avg_score=${(totalScore / (e + 1)).toFixed(1)}\n`);
  }
}
file.end();
console.log(`wrote ${lines} lines to ${out}`);
