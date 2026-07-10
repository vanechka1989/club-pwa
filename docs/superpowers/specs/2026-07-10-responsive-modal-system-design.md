# Responsive Modal System Design

## Goal

Replace the single forced-height mobile modal rule with a predictable three-size modal system, while preserving all existing routes, API calls, state, and business logic.

## Modal Types

- Compact dialogs fit their content and use a safe viewport max-height. This includes confirmations, notifications, logout, push permission, module editing, and client messaging.
- Form dialogs use most of the viewport, keep the header and action footer visible, and scroll only the form body. This includes mailing creation, payment forms, avatar editing, permission editing, and storage folder forms.
- Workspace dialogs use the available viewport for dense administration or media content. This includes client drilldowns, mailing details, storage browsing, server logs, lesson previews, and payment drilldowns.

Every type uses the same mobile width, safe-area gutters, radius, touch-action, and overflow containment. Only height and internal scrolling differ.

## Mobile Payments

Tariff cards render one per row on mobile. The title, price, period, payment action, and owner controls must remain readable without word-by-word wrapping. Tablet and desktop layouts may use multiple columns when each card has enough width.

## Mailing Form

The mailing composer has a non-overlapping header, a scrollable form body, and a visible action footer. Formatting controls keep 44px touch targets and wrap as a group. Reset and close remain separate controls.

## Module Form

The module editor is a compact dialog. Its close control stays in the upper-right header. Actions form a consistent footer: destructive action separated from cancel and primary save. The dialog does not reserve unused viewport height.

## Light Theme And Admin Density

The light theme keeps the same component structure but reduces glow and double-sided neumorphic shadows. Base cards use a light border and one subtle shadow; only selected and primary elements receive purple emphasis.

The mobile admin header remains functionally unchanged. Spacing between the hero, role preview, section grid, period control, and KPI content is tightened so content starts sooner without shrinking touch targets.

## Testing

- CSS regression tests assert that no universal rule forces every modal to full height.
- Tests assert selector membership for compact, form, and workspace modal groups.
- Mobile payment tests assert a single-column tariff list and readable card layout.
- Existing unit, build, and Playwright suites remain green.
- Visual checks cover 360x800, 390x844, 430x932, and desktop widths in both themes.
