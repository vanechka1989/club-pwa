# Unified Admin Analytics Rings Design

## Goal

Present every primary analytics value in one coherent circular visual system instead of separating revenue and new clients into conventional KPI cards.

## Layout

- Place the period selector on its own full-width row below the analytics heading, with equal left and right insets and four equal-width buttons.
- Replace the two-card KPI strip plus three-ring row with one six-item visual grid.
- Use two balanced rows of three equal items: revenue, new clients, and messages above; active clients, successful payments, and learning progress below.
- Keep all six items inside the existing analytics surface, with shared dividers, typography, spacing, focus behavior, and tap targets.
- Preserve a compact layout without horizontal scrolling from 320 px through 1440 px.
- Preserve the same centered selector alignment in normal mobile, scaled installed-PWA, tablet, and desktop layouts.

## Metric semantics

- Revenue shows the formatted currency amount in a full decorative value ring and opens Finance.
- New clients shows the signed count in a full decorative value ring and opens Clients.
- Messages shows the selected-period count in a full decorative value ring and opens Communication.
- Active clients, successful payments, and learning progress retain proportional conic arcs because they have valid denominators.
- Decorative value rings must not imply an invented percentage. Accessible labels announce the real value and context.

## Visual system

- Revenue uses the finance/accent color, new clients uses the success color, active clients uses success, successful payments uses accent, and learning progress uses gold.
- All six items share the same ring diameter, label hierarchy, interaction feedback, and reduced-motion behavior.
- The design continues to use existing semantic theme tokens and supports all current light and dark themes.

## Behavior and testing

- Every metric is a button leading to the corresponding detail screen.
- Structural tests require six visual actions, the absence of the separate KPI strip, correct accessible labels, and correct drill-down destinations.
- End-to-end tests verify all six rings, responsive layout, no horizontal overflow, and navigation for the converted value metrics.
- Run unit tests, checks, production build, release E2E, viewport screenshots, and production health/version/commit verification.
