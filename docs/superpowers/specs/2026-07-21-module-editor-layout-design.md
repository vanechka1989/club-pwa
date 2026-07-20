# Full-screen module editor layout

## Problem

The shared routed header fixed header consistency, but the create/edit module workflow still renders its legacy modal shell inside `TaskScreen`. The scrollable task body therefore contains both the form and modal action panel. On mobile the reduced available height exposes the inner scrollbar and makes the actions look like a nested card.

## Design

- Keep one `TaskScreen` for both “Новый модуль” and “Редактировать модуль”.
- Render only the module form in the task body. It remains the single scrollable content region.
- Render delete/close/save controls through the existing `TaskScreen` footer slot.
- Keep delete available only while editing. Keep all existing handlers, disabled states, confirmation, save reconciliation, and copy unchanged.
- Give the footer a dedicated module-editor class so its one-button create state and three-action edit state can be responsive without changing other task screens.
- Remove the remaining modal card semantics from the module form section (`role="dialog"`, `aria-modal`, and legacy action container).

## Responsive contract

- Header, body, and footer use the shared safe-area gutters.
- At narrow phone widths, edit secondary actions share one row and save spans the full row; create shows close plus full-width save without clipping.
- The body may scroll when the keyboard or a short viewport requires it, but no persistent scrollbar should overlay fields when the form fits.
- Tap targets remain at least 44 × 44 CSS pixels and no horizontal overflow is allowed from 320 px upward.

## Verification

- Component regression tests cover create and edit states, including footer placement and conditional delete.
- CSS regression tests cover responsive footer geometry and the absence of the legacy nested action block.
- Visual checks cover 320 × 720, 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900.
- Run the full test suite and production build before deployment.
