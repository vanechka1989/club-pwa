# Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove proven code and dependency waste, simplify CSS ownership, and reduce the production API artifact without changing application behavior.

**Architecture:** Compiler checks drive dead-code removal; tested source transforms own route CSS movement; production deployment uses a pruned pnpm deploy tree. Existing public interfaces remain stable.

**Tech Stack:** Vue 3, TypeScript, Vite, PostCSS, Vitest, Playwright, pnpm workspaces, Bun, Docker.

## Global Constraints

- Do not perform a real payment.
- Preserve API/database/business behavior and all four themes.
- Verify 320 px mobile through desktop release projects before deployment.
- Release as 5.68 with service-worker cache v240.

---

### Task 1: Strict unused-code gate and legacy admin removal

**Files:**
- Modify: `tsconfig.base.json`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: reported API/test files from compiler output

**Interfaces:**
- Consumes: current `pnpm check` workspace contract.
- Produces: workspace checks that reject unused locals and parameters.

- [ ] Run web and API compilers with `--noUnusedLocals --noUnusedParameters`; save the failing symbol list as the red diagnostic.
- [ ] Remove three `v-else-if="false"` admin blocks and their now-orphaned code.
- [ ] Remove remaining compiler-reported unused symbols without changing live interfaces.
- [ ] Add `noUnusedLocals` and `noUnusedParameters` to the base compiler options.
- [ ] Run `pnpm check` and focused admin/profile tests until green.
- [ ] Commit `refactor: remove legacy and unused application code`.

### Task 2: Production dependencies and Docker runtime

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/Dockerfile`
- Test: existing `apps/api/src/deploy/*.test.ts`

**Interfaces:**
- Consumes: `@club/api` package and `@club/shared` workspace export.
- Produces: `/prod/api` deploy tree whose entrypoint is `src/index.ts`.

- [ ] Prove `@aws-sdk/lib-storage` has no source consumer and capture current Docker/node_modules sizes.
- [ ] Remove the unused AWS package and move `pino-pretty` to devDependencies.
- [ ] Test `pnpm --filter @club/api deploy --prod <temporary-directory>` and run a Bun import smoke test against that tree.
- [ ] Change the Docker dependency stage to create the production deploy tree and copy only it into runtime.
- [ ] Build the API image and run its existing checks; compare image/runtime dependency sizes.
- [ ] Commit `build: prune api production runtime`.

### Task 3: Route CSS ownership and support cascade

**Files:**
- Modify: `apps/web/scripts/routeCssSplitter.mjs`
- Modify: `apps/web/scripts/routeCssOwnership.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: route CSS files under `apps/web/src/features/**`
- Modify: `apps/web/src/features/support/supportRoute.css`

**Interfaces:**
- Consumes: `splitRouteCss(source, categories)`.
- Produces: the same return shape with mixed comma-selector rules split by category while unmatched selectors remain global.

- [ ] Add a failing splitter test containing global, single-route, and mixed comma selectors; assert exact ownership and declarations.
- [ ] Implement selector-list partitioning and verify the test turns green.
- [ ] Run `pnpm --filter @club/web css:split-route` and measure eager CSS before/after.
- [ ] Remove the superseded support ticket/list override block and the duplicated final compensation block, retaining one authoritative overview/card definition.
- [ ] Run support/design unit tests and release device tests; compare computed geometry/screenshots.
- [ ] Commit `refactor: consolidate route css ownership`.

### Task 4: Release history boundary

**Files:**
- Create: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: `historicalReleaseNotes: ReleaseNote[]`.
- Preserves: `releaseNotes`, `getReleaseNoteByVersion`, `getLocalizedReleaseNotes`.

- [ ] Add a failing test importing the history module and checking contiguous descending versions beneath the current release.
- [ ] Move historical data into `releaseHistory.ts` and keep localization/lookup composition in `releaseNotes.ts`.
- [ ] Run release-note tests and build; confirm the admin release history remains lazy.
- [ ] Commit `refactor: separate release history data`.

### Task 5: Release and verification

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: release/PWA tests
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: version `5.68`, cache `club-pwa-v240`.

- [ ] Update release tests first and verify they fail on 5.67/v239.
- [ ] Add the 5.68 release entry, preserve 5.67 in history, and bump service-worker cache to v240.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`, and Docker smoke verification.
- [ ] Merge to `main`, rerun the full test suite, push, and watch deploy/device workflows.
- [ ] Verify production HTTP, health, service worker, exact commit, and containers; then remove the owned worktree.

## Plan self-review

All design requirements map to a task. Public interfaces and version values are consistent, no placeholder steps remain, and broad live-route decomposition is deliberately excluded because it would add risk without measurable runtime benefit in this cleanup release.
