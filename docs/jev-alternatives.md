# Open-Source Jev Alternatives

Researched 2026-10-10. Almost all numbers are self-reported by each project. Benchmarks use different datasets, so do not compare them directly.

## The list

1. **Kev**: LoRA + pointer head on Qwen3.5 (0.8B / 4B / 9B / 27B)
2. **Decider**: label-token readout fine-tune on Qwen3.5 / Gemma-4 (0.8B to 35B MoE)
3. **NanoJev**: Qwen3-0.6B + decision heads, trained on **games**
4. **Laya**: ModernBERT encoder, 421M / 322M, runs on CPU
5. **Von**: ModernBERT encoder, 395M, option-marker head
6. **SemIf (formerly OpenJev)**: no training, reads logits from a frozen LLM
7. **open-alternative-jev (`so1`)**: no training, reads logits, any ChatML LLM
8. **jevlike**: small trainer for an option-attention head (research starter)
9. **CLM**: contrastive state/action dual encoder on a frozen Qwen3-8B

---

## 1. Kev
- **Repo:** https://github.com/jaredpalmer/kev, Apache-2.0, by Jared Palmer
- **Architecture:** rank-16 LoRA plus a small pointer head on a frozen Qwen base. The head scores each option's `</opt>` hidden state against the question's `<decide>` hidden state. Softmax over the options gives the probabilities.
- **Sizes:** 0.8B, 4B, 9B (Qwen3.5-Base). 27B (Qwen3.8, all weights trained, ~51 GB bf16).
- **Data:** `decision-v7` has ~12.6k examples: 10k from 10 public datasets, 896 generated policy examples, and 1,680 from 60 generated rule structures. The 27B uses a 145,840-record corpus.
- **Training:** cross-entropy on the right answer. 2 epochs, LR 1e-4 (0.8B) or 5e-5 (4B/9B). Temperature is fitted after training (~2.2–2.4).
- **Compute:** 0.8B takes ~20 min on 1 H100. 4B takes ~1 h on 1 H100 (~$1 per fine-tune run). 27B used 8× H200.
- **Latency:** 4B takes 18.1 ms on H100 for 6 questions, and 721 ms on Apple M5 (136 ms when cached).
- **API:** `POST /v1/systemone` (Jev wire format). The TypeSafe SDK works if you change the base URL.
- **Benchmarks:** held-out accuracy 0.648 / 0.817 / 0.820 / 0.851 (0.8B/4B/9B/27B) vs Jev 0.857.
- **For us:** this is the closest template for our "train our own" path. It covers our exact size range, and training is cheap.

## 2. Decider
- **Repo:** https://github.com/Mapika/decider, Apache-2.0
- **Architecture:** one answer slot per question after the state. It reads the hidden state at the slot and projects it onto one label token per option (A, B, C…), then takes a softmax. Two prompt layouts are trained 50/50 (state-first and schema-first, cacheable).
- **Sizes:** 0.8B, 2B, 4B (Qwen3.5-Base). 35B-A3B MoE. 12B and 31B (Gemma-4).
- **Data:** ~95 public datasets, labelled by a local Qwen3.5-27B teacher. 1 epoch is 1.47M examples / 455M tokens. Note: the teacher agreed with only 72% of its own generic labels.
- **Training:** cross-entropy fine-tune, with per-type temperatures fitted after. An RL stage exists but is not released.
- **Compute:** 1 epoch takes 5.3 h on 1 GH200 (the GX10 is the same chip family).
- **Latency:** 2B GGUF takes 0.12–0.31 s on 8 CPU threads. 31B on vLLM takes 39 ms on a B300.
- **API:** `pip install decider-ai`, `POST /v1/systemone`, a vLLM server, and GGUF.
- **Benchmarks:** held-out 0.752 (2B), 0.784 (4B), 0.810 (35B). JevBench hard: 12B 0.730, the same as Jev's 0.730.
- **Limits:** English only. No multi-step math in one pass.
- **For us:** the largest public training mix. Its GH200 timing is a good guide for GX10 training time.

## 3. NanoJev
- **Repo:** https://github.com/TianyuCodings/NanoJev, MIT. HF: `C-Tianyu/NanoJev`, `C-Tianyu/NanoJev-Data`
- **Architecture:** a Qwen3-0.6B backbone plus decision heads. Choice uses set attention + softmax, yes/no uses a sigmoid, and Score uses a probability-weighted level. All candidates go in one forward pass.
- **Size:** 0.6B
- **Data:** 18,760 questions (10,898 train) from **4 games**: ViZDoom Predict Position, ViZDoom Basic, Maze, and Snake. Also 896 expert episodes (17,498 decisions).
- **Training:** cross-entropy on the full question, with mixed-task weights. Backbone LR 1e-5, head LR 1e-4. The released checkpoint is step 400. RLCD is on the roadmap only.
- **Compute / latency:** not stated. Needs CUDA (no Apple path).
- **API:** `POST /api/evaluate` (not the Jev format).
- **Benchmarks:** ViZDoom Basic 128/128 vs Jev 56/128. Snake 8/8 (tie). Maze 4/10 vs Jev 7/10.
- **For us:** **most relevant.** It shows a 0.6B model can beat Jev on games with only ~11k training questions. Copy its data format.

## 4. Laya
- **Repo:** https://github.com/NandhaKishorM/laya, Apache-2.0, by Convai Innovations. HF: `convaiinnovations/laya`
- **Architecture:** a non-autoregressive bidirectional encoder (it reads the whole input at once, like BERT). A Router picks the checkpoint by language.
- **Sizes:** `laya` 421M (ModernBERT-large, 512 ctx), `laya-multilingual` 322M (mmBERT-base, 100+ languages), and `laya-typed-decisions` 421M.
- **Data:** not stated in the README.
- **Training:** the README says "RL against strictly proper scoring rules (RLCD)", with temperatures fitted after. It gives no loss formula.
- **Latency:** 33–39.5 ms on a T4, 7.2 ms per question batched. On CPU (28 threads) it takes 192–453 ms.
- **API:** `laya-serve` exposes `POST /v1/systemone`. It also has a CLI, an MCP server, and LangChain support.
- **Benchmarks:** the base model is weak (0.362 typed-decisions, Banking77 0.425 vs Jev 0.870). The fine-tuned model scores 0.766 vs Jev 0.727.
- **For us:** the most popular project (~19k stars). It is a good "tiny model" point on the comparison chart.

## 5. Von
- **Repo:** https://github.com/wfzyx/von, Apache-2.0. HF: `wfzyx/von` (v1.3)
- **Architecture:** ModernBERT-large with one `[MASK]` marker per option, and a softmax over the marker logits. Since v1.2, option order does not change the answer.
- **Size:** 395M, 8192 ctx
- **Data:** a ~290k-item balanced decision corpus (enterprise workflow, security, ANLI/WANLI, safety, and other areas), then synthetic two-hop and numeric sets.
- **Training:** listwise softmax cross-entropy plus a Brier loss (Brier = a score for how good the probabilities are).
- **Latency:** 23 ms on an A10G, 96 ms on 4 vCPU (OpenVINO), and **~18 ms per decision in ViZDoom**.
- **API:** Choice / Noul / Score, plus a `system_one` fan-out.
- **Benchmarks:** jabr 72.0% (best open model there, Jev 96.6%). ViZDoom Defend-the-Center: 9.0 kills per episode.
- **For us:** fast enough for real-time games. Its loss mix (CE + Brier) is a good idea for calibration.

## 6. SemIf (formerly OpenJev)
- **Repo:** https://github.com/TheoLeeCJ/SemIf-OpenJev, MIT
- **Architecture:** **no new model.** It runs one forward pass of a frozen LLM and reads the logits of the option tokens. One state can be prefilled once, then branched across many questions.
- **Models tested:** Qwen3-0.6B, MiniCPM5-2B, Qwen3.5-4B, and Qwen3.8-27B (EXL3 5bpw).
- **Data / training:** none. It fits only a temperature on labelled decisions.
- **Latency:** 4B on an RTX 3090 takes 1.023 s vs 5.332 s for JSON generation (5.2× faster). It reaches 20 decisions/s with parallel suffixes.
- **API:** CLI `semif-score` only (no HTTP server). Backends: CUDA, MPS, MLX, and llama.cpp.
- **Benchmarks:** balanced accuracy 0.440 (0.6B), 0.686 (2B), 0.813 (4B), and 0.958 (27B).
- **For us:** the zero-training baseline. Its 0.6B → 4B → 27B ladder shows how much training adds.
- **Note:** other repos also use the name "OpenJev" (for example `alanhuangyoo/OpenJev`). They are different projects.

## 7. open-alternative-jev (`so1`)
- **Repo:** https://github.com/ikermoel/open-alternative-jev, Apache-2.0
- **Architecture:** no training. It reads the next-token distribution over option letters. Many questions are packed into one sequence. `permutations=2` averages the two option orders.
- **Models:** any ChatML LLM (Qwen2.5-0.5B, Qwen3.5-4B, Qwen3.6-27B).
- **Data / training:** none. Temperature scaling needs only a few hundred labelled examples.
- **Latency:** 27B 8-bit takes 582 ms per case on an H200 MIG slice (Jev takes 710 ms).
- **API:** Python only (HF or vLLM backend). Not Jev-SDK compatible.
- **Benchmarks:** zero-shot 27B scores 73.7% vs Jev 72.7% on typed-decisions, with much better calibration (ECE 0.020 vs 0.144).
- **For us:** shows that a big model with no training can match Jev. This is a strong baseline row.

## 8. jevlike
- **Repo:** https://github.com/vinnylarouge/jevlike, MIT
- **Architecture:** each option is a query that attends over the context. A dot product scores each option, then a softmax. The encoder is either bytes trained from scratch or a frozen HF encoder (for example Qwen2.5-0.5B).
- **Size:** not stated (tiny).
- **Data:** synthetic menus, your own JSONL (`context`, `options`, `label`), and Wikispeedia clicks.
- **Training:** supervised. Trains on CPU, MPS, or CUDA.
- **Benchmarks:** ~98% on synthetic data. Chess: lost 48/50 games vs Stockfish level 0. Doom: 0.60 kills per episode.
- **Limits:** context is cut to 192 bytes. The author says it is a research starter, not for production.
- **For us:** a good teaching example. Too weak to compare against.

## 9. CLM (Contrastive Language Models), the teammate's track
- **Repo:** https://github.com/Contrastive-LM/CLM
- **Architecture:** a state encoder and an action encoder (a frozen LLM + a 20M trainable projection head). It scores state vs each action, then a softmax. Action embeddings can be cached.
- **Size:** Qwen3-8B backbone. The head (CLM-v0.1-8B) is ~75 MB.
- **Data:** about 60M Nemotron DQA pairs (pre-train), then ~30M synthetic hard negatives (Gemini 2.5 Flash-Lite), then ~1M agent trajectories + 40% replay.
- **Training:** bidirectional InfoNCE (a contrastive loss: it pulls the right pair close and pushes the wrong pairs away), with hard negatives in the middle stage.
- **Latency:** says "on par with Jev, up to 9× lower latency". The demo runs on 1 RTX 4090.
- **For us:** a different method from the others. Good as a separate comparison row.

---

## Not researched (names only)
Bespoke Nimble (9B), GLiNER2.5-Decide (340M), Together AI Tev1-4B, AnyJev, OpenThai-SystemOne (0.8B), jevk5, poorjev, Foq, WaterSheep.
Jev-compatible servers: Arbiter, sys1 (Rust), ollaya, laya-server.

## Quick takeaways
- There are two families. **Trained head** (Kev, Decider, NanoJev, Laya, Von) and **no training, read logits** (SemIf, so1).
- Kev, Decider, Laya, and Von serve `POST /v1/systemone`. If we serve it too, the Playground can swap between all of them.
- NanoJev shows that game data alone (~11k questions) beats Jev on games with a 0.6B model.

## Sources
- https://pinggy.io/blog/best_open_source_jev_alternatives_self_hosted_decision_models/
- https://www.layer3labs.io/guides/system-one-decision-models
- https://dev.to/yanng981/open-source-jev-alternatives-system-one-models-you-can-self-host-i5e
- https://github.com/topics/jev-alternative
- Each repo and HF card linked above
