# External Uptime DNS Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent GitHub-hosted runner DNS glitches from creating false outage alerts while preserving alerts for confirmed DNS, HTTP, health, and readiness failures.

**Architecture:** Keep the normal curl-based public check as the primary path. On curl status 6 or 28 only, query Google and Cloudflare DNS-over-HTTPS, validate returned IPv4 addresses, and repeat the same HTTPS checks with curl `--resolve` so TLS and Host routing remain production-equivalent.

**Tech Stack:** Bash, curl, Python 3 JSON/IP validation, Vitest static infrastructure assertions, GitHub Actions.

## Global Constraints

- Do not change application or production deployment code.
- Do not hide non-DNS endpoint failures.
- A fallback success must verify `/`, `/api/health`, and `/api/ready` over HTTPS.
- A failure of both independent resolvers must keep the workflow failed.

---

### Task 1: Behavioral regression coverage

**Files:**
- Create: `scripts/check-public-uptime.test.sh`
- Modify: `apps/api/src/deploy/externalMonitoring.test.ts`

**Interfaces:**
- Consumes: `scripts/check-public-uptime.sh`, `PUBLIC_URL`, and `curl` from `PATH`.
- Produces: a standalone Bash regression suite invoked by Vitest.

- [ ] **Step 1: Write the failing regression test**

Create a temporary fake `curl` executable. Run the production checker for normal success, DNS fallback success, resolver failure, and ordinary endpoint failure. Assert the expected exit status and require `--resolve club2.myn8nservertest.ru:443:2.27.28.89` in the fallback scenario.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/api exec vitest run src/deploy/externalMonitoring.test.ts`

Expected: FAIL because `scripts/check-public-uptime.test.sh` and the fallback behavior do not exist yet.

- [ ] **Step 3: Keep the test failure specific**

Confirm the failure names DNS fallback behavior, not a missing test dependency or path typo.

### Task 2: DNS fallback implementation

**Files:**
- Modify: `scripts/check-public-uptime.sh`

**Interfaces:**
- Consumes: `PUBLIC_URL`, curl status codes, Google/Cloudflare DNS-over-HTTPS JSON.
- Produces: exit 0 for a service verified through a public resolver; nonzero for confirmed failures.

- [ ] **Step 1: Add a reusable endpoint check**

Implement `check_endpoints` so the same three endpoint assertions can run normally or with curl `--resolve` arguments.

- [ ] **Step 2: Add guarded fallback resolution**

Capture the first root request status. For status 6 or 28, query both resolvers in order and validate the first IPv4 answer with Python's `ipaddress.ip_address`. Do not invoke fallback for other statuses.

- [ ] **Step 3: Verify the resolved endpoint path**

For each valid address, run all endpoint checks with `--resolve "$PUBLIC_HOST:443:$ip"`. Return success after the first complete pass; otherwise preserve failure.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @club/api exec vitest run src/deploy/externalMonitoring.test.ts`

Expected: PASS for all four behavioral scenarios and static workflow assertions.

### Task 3: Verification and delivery

**Files:**
- Verify: `.github/workflows/external-uptime.yml`
- Verify: all changed files

**Interfaces:**
- Consumes: the completed checker and tests.
- Produces: a pushed commit and a successful manual GitHub Actions run.

- [ ] **Step 1: Run shell syntax validation**

Run: `bash -n scripts/check-public-uptime.sh scripts/check-public-uptime.test.sh`

Expected: exit 0 with no output.

- [ ] **Step 2: Run the live checker**

Run: `bash scripts/check-public-uptime.sh`

Expected: exit 0 against production.

- [ ] **Step 3: Run API test suite and type check**

Run: `pnpm --filter @club/api test && pnpm --filter @club/api check`

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 4: Review and commit**

Inspect `git diff --check`, `git diff`, and `git status --short`. Commit only the design, plan, checker, and regression-test changes.

- [ ] **Step 5: Push and validate GitHub Actions**

Push `main`, dispatch `External uptime`, wait for completion, and inspect its logs. Expected: success; the open monitor incident is closed automatically.
