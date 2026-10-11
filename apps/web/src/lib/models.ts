// Browser client for docs/API.md. Our models go straight to the GX10 gateway;
// Jev goes through our Vercel route so the TypeSafe key stays on the server.

import type { SystemOneRequest } from "@s1/engine";

export const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? "").replace(/\/$/, "");
const GATEWAY_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";
export const BASELINE_MODEL = process.env.NEXT_PUBLIC_BASELINE_MODEL ?? "baseline-qwen3-4b";

export type Target = { via: "jev" } | { via: "gateway"; model: string };

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  parse_error?: boolean;
}

export interface Decision {
  answer: ChoiceAnswer;
  modelMs: number | null;
  rttMs: number;
}

export class ModelError extends Error {
  constructor(
    message: string,
    /** true when the backend cannot be reached at all (show "offline") */
    readonly offline: boolean,
  ) {
    super(message);
  }
}

export async function decide(target: Target, req: SystemOneRequest, questionId: string, signal?: AbortSignal): Promise<Decision> {
  const isJev = target.via === "jev";
  if (!isJev && !GATEWAY_URL) throw new ModelError("NEXT_PUBLIC_GATEWAY_URL is not set", true);
  const url = isJev ? "/api/jev" : `${GATEWAY_URL}/v1/systemone`;
  const body = isJev ? req : { ...req, model: target.model };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!isJev && GATEWAY_TOKEN) headers.Authorization = `Bearer ${GATEWAY_TOKEN}`;

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(10_000) });
  } catch (e) {
    if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
    throw new ModelError((e as Error).message, true);
  }
  const rttMs = performance.now() - t0;
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new ModelError(err?.error?.message ?? `HTTP ${res.status}`, res.status === 503 || res.status === 404);
  }
  const data = await res.json();
  const answer = data.answers?.[questionId] as ChoiceAnswer | undefined;
  if (!answer || answer.type !== "choice") throw new ModelError("response has no choice answer", false);
  return { answer, modelMs: typeof data.latency_ms === "number" ? data.latency_ms : null, rttMs };
}

export interface ModelInfo {
  id: string;
  backend: string;
  params: string | null;
  description: string;
}

export async function listModels(): Promise<ModelInfo[]> {
  if (!GATEWAY_URL) return [];
  const res = await fetch(`${GATEWAY_URL}/v1/models`, {
    headers: GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).models as ModelInfo[];
}
