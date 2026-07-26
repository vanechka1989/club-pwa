# Compact Detail Screens and Support List Design

## Goal

Make secondary profile screens use the full available mobile workspace, keep module visibility controls permanently reachable, and replace oversized support request cards with a compact row list.

## Scope

- Profile detail screens opened from the profile dashboard:
  - referral system;
  - appearance settings.
- Module create/edit routed task screen.
- Administrative support overview and its customer request list.
- Mobile widths from 320 px and scaled Android/PWA layouts.

Business logic, API contracts, referral calculations, module saving, ticket ordering, ticket statuses, and payment behavior remain unchanged.

## Profile detail screens

`TaskScreen` remains the single page header and route layer. Referral and appearance content must not repeat the page title inside another large card.

The referral screen uses one full-width detail surface containing:

- a compact reward summary;
- the referral link and copy action;
- three statistic cells;
- the existing activation action and status explanation.

The appearance screen uses the same full-width detail surface. Its mode, design theme, scale, and navigation controls remain separate semantic groups, but the screen does not wrap all groups in an additional `soft-card`.

## Module editor

The editor remains a full-screen routed task with a scrollable body and sticky footer. The publication checkbox is removed from the scrolling form.

The footer contains a dedicated visibility button:

- when the draft is published, the button says `Скрыть модуль`;
- when it is hidden, the button says `Опубликовать модуль`;
- `aria-pressed` exposes the resulting publication state;
- activating it changes the local draft only; `Сохранить модуль` persists the state through the existing save flow.

The footer is compact enough to remain visible at 320 px. Opening create or edit starts the task body at its top so a previous scroll position cannot hide the first field.

## Administrative support

The statistics remain above the request list. `Запросы клиентов` becomes a section heading, not the title of a large nested card.

Every request is a separate full-width row with:

- customer name;
- identifier and topic;
- waiting/closure text;
- status chip aligned to the trailing edge.

Rows use dividers and a compact minimum height instead of large rounded cards. The list includes enough bottom scroll padding for the final row to clear the fixed navigation.

## Accessibility and responsive behavior

- Interactive targets remain at least 44 px.
- Long identifiers, topics, and referral links wrap without horizontal overflow.
- Status color remains secondary to text labels.
- Layout is verified at 320, 390, 768, 1024, and 1440 px, with focused Android/PWA checks at the supplied mobile proportions.
- All existing themes continue to use semantic tokens.

## Testing

- Component tests verify dynamic module visibility behavior and its placement in the footer.
- Layout contract tests verify full-width profile detail surfaces and compact support rows.
- Browser tests verify visible geometry, non-overlap with fixed navigation, and lack of horizontal overflow.
- Full unit tests, checks, production build, and release E2E run before deployment.
