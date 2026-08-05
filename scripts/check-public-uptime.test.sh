#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKER="$REPO_ROOT/scripts/check-public-uptime.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

install_fake_curl() {
  local case_dir="$1"
  mkdir -p "$case_dir/bin"
  cat >"$case_dir/bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -u

url=""
resolve=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "--resolve" ]]; then
    resolve="$argument"
  fi
  if [[ "$argument" == http://* || "$argument" == https://* ]]; then
    url="$argument"
  fi
  previous="$argument"
done

printf '%s\n' "$*" >>"$FAKE_CURL_LOG"

if [[ "$url" == https://dns.google/* ]]; then
  if [[ "$FAKE_CURL_SCENARIO" == "resolver_down" ]]; then
    exit 6
  fi
  printf '%s\n' '{"Status":0,"Answer":[{"name":"club2.myn8nservertest.ru.","type":1,"TTL":3600,"data":"2.27.28.89"}]}'
  exit 0
fi

if [[ "$url" == https://cloudflare-dns.com/* ]]; then
  if [[ "$FAKE_CURL_SCENARIO" == "resolver_down" ]]; then
    exit 6
  fi
  printf '%s\n' '{"Status":0,"Answer":[{"name":"club2.myn8nservertest.ru.","type":1,"TTL":3600,"data":"2.27.28.89"}]}'
  exit 0
fi

if [[ "$FAKE_CURL_SCENARIO" == "dns_fallback" || "$FAKE_CURL_SCENARIO" == "resolver_down" ]]; then
  if [[ -z "$resolve" ]]; then
    exit 6
  fi
fi

if [[ "$url" == */api/health ]]; then
  if [[ "$FAKE_CURL_SCENARIO" == "endpoint_failure" ]]; then
    printf '%s\n' '{"ok":false}'
  else
    printf '%s\n' '{"ok":true}'
  fi
elif [[ "$url" == */api/ready ]]; then
  printf '%s\n' '{"ok":true}'
fi
FAKE_CURL
  chmod +x "$case_dir/bin/curl"
}

run_checker() {
  local scenario="$1"
  local case_dir="$TEST_ROOT/$scenario"
  mkdir -p "$case_dir"
  install_fake_curl "$case_dir"
  : >"$case_dir/curl.log"

  set +e
  PATH="$case_dir/bin:$PATH" \
    FAKE_CURL_SCENARIO="$scenario" \
    FAKE_CURL_LOG="$case_dir/curl.log" \
    PUBLIC_URL="https://club2.myn8nservertest.ru" \
    bash "$CHECKER" >"$case_dir/stdout.log" 2>"$case_dir/stderr.log"
  CASE_STATUS=$?
  set -e
  CASE_DIR="$case_dir"
}

run_checker normal
[[ "$CASE_STATUS" -eq 0 ]] || fail "normal healthy endpoints returned $CASE_STATUS"

run_checker dns_fallback
[[ "$CASE_STATUS" -eq 0 ]] || fail "public DNS fallback did not recover runner DNS failure"
grep -q -- '--resolve club2.myn8nservertest.ru:443:2.27.28.89' "$CASE_DIR/curl.log" || \
  fail "fallback did not verify HTTPS endpoints with the independently resolved address"

run_checker resolver_down
[[ "$CASE_STATUS" -ne 0 ]] || fail "checker passed while normal and public DNS resolution were unavailable"

run_checker endpoint_failure
[[ "$CASE_STATUS" -ne 0 ]] || fail "checker masked a health endpoint failure"
if grep -q 'dns.google\|cloudflare-dns.com' "$CASE_DIR/curl.log"; then
  fail "checker invoked DNS fallback for a non-DNS endpoint failure"
fi

echo "External uptime regression scenarios passed."
