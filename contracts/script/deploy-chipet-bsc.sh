#!/usr/bin/env bash
# 在 BSC 主网部署 Chipet 并登记模板（复用 Genesis Circuits 1/2/3）。
# 私钥放 contracts/.env（见 .env.example），forge / 本脚本都会读。
# 用法：
#   export PATH="$HOME/.foundry/bin:$PATH"
#   HATCH_PRICE=0 ./script/deploy-chipet-bsc.sh
#   CHIPET=0x… ./script/deploy-chipet-bsc.sh seed
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BROADCAST=(--rpc-url bsc --broadcast --start-fresh)
# 兼容 BSC_PRIVATE_KEY / X_LAYER_PRIVATE_KEY / PRIVATE_KEY
DEPLOY_KEY="${BSC_PRIVATE_KEY:-${X_LAYER_PRIVATE_KEY:-${PRIVATE_KEY:-}}}"
if [[ -n "$DEPLOY_KEY" ]]; then
  BROADCAST+=(--private-key "$DEPLOY_KEY")
elif [[ -n "${ACCOUNT:-}" ]]; then
  BROADCAST+=(--account "$ACCOUNT")
else
  echo "在 contracts/.env 写入 BSC_PRIVATE_KEY 或 X_LAYER_PRIVATE_KEY（参考 .env.example）" >&2
  exit 1
fi

BSC_FACTORY="${TAPEOUT_FACTORY:-0x68224F668083c29e9800Be2a646d42d18cedF7e2}"
BSC_CPU="${CPU:-0x50A994E71615474b55559fF4F500928fbc339DD9}"

cmd="${1:-all}"

if [[ "$cmd" == "all" || "$cmd" == "deploy" ]]; then
  echo ">>> DeployChipet on BSC (HATCH_PRICE=${HATCH_PRICE:-0} FACTORY=$BSC_FACTORY)"
  HATCH_PRICE="${HATCH_PRICE:-0}" TAPEOUT_FACTORY="$BSC_FACTORY" \
    forge script script/DeployChipet.s.sol "${BROADCAST[@]}" -vv
  CHIPET="$(python3 - <<'PY'
import json,glob,os
paths=sorted(glob.glob("deployments/*-chipet.json"), key=os.path.getmtime)
if not paths: raise SystemExit("no deployments/*-chipet.json")
# prefer chain 56 if present among recent
best=None
for p in reversed(paths):
    d=json.load(open(p))
    if int(d.get("chainId",0))==56:
        best=d["chipet"]; break
if not best: best=json.load(open(paths[-1]))["chipet"]
print(best)
PY
)"
  echo ">>> chipet=$CHIPET"
fi

if [[ "$cmd" == "all" || "$cmd" == "seed" ]]; then
  : "${CHIPET:?set CHIPET=0x..}"
  echo ">>> SeedChipetTemplates CHIPET=$CHIPET CPU=$BSC_CPU USE_EXISTING=1"
  CHIPET="$CHIPET" CPU="$BSC_CPU" USE_EXISTING=1 \
    forge script script/SeedChipetTemplates.s.sol "${BROADCAST[@]}" -vv
fi

echo ">>> sync packages/chain/src/deployments.json"
(cd .. && npx tsx scripts/sync-deployments.ts)

echo "done. Set UI to BSC — undeployed banner should disappear once chipet is in deployments.json."
