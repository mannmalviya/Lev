# System 1 API Spec

This is the API that every model behind the System 1 Playground must serve. That includes our models, the baseline, CLM, and the Jev proxy.

It follows Jev's System One wire format, as Kev documents it (https://github.com/jaredpalmer/kev). Kev, Decider, Laya and Von use the same format. Field names below match that format, except where a section says **(ours)**.

> ⚠️ This spec is based on Kev's README. We could not open the TypeSafe docs directly. Before the demo, compare it with one real Jev response.

---

## 1. Overview

```
Browser (Vercel site)
   │  POST /v1/systemone   (HTTPS, Bearer token)
   ▼
Gateway on GX10 :8000   (FastAPI; checks the token and CORS, routes by "model")
   ├── PyTorch backends: baseline, LoRA + head
   ├── CLM backend:      clm-serve + vLLM pooling
   └── Jev proxy:        forwards to TypeSafe with our key
```

- There is one public endpoint. The `model` field picks the backend.
- Every backend returns the same response shape.
- How a model works inside (one input or two) is hidden behind its adapter. See section 6.

---

## 2. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/systemone` | Answer the questions about one state |
| `GET` | `/v1/models` | List the models that are available |
| `GET` | `/health` | Liveness check. Returns `{"ok": true}` |

### Auth
```
Authorization: Bearer <SYSTEM1_API_KEY>
Content-Type: application/json
```
- Without a valid token, the server returns `401`.
- CORS allows only our Vercel domain(s) and `http://localhost:3000`.

---

## 3. Request: `POST /v1/systemone`

```json
{
  "model": "ours-lora-4b",
  "state": "bird_y=120 vel=-3 pipe_x=300 gap_top=90 gap_bottom=190",
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "What should the bird do now?",
      "criteria": {
        "flap": "Jump up",
        "wait": "Do nothing and fall"
      }
    }
  }
}
```

### Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | string | yes | A model id from `GET /v1/models`. |
| `state` | string **or** JSON object | yes | The current situation. If it is an object, the gateway turns it into a string with `json.dumps(state, sort_keys=True)` before it reaches a backend. |
| `questions` | object | yes | Maps each question id to a question. The caller picks the ids. 1 to 16 questions per request **(ours: limit)**. |

### Question types

All questions have `type` and `instructions`. The `criteria` field depends on the type.

**`choice`**: pick one option from a list.
```json
{
  "type": "choice",
  "instructions": "What should the dino do?",
  "criteria": {
    "jump": "Jump over a cactus",
    "duck": "Duck under a bird",
    "none": "Keep running"
  }
}
```
- `criteria` is an object that maps each option id to a description.
- Use 2 to 255 options. Option ids must be unique.
- The description is part of the input. The model sees it.
- **Option order must not change the answer.** Backends should be trained or evaluated with the options shuffled.

**`noul`**: yes or no. Returns the probability of yes.
```json
{
  "type": "noul",
  "instructions": "Is the bird about to hit a pipe?"
}
```
- `noul` has no `criteria`.

**`score`**: pick a level on an ordered scale.
```json
{
  "type": "score",
  "instructions": "How dangerous is the current position?",
  "criteria": ["Safe", "Risky", "About to die"]
}
```
- `criteria` is an **array** of 2 to 10 ordered levels, from low to high.
- Level index `i` is the position of the level in the array, starting at 0.

---

## 4. Response

```json
{
  "model": "ours-lora-4b",
  "answers": {
    "action": {
      "type": "choice",
      "choice": "flap",
      "confidence": 0.82,
      "probabilities": { "flap": 0.82, "wait": 0.18 }
    }
  },
  "usage": { "input_tokens": 41, "output_tokens": 0 },
  "latency_ms": 23
}
```

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `model` | string | Echoes the request. |
| `answers` | object | The same keys as `questions` in the request. |
| `usage.input_tokens` | int | Tokens that the backbone read. For CLM, count the state tokens plus the action tokens that missed the cache. |
| `usage.output_tokens` | int | Always `0` for System 1 models. A generating baseline LLM reports its real count. |
| `latency_ms` | number | **Model time only**, measured on the server from when the request is parsed to when the answer is ready. The browser measures round-trip time itself. **Network time = round-trip − `latency_ms`.** |
| `backend` | string | **(ours)** One of `"torch"`, `"clm"`, `"jev"` or `"fake"`. Used for debugging. |

### Answer shape by type

**`choice`**
```json
{
  "type": "choice",
  "choice": "flap",
  "confidence": 0.82,
  "probabilities": { "flap": 0.82, "wait": 0.18 }
}
```
- `probabilities` has every option id. The values add up to 1 (±1e-4).
- `choice` is the option id with the highest probability.
- `confidence` **(our definition)** is the highest probability. Jev may define it in a different way. Do not compare our `confidence` with Jev's. Compare `probabilities`.

**`noul`**
```json
{ "type": "noul", "noul": 0.93 }
```
- `noul` is P(yes), from 0 to 1.

**`score`**
```json
{
  "type": "score",
  "score": 1.44,
  "confidence": 0.51,
  "legend": { "0": "Safe", "1": "Risky", "2": "About to die" },
  "probabilities": { "0": 0.12, "1": 0.37, "2": 0.51 }
}
```
- `probabilities` are keyed by level index as a string. The values add up to 1.
- `score` is the expected level: `Σ i · p_i`.
- `confidence` is the highest probability.
- `legend` maps each index back to its label.

### Calibration
- Each backend applies its own fitted temperature before it returns probabilities. Probabilities must be **calibrated**: when a model says 0.8, it should be right about 80% of the time.
- Store the temperature with the checkpoint, not in the gateway.

---

## 5. `GET /v1/models`

```json
{
  "models": [
    { "id": "fake",           "backend": "fake",  "params": null,   "description": "Random probabilities, for frontend testing" },
    { "id": "baseline-qwen3-4b", "backend": "torch", "params": "4B", "description": "Zero-shot logit readout, no training" },
    { "id": "ours-lora-4b",   "backend": "torch", "params": "4B",   "description": "LoRA + choice head, trained on game data" },
    { "id": "clm-8b",         "backend": "clm",   "params": "8B",   "description": "Contrastive dual encoder (CLM v0.1)" },
    { "id": "jev",            "backend": "jev",   "params": null,   "description": "TypeSafe Jev (hosted, proxied)" }
  ]
}
```

The ids above are examples. Use the pattern `<family>-<base>-<size>`, for example `ours-lora-qwen3-0.6b`.

---

## 6. Backend adapters (how each model reads the request)

The API is the same for every model. Each backend has an adapter that turns `state` + `questions` into its own input.

### Python interface that each backend implements

```python
class Backend(Protocol):
    id: str

    def decide(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        """Return the `answers` object (section 4) for these questions.
        state is already a string. questions is the validated questions object."""
```

The gateway does the validation, the auth, the timing (`latency_ms`) and the `usage`. Backends return only `answers`. They may also return the token counts.

### One-input models (baseline, LoRA + head)

They join everything into **one** sequence. Suggested template:

```
<state>
{state}
</state>
<question id="action" type="choice">
What should the bird do now?
<opt id="flap">Jump up</opt>
<opt id="wait">Do nothing and fall</opt>
<decide>
</question>
```

- **Baseline (no training):** label the options `A`, `B`, `C`… Read the next-token logits for those letters at the answer position. Take a softmax over **only** the valid letters.
- **LoRA + head:** the head scores the hidden state at each `</opt>` against the hidden state at `<decide>`. Then it takes a softmax over the options (Kev style).
- **Many questions about the same state:** encode the state once and reuse its KV cache for each question.
- `noul` → a choice between `yes` and `no`. Return P(yes).
- `score` → a choice over the levels. Then compute `score` = the expected index.

### Two-input model (CLM)

CLM never sees one joined text. The adapter splits the request:

| API field | Goes to |
|---|---|
| `state` + `instructions` | **state head**, as the text `"{state}\nQuestion: {instructions}"` |
| each option in `criteria` | **action head**, as the text `"{option_id}: {description}"` |

- score_i = dot(state_vec, action_vec_i). Then `probabilities` = softmax(score / T).
- Action vectors are cached by clm-serve, because the option texts repeat every frame. Keep the option text **exactly** the same between calls, or the cache misses.
- `noul` → actions `"yes"` and `"no"`.
- `score` → one action for each level label.

### Jev proxy

- Forward the request body to TypeSafe unchanged. Swap only `model` to Jev's model name.
- Add our TypeSafe key on the server. **The key must never go to the browser.**
- Pass the response through. Overwrite `latency_ms` with our measured proxy time, and keep Jev's value in `upstream_latency_ms` **(ours)**.

---

## 7. Errors

All errors use this shape:
```json
{ "error": { "code": "unknown_model", "message": "No model with id 'foo'" } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Bad JSON, a missing field, or a bad `type` or `criteria` |
| 401 | `unauthorized` | A missing or wrong bearer token |
| 404 | `unknown_model` | The `model` is not in `/v1/models` |
| 413 | `state_too_long` | The state is longer than the model's context limit |
| 503 | `backend_unavailable` | The backend is down or still loading |
| 504 | `backend_timeout` | No answer within 2 s **(ours)** |

---

## 8. Game conventions (for the Playground)

- The game loop **never waits** for the model. It sends a request about 10 times per second and uses the latest answer. Between answers, it repeats the last action.
- Keep the question id, `instructions` and `criteria` **fixed** for each game. Only `state` changes each frame. This helps CLM's cache and the one-input KV cache, and it makes the comparison between models fair.
- Use a compact `key=value` text state. Round numbers to integers. Fewer tokens give faster answers.

| Game | Question id | Type | Options |
|---|---|---|---|
| Flappy Bird | `action` | choice | `flap`, `wait` |
| Dino Runner | `action` | choice | `jump`, `duck`, `none` |
| Tetris | `placement` | choice | one option for each legal (rotation, column), for example `r1_c4` (up to ~40) |

Example Dino state:
```
dino_y=0 dino_vy=0 speed=8 obstacle=cactus_small obstacle_x=140 obstacle_w=17 obstacle_h=35 next=bird next_x=420 next_y=50
```

Tetris note: score each legal placement as an option, with a short description of the result, for example `"lines=1 holes=0 height=6 bumpiness=3"`. This keeps the decision to one step.

---

## 9. Quick test

```bash
curl -s https://<gx10-url>/v1/systemone \
  -H "Authorization: Bearer $SYSTEM1_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fake",
    "state": "bird_y=120 vel=-3 pipe_x=300 gap_top=90 gap_bottom=190",
    "questions": {
      "action": { "type": "choice", "instructions": "What should the bird do now?",
                  "criteria": { "flap": "Jump up", "wait": "Do nothing and fall" } }
    }
  }'
```

**Each backend must pass these checks before it is added:**
1. The `answers` keys equal the `questions` keys.
2. Each `probabilities` object adds up to 1 and has every option.
3. If you shuffle the `criteria` order, the probabilities stay the same (±0.02).
4. `latency_ms` < 100 for a Flappy Bird request on the GX10 (target for models up to 4B).
