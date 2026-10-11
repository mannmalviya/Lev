"""System 1 gateway: POST /v1/systemone for every model on the GX10 (docs/API.md).

Run:  uv run uvicorn gateway.app:app --host 0.0.0.0 --port 8000
Env:
  SYSTEM1_API_KEY   bearer token the browser sends (public by design). Empty = no auth.
  ALLOWED_ORIGINS   comma-separated CORS origins (default: http://localhost:3000)
  RATE_LIMIT_RPS    requests per second per client IP (default 30, burst 2x)
  GATEWAY_DISABLED  set to 1 to turn every request into 503 (kill switch)
  BASELINE          set to 1 to load the Qwen text baseline (needs `uv sync --extra baseline`)
  LEV               set to 1 to load Lev, our trained CLM head on Qwen3-8B (same extra)
"""

import json
import os
import threading
import time
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

from .backends.base import Backend
from .backends.fake import FakeBackend

MAX_STATE_CHARS = 16_000


def load_backends() -> dict[str, Backend]:
    backends: list[Backend] = [FakeBackend()]
    if os.environ.get("BASELINE") == "1":
        from .backends.baseline import BaselineBackend

        backends.append(BaselineBackend())
    if os.environ.get("LEV") == "1":
        from .backends.lev import LevBackend

        backends.append(LevBackend())
    return {b.id: b for b in backends}


class Question(BaseModel):
    type: Literal["choice", "noul", "score"]
    instructions: str | dict | list
    criteria: dict[str, Any] | list[Any] | None = None

    @model_validator(mode="after")
    def check_criteria(self):
        if self.type == "choice":
            if not isinstance(self.criteria, dict) or not 2 <= len(self.criteria) <= 255:
                raise ValueError("choice needs a criteria object with 2 to 255 options")
        elif self.type == "score":
            if not isinstance(self.criteria, list) or not 2 <= len(self.criteria) <= 10:
                raise ValueError("score needs a criteria array with 2 to 10 levels")
        return self


class SystemOneRequest(BaseModel):
    model: str
    state: str | dict | list
    questions: dict[str, Question] = Field(min_length=1, max_length=16)


def as_text(x: Any) -> str:
    return x if isinstance(x, str) else json.dumps(x, sort_keys=True)


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


class RateLimiter:
    """Token bucket per client IP."""

    def __init__(self, rps: float):
        self.rps, self.burst = rps, rps * 2
        self.buckets: dict[str, tuple[float, float]] = {}
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            tokens, last = self.buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.rps)
            if tokens < 1:
                self.buckets[key] = (tokens, now)
                return False
            self.buckets[key] = (tokens - 1, now)
            return True


def create_app(backends: dict[str, Backend] | None = None) -> FastAPI:
    app = FastAPI(title="System 1 gateway")
    app.state.backends = backends if backends is not None else load_backends()
    token = os.environ.get("SYSTEM1_API_KEY", "")
    limiter = RateLimiter(float(os.environ.get("RATE_LIMIT_RPS", "30")))
    origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)
        if os.environ.get("GATEWAY_DISABLED") == "1":
            return error(503, "backend_unavailable", "the gateway is turned off")
        if token and request.headers.get("authorization") != f"Bearer {token}":
            return error(401, "unauthorized", "missing or wrong bearer token")
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
        if not limiter.allow(ip):
            return error(429, "rate_limited", "too many requests")
        return await call_next(request)

    # Added last so it wraps the guard: errors from the guard still carry CORS headers.
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/v1/models")
    def models():
        return {
            "models": [
                {"id": b.id, "backend": b.kind, "params": b.params, "description": b.description}
                for b in app.state.backends.values()
            ]
        }

    @app.post("/v1/systemone")
    def systemone(body: dict):
        t0 = time.perf_counter()
        try:
            req = SystemOneRequest.model_validate(body)
        except ValidationError as e:
            first = e.errors()[0]
            return error(400, "invalid_request", f"{'.'.join(map(str, first['loc']))}: {first['msg']}")
        backend = app.state.backends.get(req.model)
        if backend is None:
            return error(404, "unknown_model", f"No model with id '{req.model}'")
        state = as_text(req.state)
        if len(state) > MAX_STATE_CHARS:
            return error(413, "state_too_long", f"state is longer than {MAX_STATE_CHARS} characters")

        answers: dict[str, Any] = {}
        tokens_in = tokens_out = 0
        for qid, q in req.questions.items():
            instructions = as_text(q.instructions)
            if q.type == "choice":
                options = {k: as_text(v) if v is not None else "" for k, v in q.criteria.items()}
            elif q.type == "noul":
                crit = q.criteria if isinstance(q.criteria, dict) else {}
                options = {"yes": as_text(crit.get("true", "Yes")), "no": as_text(crit.get("false", "No"))}
            else:
                options = {str(i): as_text(level) for i, level in enumerate(q.criteria)}

            c = backend.choose(state, instructions, options)
            tokens_in += c.input_tokens
            tokens_out += c.output_tokens
            p = c.probabilities
            if q.type == "choice":
                best = max(p, key=p.get)
                answers[qid] = {"type": "choice", "choice": best, "confidence": p[best], "probabilities": p}
            elif q.type == "noul":
                answers[qid] = {"type": "noul", "noul": p["yes"]}
            else:
                best = max(p, key=p.get)
                answers[qid] = {
                    "type": "score",
                    "score": sum(int(k) * v for k, v in p.items()),
                    "confidence": p[best],
                    "legend": {str(i): as_text(level) for i, level in enumerate(q.criteria)},
                    "probabilities": p,
                }
            if c.parse_error:
                answers[qid]["parse_error"] = True

        return {
            "model": req.model,
            "answers": answers,
            "usage": {"input_tokens": tokens_in, "output_tokens": tokens_out},
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            "backend": backend.kind,
        }

    return app


app = create_app()
