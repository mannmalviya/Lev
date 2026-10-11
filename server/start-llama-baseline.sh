#!/usr/bin/env bash
# Qwen3.6-35B-A3B on llama.cpp for the LLM baseline (gateway backend "llamacpp"). Logs: ~/llama-baseline.log
# MoE: 35B weights, ~3B active per token, so it runs about as fast as a small model.
# Port 8001, so it does not clash with the gateway (8000). Small context: one game prompt is ~300 tokens.
exec ~/llama.cpp/llama-server \
  --model ~/unsloth/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --alias qwen3.6-35b-a3b \
  --host 127.0.0.1 --port "${LLAMA_PORT:-8001}" \
  --ctx-size 8192 --parallel 2 \
  --n-gpu-layers 999 --flash-attn on \
  --jinja
