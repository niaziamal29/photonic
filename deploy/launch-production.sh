#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.production.yml"
ENV_FILE="${1:-${ROOT_DIR}/deploy/.env.production}"
MODELS_DIR="${ROOT_DIR}/models"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is required" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not reachable" >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "missing env file: ${ENV_FILE}" >&2
  echo "copy deploy/.env.production.example to deploy/.env.production and edit it first" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local line

  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  if [ -z "${line}" ]; then
    return 1
  fi

  printf '%s' "${line#*=}"
}

required_vars=(
  APP_DOMAIN
  PUBLIC_ORIGIN
  BASE_PATH
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  LOG_LEVEL
  ML_MODEL_PATH
  ML_MODEL_VERSION
  CVAE_MODEL_PATH
)

for name in "${required_vars[@]}"; do
  if ! value="$(read_env_value "${name}")" || [ -z "${value}" ]; then
    echo "missing required variable in ${ENV_FILE}: ${name}" >&2
    exit 1
  fi
  printf -v "${name}" '%s' "${value}"
done

case "${APP_DOMAIN}" in
  http://*|https://*)
    echo "APP_DOMAIN must contain only the host or IP address." >&2
    exit 1
    ;;
esac

case "${PUBLIC_ORIGIN}" in
  http://*|https://*) ;;
  *)
    echo "PUBLIC_ORIGIN must start with http:// or https://." >&2
    exit 1
    ;;
esac

origin_host="${PUBLIC_ORIGIN#*://}"
origin_host="${origin_host%%/*}"

if [ "${origin_host}" != "${APP_DOMAIN}" ] && [ "${origin_host}" != "${APP_DOMAIN}:80" ] && [ "${origin_host}" != "${APP_DOMAIN}:443" ]; then
  echo "PUBLIC_ORIGIN host must match APP_DOMAIN." >&2
  exit 1
fi

mkdir -p "${MODELS_DIR}"

compose_cmd=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
"${compose_cmd[@]}" config -q
"${compose_cmd[@]}" up -d --build db sidecar
"${compose_cmd[@]}" run --rm migrate
"${compose_cmd[@]}" up -d api web
"${compose_cmd[@]}" ps

echo
echo "Deployment is up. Verify these URLs:"
echo "  ${PUBLIC_ORIGIN}/api/healthz"
echo "  ${PUBLIC_ORIGIN}/api/predict/status"
echo "  ${PUBLIC_ORIGIN}/api/generate/status"
echo "  ${PUBLIC_ORIGIN}/api/ml"

case "${PUBLIC_ORIGIN}" in
  http://*)
    echo
    echo "HTTP-only launch is active. Replace APP_DOMAIN and PUBLIC_ORIGIN with your real hostname later to enable HTTPS in Caddy."
    ;;
esac
