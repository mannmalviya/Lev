#!/usr/bin/env bash
# Start the System 1 gateway on the GX10 (Qwen3-4B and Qwen3.6 baselines + Lev + fake). Logs: ~/gateway.log
cd "$(dirname "$0")"
export BASELINE=1
export LEV="${LEV:-1}"
export LLAMA_BASELINE="${LLAMA_BASELINE:-1}"  # needs start-llama-baseline.sh running
export SYSTEM1_API_KEY="${SYSTEM1_API_KEY:-dev-token}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3100,http://localhost:3000}"
exec ~/.local/bin/uv run uvicorn gateway.app:app --host 0.0.0.0 --port "${PORT:-8000}"
