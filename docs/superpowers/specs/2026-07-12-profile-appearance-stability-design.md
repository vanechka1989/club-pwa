# Profile Appearance Stability Design

## Goal

Make the profile appearance controls visually aligned and safe to use during mobile scrolling, while moving every current installation to the Warm Clay light appearance exactly once.

## Current Findings

- `ProfileSection.vue` gives each design-theme row both `design-theme-choice` and `ui-button`.
- `foundation.css` loads after `styles.css`, so the later `.ui-button { display: inline-flex; justify-content: center; }` overrides the row's grid layout. The icon, copy, and check therefore move according to each label's width.
- The visual-scale control is a native range input wired to `@input`. On a touch device, touching or crossing the track during a vertical swipe immediately changes and persists the scale.
- `club-appearance-version` is written but is not currently used as a migration gate, so changing the version alone would not reset existing saved choices.

## Approved Behavior

### Theme-row alignment

- Keep every theme option as a semantic `<button>` with `aria-pressed`.
- Remove the generic `ui-button` class from design-theme rows so the component-specific grid is not replaced by the global flex rule.
- Give every row the same three columns: fixed preview, flexible left-aligned copy, fixed selection circle.
- Preserve the existing theme colors, labels, selected state, focus ring, 44 px minimum touch target, and one-column mobile layout.
- Verify at 320, 390, 768, 1024, and 1440 px with no clipping or horizontal overflow.

### One-time Warm Clay light migration

- Increment `club-appearance-version` from `6` to `7`.
- If the stored version is missing or is not `7`, initialize both new and existing clients with:
  - `theme = "light"`;
  - `designTheme = "warm-clay"`.
- Persist version `7` immediately after applying the migration.
- If version `7` is already stored, restore the user's valid saved light/dark mode and design theme normally.
- After migration, manual changes continue to persist and must not be reset on future launches with version `7`.
- A corrupted or unknown version-7 theme falls back to Warm Clay light.

### Touch-safe visual scale

- Keep the current numeric scale range and the explicit minus/plus buttons.
- On coarse touch pointers, the range track does not accept pointer input and allows the page's vertical scroll gesture to win.
- On coarse touch devices, scale changes are therefore explicit through the minus/plus buttons; their existing accessible names and disabled boundary states remain.
- On mouse/trackpad devices, the native range remains draggable.
- Keyboard operation of the native range remains available because only pointer interaction is disabled.
- Do not add a confirmation modal, lock toggle, or explanatory text.

## Testing

- Store tests prove the version-6-to-7 reset, the version-7 restore path, the new-client default, corrupted-value fallback, and persistence after manual changes.
- Source/design-system tests prove design-theme rows keep the dedicated grid and no longer carry the conflicting generic class.
- Browser tests on mobile prove the range has no pointer interaction, vertical swiping over it does not change the stored value, and minus/plus still change one step.
- Desktop browser coverage proves the range remains interactive.
- Run the full web unit suite, typecheck, production build, and mobile/desktop visual checks.

## Out of Scope

- Removing any of the five design themes.
- Changing the Warm Clay palette itself.
- Changing scale limits or step size.
- Deploying to production without a separate explicit request.
