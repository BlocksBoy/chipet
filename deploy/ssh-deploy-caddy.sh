#!/usr/bin/env bash
# 首次/更新：上传 Caddyfile + docker-compose + Origin 证书，在弗吉尼亚拉起 Caddy（8443）。
# 配置：deploy/.env.deploy.local；证书默认取自 hbtc-mechanism/backend/certs（*.web3book.io）。
#
#   ./deploy/ssh-deploy-caddy.sh
#   CERT_FILE=... KEY_FILE=... ./deploy/ssh-deploy-caddy.sh
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$_SCRIPT_DIR/.env.deploy.local" ]]; then
  set +u
  # shellcheck disable=SC1091
  source "$_SCRIPT_DIR/.env.deploy.local"
  set -u
fi

if [[ -n "${SSH_IDENTITY:-}" ]] && [[ "${SSH_IDENTITY:0:1}" == '~' ]]; then
  SSH_IDENTITY="${SSH_IDENTITY/#\~/${HOME}}"
fi

SERVER_USER="${SERVER_USER:?请设置 SERVER_USER}"
SERVER_HOST="${SERVER_HOST:?请设置 SERVER_HOST}"
SERVER_PORT="${SERVER_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/chipet}"
SITE_DOMAIN="${SITE_DOMAIN:-chipet.web3book.io}"
CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-8443}"

CERT_FILE="${CERT_FILE:-$HOME/Documents/Works/Agents/Code/hbtc-mechanism/backend/certs/origin.pem}"
KEY_FILE="${KEY_FILE:-$HOME/Documents/Works/Agents/Code/hbtc-mechanism/backend/certs/origin.key}"
[[ -f "$CERT_FILE" && -f "$KEY_FILE" ]] || { echo "错误: 缺少 Origin 证书 $CERT_FILE / $KEY_FILE" >&2; exit 1; }

SSH_CMD=(ssh -p "$SERVER_PORT")
SCP_CMD=(scp -P "$SERVER_PORT")
if [[ -n "${SSH_IDENTITY:-}" ]]; then
  SSH_CMD+=(-i "$SSH_IDENTITY")
  SCP_CMD+=(-i "$SSH_IDENTITY")
fi
SSH_CMD+=("$SERVER_USER@$SERVER_HOST")

echo ">>> 确保远程目录与 Docker"
"${SSH_CMD[@]}" bash -s <<REMOTE
set -euo pipefail
mkdir -p "$DEPLOY_PATH"/{certs,frontend-dist}
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> 安装 Docker…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "\$USER" || true
fi
# 刚装完 docker 时当前 shell 可能没有 docker 组，用 sudo
if ! docker info >/dev/null 2>&1; then
  sudo docker info >/dev/null
  DOCKER=(sudo docker)
else
  DOCKER=(docker)
fi
"\${DOCKER[@]}" compose version >/dev/null
REMOTE

echo ">>> 上传 Caddyfile / compose / 证书"
"${SCP_CMD[@]}" "$_SCRIPT_DIR/Caddyfile" "$_SCRIPT_DIR/docker-compose.yml" \
  "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/"
"${SCP_CMD[@]}" "$CERT_FILE" "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/certs/origin.pem"
"${SCP_CMD[@]}" "$KEY_FILE" "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/certs/origin.key"
"${SSH_CMD[@]}" "chmod 644 $DEPLOY_PATH/certs/origin.pem; chmod 600 $DEPLOY_PATH/certs/origin.key"

# 远程 .env 给 compose 读
"${SSH_CMD[@]}" "printf '%s\n' 'SITE_DOMAIN=$SITE_DOMAIN' 'CADDY_HTTPS_PORT=$CADDY_HTTPS_PORT' > $DEPLOY_PATH/.env.deploy"

echo ">>> docker compose up -d"
"${SSH_CMD[@]}" bash -s <<REMOTE
set -euo pipefail
cd "$DEPLOY_PATH"
if docker info >/dev/null 2>&1; then DC=(docker compose); else DC=(sudo docker compose); fi
"\${DC[@]}" --env-file .env.deploy -f docker-compose.yml up -d
"\${DC[@]}" --env-file .env.deploy -f docker-compose.yml ps
REMOTE

echo ">>> Caddy up on ${SERVER_HOST}:${CADDY_HTTPS_PORT} for ${SITE_DOMAIN}"
echo "    Cloudflare: A record -> ${SERVER_HOST} (proxied), Origin Rule destination port = ${CADDY_HTTPS_PORT}"
