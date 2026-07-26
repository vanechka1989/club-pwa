# Compact Full-Width UI Design

## Context

The profile notification launcher is rendered before the lazy notification route is opened. Its visual CSS currently lives in `notificationRoute.css`, so the profile receives only generic button layout and the unread badge participates in normal flex flow. This compresses the bell and places the count beside or below it.

Page containers, routed task screens, bottom navigation, and overlays also use several unrelated outer gutters from 12px to 16px. On Android wide-layout PWA viewports those values are scaled, making the physical unused edge space larger than intended.

## Requirements

- The notification launcher owns and eagerly imports its own CSS; route-only notification styles remain lazy-loaded.
- The bell keeps a 44px touch target, a stable centered glyph, and an absolutely positioned red unread badge.
- The common outer gutter is 8px and becomes 4px at widths up to 360px.
- Safe-area insets are respected with `max(gutter, safe-area + gutter)` where edge controls need clearance.
- Main tabs, admin/developer surfaces, routed task screens, bottom navigation, dialogs, modal panels, sheets, and confirmation overlays use the same compact edge geometry.
- Internal card padding remains 12px (10px compact) to preserve readability and tap-target spacing.
- Page content may use the full available width; it must not be capped at a phone-sized 768px rail on larger screens.
- No authentication, authorization, purchase, payment-provider, or business-logic behavior changes.

## Architecture

Add semantic `--page-edge-gutter` tokens to the foundation and map existing `--page-padding` variables to them. Keep these edge tokens unscaled in wide-layout mode so the visible device gutter remains compact while controls and typography continue to scale. Move launcher-only notification rules to `notificationLauncher.css` and import that file from `NotificationCenter.vue`.

Add a late foundation bridge for legacy outer geometry so routed task screens and overlay backdrops consume the same tokens without rewriting each feature. Feature-specific internal layouts remain unchanged.

## Verification

- Unit contracts prove the 8px/4px tokens, full-width container, unscaled wide-layout edge gutter, launcher CSS ownership, and shared route/overlay geometry.
- Existing web and API test suites remain green.
- Production build and route-CSS ownership checks remain green.
- Browser audit covers 320, 390, 768, 1024, and 1440px viewports, profile bell with unread count, every primary tab, routed task screens, and representative modal/dialog states.
- No real payment is submitted; billing checks stop before provider confirmation.

