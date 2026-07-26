# Codebase Cleanup Design

## Goal

Reduce maintenance cost, remove proven dead code and dependencies, shrink production-only artifacts, and simplify the CSS cascade without changing user-visible behavior or payment/business logic.

## Scope

- Remove inactive legacy admin templates already replaced by async panels and remove their orphaned state, handlers, imports, and helpers.
- Remove every TypeScript/Vue symbol reported by `noUnusedLocals` and `noUnusedParameters`, then enable both checks for all workspaces.
- Remove the unused `@aws-sdk/lib-storage` dependency, keep `pino-pretty` development-only, and build the API runtime from production dependencies only.
- Improve route CSS extraction for comma-separated selectors, move eligible route rules out of eager global CSS, and collapse the duplicated support overview layer into one authoritative block.
- Separate release-history data from release-note localization/lookup code while preserving the public API and admin-only lazy loading.
- Publish version 5.68 with service-worker cache v240.

## Constraints

- No actual payment is performed.
- No API contract, database schema, authentication rule, permission rule, or visible UI copy changes except release notes.
- Existing four themes and compact mobile shell remain visually identical.
- CSS changes require Android Chrome, iOS WebKit, and desktop Chromium regression checks.
- Deployment occurs only after checks, unit tests, build, release E2E, CI, and production health verification pass.

## Architecture

The cleanup proceeds from mechanically provable changes to progressively broader ones. Compiler diagnostics protect dead-code removal. Existing component and device tests protect UI behavior. Route CSS extraction remains build-time source organization: components keep importing their route bundles, while genuinely global/shared rules stay eager.

The API image uses pnpm's deploy output as the runtime application root. This preserves the Bun TypeScript entrypoint and workspace package resolution while excluding development-only dependencies.

Release history moves to a data-only module. `releaseNotes.ts` continues to expose `releaseNotes`, `getReleaseNoteByVersion`, and `getLocalizedReleaseNotes`, so consumers do not change.

## Failure Handling

- If strict unused checks identify a template binding still needed by live markup, retain it and document the consumer.
- If route CSS extraction changes computed styles or screenshots, revert that selector group to global ownership rather than adding another override.
- If `pnpm deploy --prod` cannot preserve workspace resolution, keep the current Docker layout and only prune validated unused dependencies.
- Any repeated verification failure stops deployment and is diagnosed before further edits.

## Verification

- Strict TypeScript/Vue checks with unused-symbol flags.
- Full `pnpm check`, `pnpm test`, and `pnpm build`.
- CSS splitter unit tests plus before/after bundle measurements.
- Release Playwright suite across Chromium desktop, Pixel/Chrome, and iPhone/WebKit.
- Docker image build and container smoke test when Docker is available.
- GitHub deploy and device workflows, production HTTP 200, `/api/health`, v240 service worker, exact deployed commit, and healthy containers.

## Self-review

The design contains no placeholders. It intentionally avoids database/API behavior changes and treats broad route decomposition as a later project: the current pass reduces the largest frontend monolith through removal of already-replaced code rather than moving live logic without product benefit.
