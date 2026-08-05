#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${PUBLIC_URL:-https://club2.myn8nservertest.ru}"
PUBLIC_URL="${PUBLIC_URL%/}"
PUBLIC_HOST="${PUBLIC_URL#*://}"
PUBLIC_HOST="${PUBLIC_HOST%%/*}"
PUBLIC_HOST="${PUBLIC_HOST%%:*}"
CURL_ARGS=(--fail --silent --show-error --max-time 10 --retry 2 --retry-delay 2)
DNS_CURL_ARGS=(--fail --silent --show-error --max-time 10 --retry 1 --retry-delay 1)

check_api_endpoints() {
  local connection_args=("$@")
  curl "${CURL_ARGS[@]}" "${connection_args[@]}" "$PUBLIC_URL/api/health" | grep -q '"ok":true' || return $?
  curl "${CURL_ARGS[@]}" "${connection_args[@]}" "$PUBLIC_URL/api/ready" | grep -q '"ok":true'
}

check_all_endpoints() {
  local connection_args=("$@")
  curl "${CURL_ARGS[@]}" "${connection_args[@]}" "$PUBLIC_URL/" >/dev/null || return $?
  check_api_endpoints "${connection_args[@]}"
}

extract_first_ipv4() {
  python3 -c '
import ipaddress
import json
import sys

try:
    response = json.load(sys.stdin)
    for answer in response.get("Answer", []):
        candidate = answer.get("data", "")
        address = ipaddress.ip_address(candidate)
        if address.version == 4:
            print(address)
            raise SystemExit(0)
except (ValueError, TypeError, json.JSONDecodeError):
    pass
raise SystemExit(1)
'
}

resolve_with_doh() {
  local resolver_url="$1"
  curl "${DNS_CURL_ARGS[@]}" -H 'accept: application/dns-json' "$resolver_url" | extract_first_ipv4
}

set +e
curl "${CURL_ARGS[@]}" "$PUBLIC_URL/" >/dev/null
initial_status=$?
set -e

if [[ "$initial_status" -eq 0 ]]; then
  check_api_endpoints
  exit 0
fi

if [[ "$initial_status" -ne 6 && "$initial_status" -ne 28 ]]; then
  exit "$initial_status"
fi

resolver_urls=(
  "https://dns.google/resolve?name=${PUBLIC_HOST}&type=A"
  "https://cloudflare-dns.com/dns-query?name=${PUBLIC_HOST}&type=A"
)

for resolver_url in "${resolver_urls[@]}"; do
  if resolved_ip="$(resolve_with_doh "$resolver_url")" && [[ -n "$resolved_ip" ]]; then
    if check_all_endpoints --resolve "${PUBLIC_HOST}:443:${resolved_ip}"; then
      echo "::warning::Runner DNS failed with curl status ${initial_status}; service verified via public DNS at ${resolved_ip}."
      exit 0
    fi
  fi
done

echo "Public DNS fallback could not verify ${PUBLIC_HOST}." >&2
exit "$initial_status"
