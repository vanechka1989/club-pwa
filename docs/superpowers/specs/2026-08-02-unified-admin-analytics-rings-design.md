# Unified Admin Analytics Rings Design

## Goal

Present every primary analytics value in one coherent circular visual system instead of separating revenue and new clients into conventional KPI cards.

## Layout

- Replace the two-card KPI strip plus three-ring row with one five-item visual grid.
- On narrow mobile screens, place revenue and new clients in a balanced two-item first row and active clients, successful payments, and learning progress in a three-item second row.
- Keep all five items inside the existing analytics surface, with shared dividers, typography, spacing, focus behavior, and tap targets.
- Preserve a compact layout without horizontal scrolling from 320 px through 1440 px.

## Metric semantics

- Revenue shows the formatted currency amount in a full decorative value ring and opens Finance.
- New clients shows the signed count in a full decorative value ring and opens Clients.
- Active clients, successful payments, and learning progress retain proportional conic arcs because they have valid denominators.
- Decorative value rings must not imply an invented percentage. Accessible labels announce the real value and context.

## Visual system

- Revenue uses the finance/accent color, new clients uses the success color, active clients uses success, successful payments uses accent, and learning progress uses gold.
- All five items share the same ring diameter, label hierarchy, interaction feedback, and reduced-motion behavior.
- The design continues to use existing semantic theme tokens and supports all current light and dark themes.

## Behavior and testing

- Every metric is a button leading to the corresponding detail screen.
- Structural tests require five visual actions, the absence of the separate KPI strip, correct accessible labels, and correct drill-down destinations.
- End-to-end tests verify all five rings, responsive layout, no horizontal overflow, and navigation for the two newly converted metrics.
- Run unit tests, checks, production build, release E2E, viewport screenshots, and production health/version/commit verification.

