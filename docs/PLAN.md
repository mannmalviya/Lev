
We are building a hackathon project for the local AI track at UCSC AI Hackathon.

We are building our own System 1 model that can run locally. We will be running those on a ASUS GX10.

look at @APPROACHES.md which contains all the methods we will try for our own local system 1 models.

We will then make a hosted website on vercel called "System 1 Playground", in which we will show a comparison of our System 1 model, Jev and a baseline LLM being one shotted, to play games like: Flappy Bird, Dino Runner and Tetris.

We will have different pages on the website one of them will be playground(all the games to chose from) and there will be another page describing the approch that we hve taken etc etc.


 Judge's browser (site on Vercel)
   │
   │  game loop runs here, in the browser
   │
   ├── our models ──HTTPS──► tunnel ──► GX10 (localhost:8000)  /v1/systemone
   │
   └── Jev ──► Vercel API route ──► TypeSafe API   (key stays on the server)

 
Does the API need two inputs for CLM?

No. The API says what to answer. It does not say how the model works inside.

The request already keeps the state and the options apart. Each model has a small adapter that converts the request into its own input:

┌─────────────┬────────────────────────────────────────────────┐
│    Model    │             What its adapter does              │
├─────────────┼────────────────────────────────────────────────┤
│ Baseline    │ Join the state and the options into one        │
│ LLM         │ prompt. Read the option-letter logits.         │
├─────────────┼────────────────────────────────────────────────┤
│ LoRA +      │ Join them into one prompt, with option         │
│ choice head │ markers. Run the head.                         │
├─────────────┼────────────────────────────────────────────────┤
│             │ Send state to the state head. Send each option │
│ CLM         │  ("flap: Jump up") to the action head. Take    │
│             │ the dot product.                               │
├─────────────┼────────────────────────────────────────────────┤
│ Jev         │ Pass the request through unchanged.            │
└─────────────┴────────────────────────────────────────────────┘

So the API stays one shape. The differences stay hidden in the adapters.





---

# System 1 Playground: Web App Plan

Decided 2026-10-10 in a design grilling session.

## Stack

- Next.js (App Router), TypeScript, Tailwind, hosted on Vercel.
- pnpm workspaces:
  ```
  packages/engine/   pure TS, no DOM: flappy.ts, dino.ts, rng.ts,
                     toStateText(), QUESTIONS, lookahead expert bot
  apps/web/          Next.js site
  scripts/gen-data/  Node: engine + bot → JSONL training data
  server/            Python gateway on the GX10 (see API.md)
  ```

## Model access

- **Our models + baseline:** the browser calls the GX10 gateway directly, through Tailscale Funnel, at `/v1/systemone` (see `API.md`). The token is public by design. The gateway has rate limits.
- **Jev:** the browser calls the Vercel route `/api/jev`. The route uses `TYPESAFE_API_KEY` from the Vercel env. It uses the same request/response format. No cap on calls.
- **Baseline:** Qwen3-4B, thinking off, writes a short text answer. Probabilities come from the logprobs. If the answer does not parse, the lane uses the safe action (`wait` / `run`), and the HUD counts it as an error.

## Games

- **Flappy Bird:** original FlapPyBird physics and sprites (288×512, 30 FPS, gravity 1, flap −9, max fall speed 10, pipe gap 100, pipe speed 4 px/frame).
- **Dino:** Chromium t-rex runner physics and sprite sheet (600×150, 60 FPS, speed 6 → 13, pterodactyls).
- Engines are deterministic and use a seed. All lanes in a race use the same seed.
- One decision every 3 game frames. The last action holds between decisions (a flap happens once; a duck stays held).
- The state is numbers plus a few plain facts. The question asks for the action directly.

### Flappy Bird state and question

Changed 2026-10-10: heights are measured **up from the floor**. Screen y (down = bigger) confused both Jev and Qwen in tests (Jev went from a coin flip to 33/39 right on decisive states after this change).
```
bird_height=148 bird_speed=9 moving_up
next_pipe_distance=397 gap_bottom=122 gap_top=222 gap_center=172
bird_is 24 px BELOW the gap center
pipe_after_distance=541 pipe_after_gap_center=269
```
```json
"action": {
  "type": "choice",
  "instructions": "Flappy Bird. Keep the bird inside the gap of the next pipe. Heights are in pixels above the floor. Flapping pushes the bird up; waiting lets gravity pull it down. Pick the action for this moment.",
  "criteria": {
    "flap": "Flap: push the bird up. Right when the bird is below the gap, or falling toward the bottom of the gap.",
    "wait": "Wait: let the bird fall. Right when the bird is above the gap, or rising toward the top of the gap."
  }
}
```

### Dino state and question
```
speed=8.0 dino=running dino_height=0 dino_up_speed=0
obs1=cactus_large obs1_dx=140 obs1_width=50 obs1_height=50 obs1_bottom=0 frames_to_hit=17
obs2=pterodactyl obs2_dx=420 obs2_width=46 obs2_bottom=50
```
(`obs1=none` when there is no obstacle.)
```json
"action": {
  "type": "choice",
  "instructions": "Keep the dino alive. Jump over obstacles on the ground or low birds. Duck under birds at head height. Pick the action for this moment.",
  "criteria": {
    "jump": "Jump: leap up. Works only on the ground.",
    "duck": "Duck: crouch low. In the air, it drops the dino fast.",
    "run":  "Run: do nothing and keep running."
  }
}
```

## Modes

- **Lockstep (default):** each lane has its own game clock. A lane moves forward only when its model answers.
- **Real time:** Easy 0.25×, Medium 0.5×, Hard 1.0× time scale (same physics, slower clock). One request in flight per lane. No latency tricks.
- A race ends when all lanes die, or after **60 s of real time** (`RACE_SECONDS`, easy to change). Applies to both games and both modes.
- Start has a 3-2-1 countdown. The seed is shown and can be edited. There is a Stop button.

### Control: "Model sets intent" (the Doom trick, Dino only)

- Like TypeSafe's Doom demo: the model answers a higher-level question ("what to do about the next obstacle": jump / duck / run), and code (`packages/engine/src/pilot.ts`) times the key press on every frame.
- It is the default on Dino. "Model presses keys" is the original direct control.
- Not for Flappy Bird: a flap must be timed to the frame, and the only controller that survived the big gap changes was the lookahead bot itself, so code would be doing the flying.

## Lanes

- Jev | Baseline (Qwen3-4B) | Ours (dropdown from `/v1/models`) | You (optional, off by default).
- Flappy Bird lanes are side by side (2×2 grid below 640 px). Dino lanes are stacked.
- The human lane always runs in real time at the chosen difficulty.
  - Flappy: Space / click / tap to flap.
  - Dino: Space or ↑ to jump, ↓ to duck. On a phone, tap the top half to jump, the bottom half to duck.
- HUD per lane: name, score, last action + probability bar, model ms vs network ms, number of decisions, number of errors.
- When the GX10 is offline, the lane shows an "offline" badge.

## Pages

- `/`: landing, a short pitch
- `/play`: game picker
- `/play/flappy`, `/play/dino`: races
- `/approach`: how we built it
- `/results`: static charts from offline evals (no database)

## Style

- The site looks like https://jev-to-kernels-by-hand.vercel.app/: cream `#fffff8` background, ETBook serif body, Virgil (Excalidraw hand font) for headings and labels, Excalidraw-style diagrams. Light mode only.
- The game canvases look exactly like the real games (pixel sprites).

## Training data (expert bot)

- One lookahead bot for all games. For each action, it simulates about 30 frames ahead and keeps the actions that survive.
- 10% of the time, the game **does** a random action, but the line is still **labelled** with the bot's choice (DAgger idea: learn to recover).
- `label` prefers the "do nothing" action (`wait` / `run`) when it is safe. `safe_actions` lists every safe action.
- One JSONL line per decision:
  ```json
  {"game":"flappy","seed":42,"frame":117,
   "request":{"state":"bird_y=212 ...","questions":{"action":{...}}},
   "label":"flap","safe_actions":["flap"]}
  ```
- Command: `pnpm gen-data --game flappy --episodes 2000 --noise 0.1 --out data/flappy.jsonl`

## TODO (later)

- Recorded replays (seed + action list) when the GX10 is offline, and on the landing page.
- Tetris.
- Frontier API baseline.
- Content for `/approach` and `/results`.
