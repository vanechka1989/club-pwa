# Responsive PWA Shell Design

## Context

The club PWA now runs outside Telegram and needs to feel native on phones while also behaving like a full browser app on desktop. The current shell is mobile-first, uses a floating bottom navigation, and constrains the main content to a narrow centered column. CSS also still contains Telegram/webview and device-specific layout rules that should not dominate the normal browser experience.

## Approved Direction

Use an adaptive application shell:

- Mobile keeps the bottom navigation and full-width PWA layout.
- Tablet gets wider content and denser two-column layouts where the existing screen supports it.
- Desktop switches to a persistent left sidebar and a wider content workspace.

This avoids a full redesign while making the browser version feel like a real web app instead of a phone screen stretched in the center.

## Breakpoints

- Phone: up to 767px.
- Tablet: 768px to 1023px.
- Desktop: 1024px and wider.
- Wide desktop: 1280px and wider.

The implementation should use CSS variables for shell width, page gutters, nav size, and bottom safe-area spacing so feature screens inherit the same rhythm.

## Mobile Behavior

Mobile remains the primary PWA experience.

- Keep the fixed bottom navigation.
- Preserve the collapse toggle for the bottom navigation.
- Keep touch targets at least 44px high.
- Make content use the available viewport width without horizontal scroll.
- Preserve keyboard and safe-area handling for login forms, chat input, modals, and upload/status overlays.
- Keep community chat able to occupy the full visible viewport when open.

## Tablet Behavior

Tablet should feel less cramped without changing navigation semantics.

- Increase content max-width and gutters.
- Allow repeated cards and summary panels to use two columns where existing components already support grids.
- Keep bottom navigation unless the viewport is desktop-width.
- Avoid dense admin tables overflowing horizontally; prefer stacked rows or contained scroll for unavoidable wide data.

## Desktop Behavior

Desktop gets a browser-native layout.

- Add a left sidebar, 240-280px wide.
- Sidebar contains brand/status area, navigation items, unread badges, and optional collapse.
- Hide the bottom navigation and its toggle on desktop.
- Main content uses a wider workspace, approximately 1180-1320px on wide screens.
- Profile, learning, payments, support, community, and admin screens should sit inside the same desktop shell.
- Community chat should still support a focused full-height layout inside the main workspace.
- The app should avoid the narrow `max-w-4xl` phone-like feeling on desktop.

## Visual System

Keep the existing dark/light theme tokens and the current Lucide icon language.

- Use restrained SaaS/member-portal density.
- Prefer semantic tokens already present in `styles.css` over adding a new color system.
- Keep cards at the existing small-to-medium radii unless local components require otherwise.
- Avoid marketing hero treatment; this is an operational member app.

## Technical Plan

The implementation should be scoped to the shell and responsive CSS first:

- Update `App.vue` to render a desktop sidebar alongside the existing mobile bottom nav.
- Keep the existing `selectSection`, badges, role gating, and section mounting logic.
- Add shell classes that distinguish `app-layout-mobile`, `app-layout-tablet`, and `app-layout-desktop` behavior through CSS.
- Move desktop width/padding rules into `styles.css` near the existing app shell and navigation rules.
- Restrict old Telegram/webview-specific rules to classes that only exist in those environments.
- Add or update tests that assert desktop sidebar markup exists and bottom nav remains available for mobile.

## Verification

Before deployment, verify:

- `pnpm check`
- `pnpm test`
- `pnpm build`
- Browser checks at 375px, 430px, 768px, 1024px, and 1440px.
- No horizontal scroll on phone-sized viewports.
- Desktop shows sidebar and hides bottom nav.
- Mobile shows bottom nav and hides desktop sidebar.
- Login, profile, learning, community, payments, support, and admin entry points remain reachable.

## Out of Scope

- Full visual redesign of every feature screen.
- Rewriting admin tables and learning editor internals unless they block responsive use.
- Removing all legacy Telegram-related CSS in one pass.
- Changing backend, email, push, payment, or auth behavior.

## Self-Review

- No unresolved markers or undecided requirements remain.
- Scope is limited to responsive shell, navigation, and high-impact CSS adaptation.
- Desktop, tablet, and mobile behavior are explicitly separated.
- Existing business logic and section ownership remain unchanged.
