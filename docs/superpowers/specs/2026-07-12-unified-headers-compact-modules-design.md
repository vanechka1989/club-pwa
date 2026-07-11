# Unified Headers and Compact Modules Design

## Goal

Make every primary section header use the same geometry and redesign the modules list as compact, readable mobile-first rows without changing module or lesson behavior.

## Header system

- Primary `.section-head.ui-page-header` surfaces use 16px padding, a 12px internal gap, the shared card radius, and content-driven height.
- Every primary section uses `section-title` and `section-subtitle` typography.
- The gap from a primary header to the first section element is 12px.
- Nested administrative panel headers remain separate because they describe subsections rather than routes.

## Modules

- A collapsed member module is a compact two-column row: title and metadata on the left, lesson count and a 44px chevron control on the right.
- Cards have content-driven height and no empty vertical filler.
- Administrator sorting, editing, and lesson creation controls move to a separate full-width action row inside the same module card on narrow screens.
- Expanded lesson content and the existing continue-learning card keep their behavior and data flow.
- The layout uses existing theme variables and works in all four theme combinations.

## Verification

- Source-level regression tests cover shared header geometry and compact module structure.
- Run focused learning/header tests, typecheck, and production build.
- Verify the deployed PWA version and service-worker cache revision.
