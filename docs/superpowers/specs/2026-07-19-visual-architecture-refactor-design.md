# Visual Architecture Refactor Design

## Goal

Reduce recurring visual regressions by making the existing UI foundation the single source of truth for page headers, typography roles, spacing, and compact metadata across the mobile PWA.

## Problem

The project already contains shared UI primitives, but the main product sections still duplicate page-header markup and use local hard-coded font sizes. Because `styles.css`, `foundation.css`, feature styles, and scoped component styles overlap, later fixes often require `!important` and can produce different results between pages, themes, interface scales, iOS, and Android.

The largest risk is not a missing feature. It is the lack of an enforced visual contract:

- six main sections build their own version of the same header;
- body, label, metadata, and microcopy sizes are repeated as raw pixels;
- CSS overrides can silently bypass the interface-scale variables;
- there is no automated budget preventing new duplicate headers or a rise in high-specificity rules.

## Approved approach

Use the existing `features/ui` layer instead of introducing another design system.

1. Add semantic typography tokens to `foundation.css` and map legacy selectors to them.
2. Make `UiPageHeader` the required page-header component for Profile, Learning, Community, Payments, Support, and Admin.
3. Replace the most visible hard-coded small text in global/community styles with semantic tokens.
4. Remove unnecessary `!important` declarations from feature styles where source order and selector specificity already provide the intended result.
5. Add source-level architecture tests that fail if duplicated main-page headers return or CSS debt exceeds the new baseline.

## Typography model

The hierarchy uses roles rather than page-specific numbers:

- page title and subtitle;
- section title;
- card title;
- body;
- label;
- metadata;
- microcopy.

All roles inherit the application's interface scale. Page headings remain visually stronger, but body text cannot collapse independently on smaller scale settings.

## Compatibility

- Preserve all existing themes and theme variables.
- Preserve current page behavior and permissions; this refactor changes presentation contracts only.
- Preserve mobile touch targets and safe-area handling.
- Keep legacy bridge selectors temporarily so secondary screens can be migrated without a large-bang rewrite.

## Verification

- source tests for shared header adoption and token presence;
- CSS debt budgets for the touched global and community stylesheets;
- existing header consistency and design-system tests;
- TypeScript check, unit tests, and production build.
