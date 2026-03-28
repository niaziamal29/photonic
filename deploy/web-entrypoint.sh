#!/bin/sh
set -eu

app_domain="${APP_DOMAIN:-localhost}"
public_origin="${PUBLIC_ORIGIN:-}"
template="/etc/caddy/templates/Caddyfile.https"

case "${app_domain}" in
  http://*|https://*)
    echo "APP_DOMAIN must contain only the host or IP address." >&2
    exit 1
    ;;
esac

if [ -n "${public_origin}" ]; then
  case "${public_origin}" in
    http://*)
      origin_host="${public_origin#http://}"
      template="/etc/caddy/templates/Caddyfile.http"
      expected_alt="${app_domain}:80"
      ;;
    https://*)
      origin_host="${public_origin#https://}"
      template="/etc/caddy/templates/Caddyfile.https"
      expected_alt="${app_domain}:443"
      ;;
    *)
      echo "PUBLIC_ORIGIN must start with http:// or https://." >&2
      exit 1
      ;;
  esac

  origin_host="${origin_host%%/*}"
  if [ "${origin_host}" != "${app_domain}" ] && [ "${origin_host}" != "${expected_alt}" ]; then
    echo "PUBLIC_ORIGIN host must match APP_DOMAIN." >&2
    exit 1
  fi
fi

cp "${template}" /etc/caddy/Caddyfile
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
