# Route CSS Chunks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move unambiguously route-owned CSS out of the initial stylesheet and load it with existing lazy Vue sections.

**Architecture:** A tested PostCSS utility classifies complete selector lists, preserves nested at-rules and emits one global stylesheet plus route-owned stylesheets. Vue route components import their emitted stylesheet, while mixed selectors and shared design-system rules remain global.

**Tech Stack:** Vue 3, Vite 6, PostCSS 8, postcss-selector-parser, Vitest, Playwright.

## Global Constraints

- Preserve current UI, business logic, themes and API contracts.
- Move a rule only when every selector belongs to exactly one route category.
- Keep entry JavaScript gzip at or below 105,000 bytes.
- Keep entry CSS gzip at or below 55,000 bytes.
- Keep combined entry gzip at or below 155,000 bytes.
- Verify 320, 390, 768, 1024 and 1440 pixel layouts, Android and iOS WebKit.

---

### Task 1: Route CSS splitter

**Files:**
- Create: `apps/web/scripts/routeCssSplitter.mjs`
- Create: `apps/web/scripts/routeCssSplitter.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `splitRouteCss(source: string, categories: RouteCategory[]): { globalCss: string; routeCss: Record<string, string>; counts: Record<string, number> }`.
- A category contains `name` and an array of class-prefix regular expressions.

- [ ] **Step 1: Write failing fixture tests**

Test literal fixtures proving that a profile-only rule moves, a mixed `.profile-card, .surface-card` rule stays global, `:is(.profile-a, .profile-b)` is parsed as one selector, and nested `@media` containers remain around extracted rules.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/web exec vitest run scripts/routeCssSplitter.test.ts`

Expected: FAIL because `routeCssSplitter.mjs` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Use PostCSS for the CSS tree and `postcss-selector-parser` for class nodes. Classify each selector independently, require the same single category for the complete selector list, clone ancestor at-rules into the destination tree, remove moved rules from the global clone and prune empty containers.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @club/web exec vitest run scripts/routeCssSplitter.test.ts`

Expected: all splitter tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts apps/web/package.json pnpm-lock.yaml
git commit -m "test: add safe route CSS splitter"
```

### Task 2: Partition current stylesheet and connect lazy owners

**Files:**
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/src/features/profile/profileRoute.css`
- Create: `apps/web/src/features/learning/learningRoute.css`
- Create: `apps/web/src/features/support/supportRoute.css`
- Create: `apps/web/src/features/billing/billingRoute.css`
- Create: `apps/web/src/features/admin/adminRoute.css`
- Create: `apps/web/src/features/app/notificationRoute.css`
- Create: `apps/web/src/features/community/communityRoute.css`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/NotificationCenterScreen.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Create: `apps/web/src/features/app/routeCssOwnership.test.ts`

**Interfaces:**
- Each lazy section imports exactly its route CSS file.
- `styles.css` retains imports, global rules, mixed selectors and shared at-rules.

- [ ] **Step 1: Write the failing ownership/build behavior test**

The test runs the splitter against `styles.css`, asserts that each target route has extractable rules before migration, and asserts each lazy component imports its owned CSS file. It must fail before the imports and files exist.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/web exec vitest run src/features/app/routeCssOwnership.test.ts`

Expected: FAIL on missing route CSS ownership.

- [ ] **Step 3: Run one-time partitioning and add imports**

Invoke the splitter from a small CLI entry using the declared category map. Write the seven route files, replace `styles.css` with `globalCss`, and import files from `ProfileSection.vue`, `LearningSection.vue`, `SupportSection.vue`, `PaymentsSection.vue`, `AdminSection.vue`, `NotificationCenterScreen.vue` and `CommunitySection.vue`.

- [ ] **Step 4: Verify GREEN and production chunk ownership**

Run: `pnpm --filter @club/web exec vitest run scripts/routeCssSplitter.test.ts src/features/app/routeCssOwnership.test.ts && pnpm --filter @club/web build`

Expected: tests and build pass; route CSS files are emitted as lazy chunks and absent from `dist/index.html`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/scripts
git commit -m "perf: load section CSS with lazy routes"
```

### Task 3: Tighten budgets and verify visual equivalence

**Files:**
- Modify: `apps/web/scripts/bundleBudget.mjs`
- Modify: `apps/web/scripts/bundleBudget.test.ts`
- Modify: `apps/web/public/sw.js`
- Create: `docs/reports/2026-07-26-route-css-chunks.md`

**Interfaces:**
- `assertEntryCssExcludes(distDirectory, forbiddenAssetPrefixes)` rejects route stylesheet links in the production HTML.

- [ ] **Step 1: Write failing bundle ownership and tighter-budget tests**

Add a fixture containing a route stylesheet link and assert rejection. Update the executable limits to 55,000 CSS gzip and 155,000 combined gzip.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/web exec vitest run scripts/bundleBudget.test.ts`

Expected: FAIL because `assertEntryCssExcludes` is missing.

- [ ] **Step 3: Implement CSS exclusion and bump the service-worker cache version**

Inspect entry stylesheet filenames and reject configured lazy-only prefixes. Bump the cache from `club-pwa-v233` to `club-pwa-v234` and update its regression expectation.

- [ ] **Step 4: Run complete verification**

Run: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`, `pnpm test:e2e:devices`, and Lighthouse against a production preview. Inspect screenshots/overflow at the required viewport matrix.

- [ ] **Step 5: Document and commit measured results**

Record entry raw/gzip sizes, Lighthouse metrics, test results and remaining CSS debt in the report, then commit all Task 3 files.
