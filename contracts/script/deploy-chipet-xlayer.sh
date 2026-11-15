#!/usr/bin/env bash
# 在 X Layer 主网部署 Chipet 并登记模板。
# 私钥放 contracts/.env（见 .env.example），forge / 本脚本都会读。
# 用法：
#   export PATH="$HOME/.foundry/bin:$PATH"
#   HATCH_PRICE=0 ./script/deploy-chipet-xlayer.sh
#   CHIPET=0x… ./script/deploy-chipet-xlayer.sh seed
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BROADCAST=(--rpc-url xlayer --broadcast --start-fresh)
# 兼容 X_LAYER_PRIVATE_KEY（推荐）与 PRIVATE_KEY
DEPLOY_KEY="${X_LAYER_PRIVATE_KEY:-${PRIVATE_KEY:-}}"
if [[ -n "$DEPLOY_KEY" ]]; then
  BROADCAST+=(--private-key "$DEPLOY_KEY")
elif [[ -n "${ACCOUNT:-}" ]]; then
  BROADCAST+=(--account "$ACCOUNT")
else
  echo "在 contracts/.env 写入 X_LAYER_PRIVATE_KEY=0x…（参考 .env.example）" >&2
  exit 1
fi

cmd="${1:-all}"

if [[ "$cmd" == "all" || "$cmd" == "deploy" ]]; then
  echo ">>> DeployChipet (HATCH_PRICE=${HATCH_PRICE:-0})"
  HATCH_PRICE="${HATCH_PRICE:-0}" forge script script/DeployChipet.s.sol "${BROADCAST[@]}" -vv
  CHIPET="$(python3 - <<'PY'
import json,glob,os
paths=sorted(glob.glob("deployments/*-chipet.json"), key=os.path.getmtime)
if not paths: raise SystemExit("no deployments/*-chipet.json")
print(json.load(open(paths[-1]))["chipet"])
PY
)"
  echo ">>> chipet=$CHIPET"
fi

if [[ "$cmd" == "all" || "$cmd" == "seed" ]]; then
  : "${CHIPET:?set CHIPET=0x..}"
  CPU="${CPU:-0x839bdD6fa7A66416A609A735e11DE5411B98574e}"
  echo ">>> SeedChipetTemplates CHIPET=$CHIPET CPU=$CPU USE_EXISTING=1"
  CHIPET="$CHIPET" CPU="$CPU" USE_EXISTING=1 \
    forge script script/SeedChipetTemplates.s.sol "${BROADCAST[@]}" -vv
fi

echo ">>> sync packages/chain/src/deployments.json"
(cd .. && npx tsx scripts/sync-deployments.ts)

echo "done. Set UI to X Layer — undeployed banner should disappear once chipet is in deployments.json."
