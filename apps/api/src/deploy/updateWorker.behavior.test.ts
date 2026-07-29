import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = resolve(__dirname, "../../../../deploy/update-worker.sh");

function bashPath(path: string) {
  if (process.platform !== "win32") return path;
  const normalized = path.replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) throw new Error(`Unsupported Windows path: ${path}`);
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function runWorkerShell(body: string) {
  const script = `
deploy_test_dir="$(mktemp -d)"
trap 'rm -rf "$deploy_test_dir"' RETURN
DEPLOY_DIR="$deploy_test_dir"
DEPLOY_STATE_DIR="$deploy_test_dir/state"
DEPLOY_WORKER_LOCK_HELD=1
source ${shellQuote(bashPath(workerPath))}
${body}
`;
  return spawnSync("bash", ["-s"], {
    encoding: "utf8",
    input: script
  });
}

describe("deployment worker behavior", () => {
  it("can be sourced without starting a deployment", () => {
    const result = runWorkerShell('printf "worker-sourced\\n"');

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("worker-sourced");
  }, 15_000);

  it("rejects liveness-true readiness-false deployments", () => {
    const result = runWorkerShell(`
DEPLOY_HEALTH_URL="https://club.example/api/health"
DEPLOY_READY_URL="https://club.example/api/ready"
DEPLOY_WEB_URL="https://club.example/"
ready_payload=false
curl() {
  local url="\${@: -1}"
  case "$url" in
    */api/health) printf '{"ok":true}\\n' ;;
    */api/ready) printf 'ready-probe\\n' >&2; printf '{"ok":%s}\\n' "$ready_payload" ;;
    */) printf '<div id="app"></div>\\n' ;;
    *) printf 'unexpected-url:%s\\n' "$url" >&2; return 1 ;;
  esac
}
sleep() { :; }
if wait_for_health; then
  exit 9
fi
ready_payload=true
wait_for_health
printf 'readiness-rejected\\n'
`);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("readiness-rejected");
    expect(result.stderr).toContain("ready-probe");
  }, 15_000);

  it("rolls back a partially failed full Compose reconciliation", () => {
    const result = runWorkerShell(`
write_status() { printf 'status:%s:%s\\n' "$1" "$2"; }
docker() { printf 'docker:%s\\n' "$*"; }
reconcile_failure_pending=1
compose() {
  printf 'compose:%s\\n' "$*"
  if [[ "$*" == "up -d postgres redis clamav api worker web caddy" && $reconcile_failure_pending -eq 1 ]]; then
    reconcile_failure_pending=0
    return 1
  fi
}
recreate_caddy() { printf 'caddy:recreated\\n'; }
wait_for_release_dependencies() { printf 'dependencies:healthy\\n'; }
wait_for_health() { printf 'application:healthy\\n'; }
verify_community_s3_lifecycle() { :; }
run_pre_migration_backup() { :; }
run_community_cleanup_dry_run() { :; }
api_changed=1
web_changed=1
previous_api_image="club-pwa-api:rollback-test"
previous_web_image="club-pwa-web:rollback-test"
trap fail_status EXIT
deploy_full
`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docker:tag club-pwa-api:rollback-test club-pwa-api:latest");
    expect(result.stdout).toContain("docker:tag club-pwa-web:rollback-test club-pwa-web:latest");
    expect(result.stdout).not.toContain("docker:image rm");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate api worker");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate web");
    expect(result.stdout).toContain("caddy:recreated");
    expect(result.stdout).toContain("application:healthy");
    expect(result.stdout).toContain("status:failed:reconcile");
  }, 15_000);

  it("rolls back when Caddy recreation fails after reconciliation", () => {
    const result = runWorkerShell(`
write_status() { printf 'status:%s:%s\\n' "$1" "$2"; }
docker() { printf 'docker:%s\\n' "$*"; }
caddy_failure_pending=1
compose() {
  printf 'compose:%s\\n' "$*"
  if [[ "$*" == "up -d --no-deps --force-recreate caddy" && $caddy_failure_pending -eq 1 ]]; then
    caddy_failure_pending=0
    return 1
  fi
}
wait_for_release_dependencies() { printf 'dependencies:healthy\\n'; }
wait_for_health() { printf 'application:healthy\\n'; }
api_changed=1
web_changed=1
candidate_images_built=1
reconciliation_started=1
previous_api_image="club-pwa-api:rollback-test"
previous_web_image="club-pwa-web:rollback-test"
trap fail_status EXIT
recreate_caddy
`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docker:tag club-pwa-api:rollback-test club-pwa-api:latest");
    expect(result.stdout).toContain("docker:tag club-pwa-web:rollback-test club-pwa-web:latest");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate api worker");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate web");
    expect(result.stdout.match(/compose:up -d --no-deps --force-recreate caddy/g)).toHaveLength(2);
    expect(result.stdout).toContain("application:healthy");
    expect(result.stdout).not.toContain("docker:image rm");
    expect(result.stdout).toContain("status:failed:recreate-caddy");
  }, 15_000);

  it("rolls back when operational timer installation fails after reconciliation", () => {
    const result = runWorkerShell(`
write_status() { printf 'status:%s:%s\\n' "$1" "$2"; }
docker() { printf 'docker:%s\\n' "$*"; }
compose() { printf 'compose:%s\\n' "$*"; }
recreate_caddy() { printf 'caddy:recreated\\n'; }
wait_for_release_dependencies() { printf 'dependencies:healthy\\n'; }
wait_for_health() { printf 'application:healthy\\n'; }
mkdir -p "$DEPLOY_DIR/deploy"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$DEPLOY_DIR/deploy/install-backup-timer.sh"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$DEPLOY_DIR/deploy/install-host-monitor.sh"
printf '#!/usr/bin/env bash\\nexit 1\\n' > "$DEPLOY_DIR/deploy/install-storage-maintenance.sh"
api_changed=1
web_changed=1
candidate_images_built=1
reconciliation_started=1
previous_api_image="club-pwa-api:rollback-test"
previous_web_image="club-pwa-web:rollback-test"
trap fail_status EXIT
install_operational_timers
`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docker:tag club-pwa-api:rollback-test club-pwa-api:latest");
    expect(result.stdout).toContain("docker:tag club-pwa-web:rollback-test club-pwa-web:latest");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate api worker");
    expect(result.stdout).toContain("compose:up -d --no-deps --force-recreate web");
    expect(result.stdout).toContain("caddy:recreated");
    expect(result.stdout).toContain("application:healthy");
    expect(result.stdout).not.toContain("docker:image rm");
    expect(result.stdout).toContain("status:failed:install-timers");
  }, 15_000);

  it("restores latest tags without recreating services when a post-build pre-migration check fails", () => {
    const result = runWorkerShell(`
write_status() { printf 'status:%s:%s\\n' "$1" "$2"; }
docker() { printf 'docker:%s\\n' "$*"; }
compose() { printf 'compose:%s\\n' "$*"; }
wait_for_release_dependencies() { :; }
verify_community_s3_lifecycle() { current_phase="s3-lifecycle"; return 1; }
api_changed=1
web_changed=0
previous_api_image="club-pwa-api:rollback-test"
trap fail_status EXIT
deploy_api
`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("compose:build api");
    expect(result.stdout).toContain("docker:tag club-pwa-api:rollback-test club-pwa-api:latest");
    expect(result.stdout).not.toContain("compose:up -d --no-deps --force-recreate");
    expect(result.stdout).not.toContain("docker:image rm");
    expect(result.stdout).toContain("status:failed:s3-lifecycle");
  }, 15_000);
});
