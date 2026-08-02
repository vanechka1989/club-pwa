# Compact Admin Navigation Design

## Goal

Reduce the vertical space used by admin navigation while keeping the current preview mode and every permitted admin section easy to find.

## Header and preview mode

- Remove the four-button preview switcher from the header.
- Keep one compact owner-only button labeled `Режим: <current mode>` beside the version badge.
- The button opens the existing accessible `BottomSheet` component with all four preview modes.
- The selected mode is marked, choosing a mode applies it immediately, and the sheet closes.

## Section navigation

- Replace the eight-tile grid with a compact quick-navigation row.
- Show Analytics, Clients, and Payments directly when the current administrator has access.
- Show an `Ещё` button when at least one other permitted panel exists.
- `Ещё` opens a bottom sheet containing Mailings, Storage, Project settings, Admins, and Server, filtered through the existing permission-aware `panels` computed value.
- When a secondary panel is active, the `Ещё` button receives the active treatment.
- Selecting any item closes the sheet and uses the existing `selectAdminPanel` behavior.

## Responsive and accessibility behavior

- Quick navigation uses equal-width buttons and remains one row from 320 px upward.
- Every trigger has an accessible name and `aria-haspopup="dialog"`; sheets keep the existing modal semantics and backdrop dismissal.
- The current selection remains visible through active styling and `aria-current="page"`.
- No business logic, permissions, routes, or data contracts change.

## Verification

- Structural tests cover the compact mode trigger, removal of the inline switcher, primary panel IDs, permission-filtered secondary panels, and both bottom sheets.
- E2E covers opening and selecting preview modes, opening `Ещё`, navigating to a secondary section, active state, and absence of horizontal overflow.
- Visual screenshots cover 320, 390, 768, 1024, and 1440 px plus dark theme.

