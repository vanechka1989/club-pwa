# Profile subpages layout design

## Goal

Make the referral and appearance screens feel like native parts of the profile: they remain full-screen routes, while their header and content share the same horizontal inset and rounded visual language as the main profile screen.

## Layout

- Keep `TaskScreen` as the full-screen route shell so back navigation, safe areas, scrolling, and focus behavior remain unchanged.
- Add one shared profile-detail class to the referral and appearance task screens.
- On mobile, inset both the task header and task body by the same 14 px used by the profile header. The header receives the same 18 px radius; the body itself has no second outer gutter.
- Keep the existing referral and appearance cards, but let them occupy the full available content width. This avoids nested cards while preserving the established profile card language.
- On tablet and desktop, retain the existing centered page rail and cap profile-detail content at the profile dashboard width.

## Referral content

- Preserve all referral API behavior, counters, activation rules, and copy action.
- Keep the three statistics in one row where they fit and allow their labels to wrap instead of clipping.
- Let the referral URL wrap safely on narrow screens instead of hiding meaningful text behind an ellipsis.
- Keep every interactive control at least 44 px high.

## Verification

- Add source-level layout regression tests for the shared task-screen class, equal header/body insets, full-width cards, safe URL wrapping, and 44 px controls.
- Verify the referral and appearance layouts at 320×720, 390×844, 768×1024, 1024×768, and 1440×900 with no horizontal overflow.
- Run the full automated test suite and production build before deployment.
