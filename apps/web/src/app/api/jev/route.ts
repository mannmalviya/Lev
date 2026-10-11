// Jev proxy: same request/response format as docs/API.md.
// The TypeSafe key stays here on the server and never reaches the browser.

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return error(503, "backend_unavailable", "TYPESAFE_API_KEY is not set on the server");

  const text = await request.text();
  if (text.length > 20_000) return error(413, "state_too_long", "request body is too large");
  let body: { state?: unknown; questions?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, "invalid_request", "body is not JSON");
  }
  if (body.state == null || typeof body.questions !== "object" || body.questions === null) {
    return error(400, "invalid_request", "state and questions are required");
  }

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state: body.state, questions: body.questions, model: "jev-latest" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return error(504, "backend_timeout", `TypeSafe did not answer: ${(e as Error).message}`);
  }
  const latency_ms = Math.round(performance.now() - t0);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return error(res.status === 401 ? 503 : 502, "backend_unavailable", `TypeSafe returned HTTP ${res.status}`);
  }
  return Response.json({ ...data, latency_ms, backend: "jev" });
}
