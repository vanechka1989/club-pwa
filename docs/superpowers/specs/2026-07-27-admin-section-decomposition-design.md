# AdminSection Decomposition Design

## Goal

Reduce the 4,369-line `AdminSection.vue` into a navigation/data shell plus focused lazy panels, preserving all administrator routes, permissions, operations, strings, and mobile layouts.

## Scope

This release extracts the four largest remaining views:

- `AdminStoragePanel.vue`;
- `AdminMailingsPanel.vue`;
- `AdminPermissionsPanel.vue`;
- `AdminClientsPanel.vue`.

`AdminSection.vue` remains the owner of session state, shared loading, permission changes, route synchronization, and cross-panel datasets. This avoids duplicating orchestration while making the large templates independently maintainable and allowing non-default panels to become separate async chunks.

## Component contracts

Each panel receives typed, presentation-ready props and emits intent events. It does not call the router or mutate parent-owned arrays directly. Existing API operations initially remain in the shell and are invoked by event handlers, which preserves their ordering, confirmation dialogs, loading flags, and error handling.

Storage, mailings, and permissions panels are loaded with `defineAsyncComponent`. The clients panel is also isolated, but its loading strategy may remain eager if it is the default visible admin surface and splitting would add an extra request to every admin entry.

Route task screens stay inside the corresponding panel, while `AdminSection.vue` continues to parse routes and selects the active task. `back` events always return through the existing shell route helpers. Permission loss closes a forbidden task exactly as before.

## Test migration

Legacy source-level tests that search the entire `AdminSection.vue` are redirected to the component that owns the markup. Boundary tests assert that the shell imports/renders each panel and wires required props/events. Existing behavior tests remain authoritative for API calls, permission gates, task closing, and responsive geometry.

No style redesign is included. Existing class names and admin route styles are preserved, so all themes and 320 px mobile layouts retain the current visual contract.

## Success criteria

- `AdminSection.vue` is materially smaller and no longer owns the four large templates.
- Storage, mailings, permissions, and clients behavior remains unchanged.
- Non-default heavy panels emit independent production chunks where useful.
- Web checks, tests, build, and Android/iOS/desktop release tests pass.
