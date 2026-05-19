#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_FRONTEND_DIR="$ROOT_DIR/web/default"
CLASSIC_FRONTEND_DIR="$ROOT_DIR/web/classic"
VERSION_FILE="$ROOT_DIR/VERSION"
DEFAULT_POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
DEFAULT_POSTGRES_PORT="${POSTGRES_PORT:-5432}"
DEFAULT_POSTGRES_USER="${POSTGRES_USER:-root}"
DEFAULT_POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-123456}"
DEFAULT_POSTGRES_DB="${POSTGRES_DB:-new-api}"

log() {
  printf '[start.sh] %s\n' "$*"
}

warn() {
  printf '[start.sh] WARN: %s\n' "$*" >&2
}

is_tcp_port_open() {
  local host="$1"
  local port="$2"
  (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1
}

configure_default_sql_dsn() {
  if [ -n "${SQL_DSN:-}" ]; then
    log "Using SQL_DSN from environment"
    return
  fi

  if is_tcp_port_open "$DEFAULT_POSTGRES_HOST" "$DEFAULT_POSTGRES_PORT"; then
    export SQL_DSN="postgresql://${DEFAULT_POSTGRES_USER}:${DEFAULT_POSTGRES_PASSWORD}@${DEFAULT_POSTGRES_HOST}:${DEFAULT_POSTGRES_PORT}/${DEFAULT_POSTGRES_DB}"
    log "Detected PostgreSQL on ${DEFAULT_POSTGRES_HOST}:${DEFAULT_POSTGRES_PORT}; using it by default"
    return
  fi

  log "PostgreSQL not detected on ${DEFAULT_POSTGRES_HOST}:${DEFAULT_POSTGRES_PORT}; falling back to SQLite"
}

pick_pkg_manager() {
  local dir="$1"

  if command -v bun >/dev/null 2>&1 && [ -f "$dir/bun.lock" ]; then
    echo "bun"
    return
  fi
  if command -v pnpm >/dev/null 2>&1 && [ -f "$dir/pnpm-lock.yaml" ]; then
    echo "pnpm"
    return
  fi
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return
  fi

  return 1
}

ensure_node_modules() {
  local dir="$1"
  local pkg_manager="$2"

  if [ -d "$dir/node_modules" ]; then
    return
  fi

  log "Installing frontend dependencies in $dir with $pkg_manager"
  (
    cd "$dir"
    case "$pkg_manager" in
      bun) bun install ;;
      pnpm) pnpm install ;;
      npm) npm install ;;
    esac
  )
}

build_frontend() {
  local dir="$1"
  local pkg_manager="$2"
  local version="$3"

  log "Building frontend in $dir with $pkg_manager"
  (
    cd "$dir"
    case "$pkg_manager" in
      bun) DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="$version" bun run build ;;
      pnpm) DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="$version" pnpm run build ;;
      npm) DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="$version" npm run build ;;
    esac
  )
}

ensure_classic_placeholder() {
  local dist_dir="$CLASSIC_FRONTEND_DIR/dist"
  mkdir -p "$dist_dir"
  if [ ! -f "$dist_dir/index.html" ]; then
    cat >"$dist_dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New API Classic</title>
  </head>
  <body>
    <div id="root">Classic frontend build is unavailable in this local environment.</div>
  </body>
</html>
EOF
  fi
}

VERSION_VALUE="v0.0.0"
if [ -f "$VERSION_FILE" ]; then
  VERSION_VALUE="$(cat "$VERSION_FILE")"
fi

DEFAULT_PM="$(pick_pkg_manager "$DEFAULT_FRONTEND_DIR")" || {
  echo "No supported package manager found for $DEFAULT_FRONTEND_DIR" >&2
  exit 1
}
CLASSIC_PM="$(pick_pkg_manager "$CLASSIC_FRONTEND_DIR")" || {
  echo "No supported package manager found for $CLASSIC_FRONTEND_DIR" >&2
  exit 1
}

ensure_node_modules "$DEFAULT_FRONTEND_DIR" "$DEFAULT_PM"
build_frontend "$DEFAULT_FRONTEND_DIR" "$DEFAULT_PM" "$VERSION_VALUE"

ensure_node_modules "$CLASSIC_FRONTEND_DIR" "$CLASSIC_PM"
if ! build_frontend "$CLASSIC_FRONTEND_DIR" "$CLASSIC_PM" "$VERSION_VALUE"; then
  warn "Classic frontend build failed; falling back to a minimal placeholder page."
  ensure_classic_placeholder
fi

configure_default_sql_dsn

log "Starting backend on http://localhost:${PORT:-3000}"
cd "$ROOT_DIR"
exec go run main.go "$@"
