#!/usr/bin/env bash
set -euo pipefail

revision="370f27d7550e0def9b39c1f16d3fbaa13aa67728"
filename="Qwen3-Embedding-0.6B-Q8_0.gguf"
expected_sha256="06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439"
model_dir="${MODEL_DIR:-/opt/pi-memory-embedding/models}"
url="https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/${revision}/${filename}"
final="${model_dir}/${filename}"
tmp="${final}.tmp"

install -d -m 0755 "$model_dir"
if [ -f "$final" ] && printf '%s  %s\n' "$expected_sha256" "$final" | sha256sum --check --status; then
  printf 'Model already verified: %s\n' "$final"
  exit 0
fi

trap 'rm -f "$tmp"' EXIT
curl --fail --location --retry 5 --retry-all-errors --continue-at - --output "$tmp" "$url"
printf '%s  %s\n' "$expected_sha256" "$tmp" | sha256sum --check --status
chmod 0444 "$tmp"
mv "$tmp" "$final"
trap - EXIT
printf 'Downloaded and verified: %s\n' "$final"
