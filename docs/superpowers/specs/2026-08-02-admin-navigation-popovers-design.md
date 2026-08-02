# Admin Navigation Popovers Design

## Goal

Make the compact admin navigation feel native to the page by replacing both modal bottom sheets with anchored overlay menus. The menus must not dim the screen, move analytics content, or change any permissions and business behavior.

## Preview mode control

- Remove the full-width `Режим: <mode>` row from the admin header.
- Extend the existing version badge into one compact metadata group in the header's right side.
- Keep the version and update timestamp readable and add a small owner-only button with an eye icon, the current short mode label, and a down chevron, for example `Разраб ▾`.
- Give the button the accessible name `Режим просмотра: <current mode>` so its purpose remains clear at compact widths.
- Clicking the button opens an anchored popover immediately below the metadata group.
- The popover contains all four preview modes as rows. The current mode is highlighted and marked with a check.
- Selecting a mode applies the existing preview-mode behavior and closes the popover.

## Secondary admin navigation

- Keep the four equal quick-navigation buttons: `Аналитика`, `Клиенты`, `Платежи`, and `Ещё`.
- Replace the `Все разделы` bottom sheet with a compact popover anchored below the `Ещё` button and aligned to the right edge of the quick-navigation bar.
- Render permitted secondary panels in the existing two-column compact grid. When an odd final item remains, it spans both columns.
- Selecting a panel uses the existing `selectAdminPanel` behavior and closes the popover.
- When a secondary panel is selected, `Ещё` keeps its active appearance and the active item inside the popover is marked.

## Interaction and accessibility

- Popovers overlay the page without a backdrop and do not affect document flow.
- Only one popover can be open at a time.
- Repeating the trigger click toggles its popover.
- Clicking outside, pressing `Escape`, selecting an item, changing route, or leaving the admin screen closes the open popover.
- Triggers use `aria-haspopup="menu"` and `aria-expanded`; popovers use menu semantics and keep 44 px minimum touch targets.
- Popovers stay within the viewport at 320, 390, 768, 1024, and 1440 px. They render above analytics cards and below global task screens and bottom navigation where applicable.
- Focus remains predictable: keyboard focus enters selectable menu items, and closing returns focus to the trigger when appropriate.

## Components and state

- Remove `BottomSheet` usage from `AdminSection.vue` for these two menus only. Other application bottom sheets are unchanged.
- Replace `showPreviewModeSheet` and `showAdminNavigationSheet` with popover state and element refs needed for outside-click and focus handling.
- Reuse the current preview options, permission-filtered `secondaryPanels`, active-panel logic, and mode/panel selection handlers.
- Keep the feature local to the admin shell; no routes, API contracts, stores, or permission rules change.

## Verification

- Structural tests assert that both `BottomSheet` instances are gone, the mode control is inside the version metadata group, and both anchored menus have the required accessibility state.
- Interaction E2E verifies toggle behavior, outside-click and `Escape` dismissal, preview selection, secondary navigation, active states, and mutual exclusion.
- Visual screenshots cover closed and open menus at 320, 390, 768, 1024, and 1440 px in the existing themes.
- Full workspace tests, type checks, production build, release E2E, deployment preflight, and post-deployment commit/health/version/service-worker checks remain required.
