# Application load performance report

Date: 2026-07-26

## Result

The initial application payload was reduced without changing user-facing behavior. The production build now enforces an automated entry-bundle budget so regressions fail the build.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Entry JavaScript, raw | 395,845 B | 290,693 B | -26.6% |
| Entry JavaScript, gzip | 122,815 B | 97,413 B | -20.6% |
| Entry CSS, raw | 553,182 B | 524,643 B | -5.2% |
| Entry CSS, gzip | 79,886 B | 75,313 B | -5.7% |
| Combined entry payload, gzip | 202,701 B | 172,726 B | -14.8% |

The community stylesheet is now loaded with the community screen (5,340 B gzip), and the notification center is emitted as a separate lazy chunk (2,030 B gzip). Startup API calls no longer import the complete application API surface or the Zod-backed shared runtime.

## Lighthouse comparison

Measurements were taken against the local production preview with Lighthouse mobile throttling.

| Metric | Before | After |
| --- | ---: | ---: |
| Performance score | 89 | 91 |
| First Contentful Paint | 2,334 ms | 2,183 ms |
| Largest Contentful Paint | 2,561 ms | 2,259 ms |
| Total Blocking Time | 0 ms | 0 ms |
| Cumulative Layout Shift | 0.141 | 0.141 |
| Total transfer | 209,280 B | 179,281 B |
| Unused JavaScript opportunity | 92,308 B | 58,882 B |

## Verification

- Workspace type checks passed.
- All unit and component tests passed.
- Production build and the new bundle budgets passed.
- Release browser suite passed: 13 passed, 2 platform-specific skips.
- Device viewport suite passed: 58 passed, 26 intentional platform-specific skips, including 320 px phones, 390 px phones, tablets, landscape layouts, Android and iOS WebKit.

## Remaining opportunity

The main stylesheet is still large at 524,643 raw bytes. Further gains require extracting more screen-specific legacy CSS. This is lower risk when done incrementally with the existing multi-device viewport suite guarding layout behavior.
