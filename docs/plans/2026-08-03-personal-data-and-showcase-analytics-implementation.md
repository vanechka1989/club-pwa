# Protected Client Data and Showcase Analytics Implementation Plan

**Goal:** Ship owner-controlled client PII access, verified payment phone capture, and a reversible presentation mode for club analytics.

**Architecture:** The API owns PII authorization and emits explicit restricted contact payloads. Verified payment handlers normalize and persist phone provenance. The web app owns a seeded, local-only showcase snapshot used by all club analytics views without writing synthetic rows to the server.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Vue 3, Pinia/localStorage, Vitest, Playwright, pnpm, Docker Compose.

---

### Task 1: Permission and protected contact contract

**Files:** `packages/shared/src/index.ts`, shared permission tests, `apps/api/src/admin/personalData.ts` and tests.

- Write failing tests for the new permission and for permitted/restricted contact serialization.
- Add `personal_data`, phone/provenance fields, and `personalDataRestricted` to validated admin contracts.
- Implement a pure policy/serialization helper that never returns raw PII in the restricted branch.

### Task 2: Persist verified payment phone data

**Files:** `apps/api/src/db/schema.ts`, `apps/api/drizzle/0069_client_phone.sql`, payment provider event types/parsers/processors and tests.

- Write failing normalization and extraction tests covering Prodamus, Lava, empty values, separators, invalid values, and non-overwrite behavior.
- Add nullable phone, source, and update timestamp columns.
- Capture contact data only after authenticated, accepted payment callbacks and keep raw values out of new logs.

### Task 3: Enforce PII restrictions across admin APIs

**Files:** admin routes/builders, learning engagement service/route, related tests.

- Write failing tests for owner/permitted/restricted response behavior and protected search boundaries.
- Resolve the permission once per request and sanitize stats lists, client detail, learning user drilldowns, and every other admin response that exposes client email/phone.
- Ensure restricted payloads contain the lock state but no recoverable contact value.

### Task 4: Render contact access states on mobile

**Files:** `AdminClientsPanel.vue`, `AdminSection.vue`, client-list helpers, admin styles and component tests.

- Write failing UI tests for visible contact values, locked placeholders, and the new permission toggle.
- Add the `Контактные данные` block, copy actions for authorized users, and a 44 px locked state for restricted users.
- Remove contact-field search behavior when the API marks data restricted.

### Task 5: Build deterministic showcase analytics

**Files:** `apps/web/src/features/admin/showcaseAnalytics.ts` and tests.

- Write failing deterministic generator tests: same seed is stable, a new seed changes the snapshot, and every total equals its breakdown.
- Generate fictional clients, payments, finance, acquisition, learning, community, and poll metrics for the selected range.
- Keep the generator pure and ensure no real contact fields are copied into synthetic data.

### Task 6: Connect showcase mode to every club analytics screen

**Files:** `AdminSection.vue`, `AdminAcquisitionAnalytics.vue`, `AdminLearningEngagement.vue`, styles and tests.

- Write failing interaction tests for enable, regenerate, persist, and disable/restore-real behavior.
- Add the local device setting, `Демо` marker, and `Сгенерировать заново` action.
- Feed the same seed into overview, drilldowns, finance, acquisition, and learning views while keeping mailing-record analytics real.

### Task 7: Release verification and deployment

**Files:** release/version metadata, service worker, tests, deployment history.

- Update version and cache expectations test-first.
- Run focused tests after each red/green cycle, then full `pnpm check`, `pnpm test`, and `pnpm build`.
- Run the mobile visual audit at 320, 390, 768, 1024, and 1440 px and confirm no overflow or inaccessible controls.
- Commit and push the exact tested revision, run the production preflight/deploy workflow for `club2.myn8nservertest.ru`, and verify server commit, health, readiness, version, service worker, and feature markers.
