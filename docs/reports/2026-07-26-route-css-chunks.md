# Route CSS chunking report

Date: 2026-07-26

## Outcome

The application no longer downloads every section stylesheet during startup. Profile, learning, support, billing, admin, notifications, and community styles are emitted with their lazy route chunks. Selectors shared by multiple sections remain in the always-loaded stylesheet.

## Entry payload

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Entry CSS, raw | 524,643 B | 224,868 B | -57.1% |
| Entry CSS, gzip | 75,313 B | 37,067 B | -50.8% |
| Entry JS, gzip | 97,413 B | 97,475 B | +0.1% |
| Combined entry, gzip | 172,726 B | 134,542 B | -22.1% |

New production budgets prevent regressions above 105 KB gzip for entry JavaScript, 55 KB for entry CSS, and 155 KB combined. The build also fails if a route-only stylesheet is linked from `index.html`.

## Correctness controls

- CSS extraction is selector-aware: a rule moves only when every top-level selector belongs to the same route.
- Commas inside functional selectors and nested at-rules are preserved.
- Shared learning/admin mockup primitives stay global; module-scoped mockup rules load with learning.
- The service-worker cache was advanced to `club-pwa-v234` so installed clients receive the new asset graph.
- Source-level style tests read the relevant route styles instead of assuming one monolithic file.

## Verification

- Monorepo unit/integration tests: passed; web has 763 passing tests.
- Type checks: passed for shared, API, and web packages.
- Production build and bundle budgets: passed.
- Release Playwright matrix: 13 passed, 2 intentionally skipped.
- Device Playwright matrix across phones, tablets, landscape, Android WebView-like widths, and iOS WebKit: 58 passed, 26 platform-inapplicable checks skipped.
- Local Lighthouse was not rerun because the npm registry connection reset while fetching its CLI. The last comparable baseline score was 91; payload measurements above come directly from the production build and are enforced in CI.
