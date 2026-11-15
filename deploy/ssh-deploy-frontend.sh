#!/usr/bin/env bash
# 在本机执行：构建 web/ → scp → 服务器同步到 $DEPLOY_PATH/frontend-dist。
# 静态由 hbtc 同机 Caddy 托管 chipet.web3book.io（见 apply-caddy-site.sh）。
#
# 配置：deploy/.env.deploy.local（已 gitignore），至少 SERVER_USER、SERVER_HOST。
#   ./deploy/ssh-deploy-frontend.sh
#   SKIP_BUILD=1 ./deploy/ssh-deploy-frontend.sh
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

SERVER_USER="${SERVER_USER:?请设置 SERVER_USER，例如 ubuntu}"
SERVER_HOST="${SERVER_HOST:?请设置 SERVER_HOST，例如服务器公网 IP}"
SERVER_PORT="${SERVER_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/chipet}"
REMOTE_PACKAGE_PATH="${REMOTE_PACKAGE_PATH_FRONTEND:-/tmp/chipet-frontend-sync.tgz}"

SSH_CMD=(ssh -p "$SERVER_PORT")
SCP_CMD=(scp -P "$SERVER_PORT")
if [[ -n "${SSH_IDENTITY:-}" ]]; then
  SSH_CMD+=(-i "$SSH_IDENTITY")
  SCP_CMD+=(-i "$SSH_IDENTITY")
fi
SSH_CMD+=("$SERVER_USER@$SERVER_HOST")

REPO_ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
WEB="$REPO_ROOT/web"
if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo ">>> 本机构建 web/ …"
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    (cd "$REPO_ROOT" && npm ci --no-audit --no-fund)
  fi
  (cd "$REPO_ROOT" && npm run build:web)
fi
[[ -f "$WEB/dist/index.html" ]] || { echo "错误: 未找到 web/dist/index.html" >&2; exit 1; }

LOCAL_TAR=$(mktemp /tmp/chipet-frontend-pack.XXXXXX)
trap 'rm -f "$LOCAL_TAR"' EXIT
(cd "$WEB/dist" && COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf "$LOCAL_TAR" --exclude=.DS_Store .)

echo ">>> scp → $SERVER_USER@$SERVER_HOST:$REMOTE_PACKAGE_PATH"
"${SCP_CMD[@]}" "$LOCAL_TAR" "$SERVER_USER@$SERVER_HOST:$REMOTE_PACKAGE_PATH"

Q_PATH=$(printf %q "$DEPLOY_PATH")
Q_PKG=$(printf %q "$REMOTE_PACKAGE_PATH")

"${SSH_CMD[@]}" bash -s <<REMOTE
set -euo pipefail
DEPLOY_PATH=$Q_PATH
PKG=$Q_PKG
command -v rsync >/dev/null 2>&1 || { echo "错误: 需要 rsync（sudo apt install -y rsync）" >&2; exit 1; }
TMP=\$(mktemp -d)
tar -xzf "\$PKG" -C "\$TMP"
chmod -R a+rX "\$TMP"
mkdir -p "\$DEPLOY_PATH/frontend-dist"
# 新的 assets 先到位、index.html 最后替换；旧的带 hash 的 assets 保留 7 天。
rsync -a --exclude index.html "\$TMP"/ "\$DEPLOY_PATH/frontend-dist"/
rsync -a --delete --filter='P assets/***' "\$TMP"/ "\$DEPLOY_PATH/frontend-dist"/
find "\$DEPLOY_PATH/frontend-dist/assets" -type f -mtime +7 -delete 2>/dev/null || true
rm -rf "\$TMP" "\$PKG"
echo "frontend-dist: \$(find "\$DEPLOY_PATH/frontend-dist" -type f | wc -l) files"
REMOTE

echo ">>> 完成。站点目录: $DEPLOY_PATH/frontend-dist"
