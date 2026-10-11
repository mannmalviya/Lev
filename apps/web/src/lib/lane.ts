// One lane = one copy of the game driven by one player (a model or a human).
// Plain TS, no React: the race loop calls `tick` every animation frame and
// React only reads `stats` a few times per second.

import { DECISION_EVERY, INTENT_ID, applyDecision, buildRequest, createPilot, type ChoiceQuestion, type Game, type Pilot, type SystemOneRequest } from "@s1/engine";
import { ModelError, decide, type Target } from "./models";

export type Mode = "lockstep" | "realtime";
export const TIME_SCALE = { easy: 0.25, medium: 0.5, hard: 1 } as const;
export type Difficulty = keyof typeof TIME_SCALE;
/** direct: the model presses the keys. intent: the model picks an intent, code presses the keys (Doom trick). */
export type Control = "direct" | "intent";

export type Driver = { kind: "model"; target: Target } | { kind: "human" };

export type LaneStatus = "ready" | "running" | "dead" | "stopped" | "offline";

export interface LaneStats {
  status: LaneStatus;
  score: number;
  decisions: number;
  errors: number;
  lastAction: string | null;
  probabilities: Record<string, number> | null;
  avgModelMs: number | null;
  avgNetMs: number | null;
  message: string | null;
}

// Loosely typed so one Lane class serves every game.
type AnyGame = Game<unknown, string>;

export class Lane {
  state: unknown;
  stats: LaneStats;
  private action: string;
  private fresh = false;
  private acc = 0;
  private inFlight = false;
  private retryAt = 0;
  private abort = new AbortController();
  private modelMsSum = 0;
  private modelMsN = 0;
  private netMsSum = 0;
  private netMsN = 0;
  private pilot: Pilot | null;

  constructor(
    readonly game: AnyGame,
    readonly driver: Driver,
    seed: number,
    control: Control = "direct",
  ) {
    this.state = game.init(seed);
    this.action = game.defaultAction;
    this.stats = this.freshStats();
    this.pilot = control === "intent" && driver.kind === "model" ? createPilot(game.id) : null;
  }

  /** The question this lane asks its model. */
  get question(): ChoiceQuestion {
    return this.pilot?.question ?? this.game.question;
  }

  /** Input for one frame: from the intent controller, or the held model/human action. */
  private frameInput(): string {
    if (this.pilot) return this.pilot.input(this.state);
    const input = this.fresh ? this.action : this.game.hold(this.action);
    this.fresh = false;
    return input;
  }

  private freshStats(): LaneStats {
    return {
      status: "ready", score: 0, decisions: 0, errors: 0, lastAction: null,
      probabilities: null, avgModelMs: null, avgNetMs: null, message: null,
    };
  }

  /** Lockstep only makes sense for models; humans always play in real time. */
  private isLockstep(mode: Mode) {
    return mode === "lockstep" && this.driver.kind === "model";
  }

  start(mode: Mode) {
    this.stats.status = "running";
    if (this.isLockstep(mode)) void this.lockstepLoop();
  }

  stop() {
    this.abort.abort();
    if (this.stats.status === "running") this.stats.status = "stopped";
  }

  /** Human input. `duck` stays held until `release`. */
  press(action: string) {
    this.action = action;
    this.fresh = true;
  }

  release() {
    this.action = this.game.defaultAction;
  }

  /** Advance real-time lanes by `dtMs` of wall time. Lockstep lanes move in their own loop. */
  tick(dtMs: number, mode: Mode, difficulty: Difficulty) {
    if (this.stats.status !== "running" || this.isLockstep(mode)) return;
    if (this.driver.kind === "model" && !this.inFlight && performance.now() >= this.retryAt) void this.realtimeRequest();

    const frameMs = 1000 / this.game.fps;
    this.acc += dtMs * TIME_SCALE[difficulty];
    // Do not try to catch up more than ~0.25 s after a stall (tab in background).
    this.acc = Math.min(this.acc, frameMs * this.game.fps * 0.25);
    while (this.acc >= frameMs && !this.game.isOver(this.state)) {
      if (this.fresh && this.driver.kind === "human") this.stats.decisions++;
      this.game.step(this.state, this.frameInput());
      this.acc -= frameMs;
    }
    this.afterStep();
  }

  private afterStep() {
    this.stats.score = this.game.score(this.state);
    if (this.game.isOver(this.state) && this.stats.status === "running") this.stats.status = "dead";
  }

  private async ask() {
    if (this.driver.kind !== "model") throw new Error("not a model lane");
    const qid = this.pilot ? INTENT_ID : this.game.questionId;
    const req: SystemOneRequest = this.pilot
      ? { state: this.game.stateText(this.state), questions: { [INTENT_ID]: this.pilot.question } }
      : buildRequest(this.game, this.state);
    const d = await decide(this.driver.target, req, qid, this.abort.signal);
    const valid = Object.keys(this.question.criteria);
    const fallback = this.pilot ? this.pilot.defaultIntent : this.game.defaultAction;
    const choice = valid.includes(d.answer.choice) ? d.answer.choice : fallback;
    this.stats.decisions++;
    if (d.answer.parse_error || choice !== d.answer.choice) this.stats.errors++;
    this.stats.lastAction = choice;
    this.stats.probabilities = d.answer.probabilities;
    if (d.modelMs !== null) {
      this.modelMsSum += d.modelMs;
      this.modelMsN++;
      this.netMsSum += Math.max(0, d.rttMs - d.modelMs);
      this.netMsN++;
      this.stats.avgModelMs = this.modelMsSum / this.modelMsN;
      this.stats.avgNetMs = this.netMsSum / this.netMsN;
    } else {
      this.netMsSum += d.rttMs;
      this.netMsN++;
      this.stats.avgNetMs = this.netMsSum / this.netMsN;
    }
    return choice;
  }

  private handleError(e: unknown): boolean {
    if ((e as Error).name === "AbortError") return true;
    this.stats.errors++;
    this.stats.message = (e as Error).message;
    if (e instanceof ModelError && e.offline) {
      this.stats.status = "offline";
      return true;
    }
    // A bad answer: back off a little instead of hammering the server.
    this.retryAt = performance.now() + 500;
    return false;
  }

  private async lockstepLoop() {
    while (this.stats.status === "running" && !this.game.isOver(this.state)) {
      let action = this.game.defaultAction;
      try {
        action = await this.ask();
      } catch (e) {
        if (this.handleError(e)) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (this.stats.status !== "running") return;
      if (this.pilot) {
        this.pilot.set(this.state, action);
        for (let i = 0; i < DECISION_EVERY && !this.game.isOver(this.state); i++) this.game.step(this.state, this.pilot.input(this.state));
      } else {
        applyDecision(this.game, this.state, action);
      }
      this.afterStep();
    }
  }

  private async realtimeRequest() {
    this.inFlight = true;
    try {
      const action = await this.ask();
      if (this.stats.status === "running") {
        if (this.pilot) this.pilot.set(this.state, action);
        this.action = action;
        this.fresh = true;
      }
    } catch (e) {
      this.handleError(e);
    } finally {
      this.inFlight = false;
    }
  }
}
