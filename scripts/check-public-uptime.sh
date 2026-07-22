#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${PUBLIC_URL:-https://club2.myn8nservertest.ru}"
CURL_ARGS=(--fail --silent --show-error --max-time 10 --retry 2 --retry-delay 2)

curl "${CURL_ARGS[@]}" "$PUBLIC_URL/" >/dev/null
curl "${CURL_ARGS[@]}" "$PUBLIC_URL/api/health" | grep -q '"ok":true'
curl "${CURL_ARGS[@]}" "$PUBLIC_URL/api/ready" | grep -q '"ok":true'
