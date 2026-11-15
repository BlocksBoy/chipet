#!/usr/bin/env bash
# 为 chipet.web3book.io 创建/更新 Cloudflare A 记录（橙色云朵代理）→ 弗吉尼亚源站。
# 需要环境变量：CF_API_TOKEN（Zone.DNS Edit）、可选 CF_ZONE_ID（不填则按域名查询）。
#
#   CF_API_TOKEN=xxx ./deploy/cloudflare-dns.sh
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$_SCRIPT_DIR/.env.deploy.local" ]]; then
  set +u
  # shellcheck disable=SC1091
  source "$_SCRIPT_DIR/.env.deploy.local"
  set -u
fi

DOMAIN="${SITE_DOMAIN:-chipet.web3book.io}"
ZONE_NAME="${CF_ZONE_NAME:-web3book.io}"
ORIGIN_IP="${SERVER_HOST:-43.165.64.16}"
CF_API_TOKEN="${CF_API_TOKEN:?请设置 CF_API_TOKEN}"

api() {
  local method=$1 path=$2
  shift 2
  curl -fsS -X "$method" "https://api.cloudflare.com/client/v4$path" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  CF_ZONE_ID=$(api GET "/zones?name=$ZONE_NAME" | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["result"][0]["id"])')
fi
echo "zone=$CF_ZONE_ID domain=$DOMAIN ip=$ORIGIN_IP"

EXISTING=$(api GET "/zones/$CF_ZONE_ID/dns_records?type=A&name=$DOMAIN" | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["result"][0]["id"] if r["result"] else "")')
BODY=$(python3 -c 'import json,os; print(json.dumps({"type":"A","name":os.environ["DOMAIN"],"content":os.environ["ORIGIN_IP"],"ttl":1,"proxied":True}))')
export DOMAIN ORIGIN_IP

if [[ -n "$EXISTING" ]]; then
  echo ">>> 更新记录 $EXISTING"
  api PUT "/zones/$CF_ZONE_ID/dns_records/$EXISTING" --data "$BODY" | python3 -c 'import sys,json; r=json.load(sys.stdin); assert r.get("success"), r; print(r["result"]["name"], "→", r["result"]["content"], "proxied=", r["result"]["proxied"])'
else
  echo ">>> 创建记录"
  api POST "/zones/$CF_ZONE_ID/dns_records" --data "$BODY" | python3 -c 'import sys,json; r=json.load(sys.stdin); assert r.get("success"), r; print(r["result"]["name"], "→", r["result"]["content"], "proxied=", r["result"]["proxied"])'
fi

echo ">>> 完成。访问 https://$DOMAIN （SSL 模式保持「完整（严格）」）"
