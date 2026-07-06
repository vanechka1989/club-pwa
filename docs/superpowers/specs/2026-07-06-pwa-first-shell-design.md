# PWA-first Shell Design

Date: 2026-07-06

## Goal

Rework the current Club web client into a PWA-first application experience for phone and desktop. The product should no longer feel like a Telegram CRM screen placed inside a browser window. On mobile it should feel like an installed app; on desktop it should feel like a clean web dashboard.

## Scope

This design covers the frontend shell, navigation, layout, authentication entry, and the main user-facing sections. Existing backend APIs, database schema, email login, payment primitives, push infrastructure, and admin data flows stay in place for this iteration.

Out of scope for this pass:

- Rewriting the backend.
- Replacing the email-code authentication model.
- Changing production deployment infrastructure.
- Building new business logic that does not already exist in the app.

## Recommended Approach

Use the current Vue application as the data and feature base, but replace the frontend shell with a responsive PWA structure:

- Phone: full-screen app layout with top screen content and a fixed bottom tab bar.
- Desktop: dashboard layout with a persistent sidebar and wide content area.
- Installed PWA: show authentication and product screens.
- Regular browser: show only the install gate and install instructions.

This keeps production risk low while removing the old Telegram-shaped UX.

## Mobile App Structure

Mobile should not scale down desktop UI. It must use native app proportions:

- No outer "window" or browser-like card around the app.
- No global zoom/scaling CSS for phone screens.
- Content uses normal mobile font sizes and 16px base body text.
- Main content scrolls vertically.
- Fixed bottom navigation reserves safe-area padding so content is not hidden behind it.
- Tap targets are at least 44px high.

Primary bottom tabs:

1. Profile
2. Modules
3. Community
4. Payments
5. Support

Admin is not a primary mobile tab. For admin/owner users it appears as a separate admin entry point from the profile/header area.

## Desktop Structure

Desktop keeps a productivity/dashboard shape:

- Persistent left sidebar.
- Main content centered with a readable max width.
- Admin can remain desktop-first.
- User sections should not be constrained to phone-sized panels on a wide screen.
- The interface uses the same visual tokens as mobile, but with denser desktop spacing.

## Authentication

The browser gate remains strict:

- If the app is opened in a normal browser and is not installed, show only the install screen.
- If the app is opened as an installed PWA, show email authentication.
- After the user requests an email code, keep them on the code-entry screen.
- The resend button is disabled during cooldown and displays the remaining time.
- Copy should say:
  - Title: "Код из письма"
  - Body: "Введите 6 цифр из письма."

## Visual Direction

Default theme is light.

Use a calm operational club style:

- Background: soft near-white / pale mint.
- Surface: white or very light green-tinted surface.
- Text: dark ink.
- Primary action: emerald green.
- Secondary action: light neutral.
- Error/destructive: clear red with text, not color alone.

Avoid:

- Telegram window metaphors.
- Nested cards inside cards where the hierarchy becomes noisy.
- Tiny dashboard text on phone.
- Purple-heavy or dark-first default styling.
- Decorative blobs/orbs.

## Section Behavior

Profile:

- Starts with account status and subscription progress.
- Shows the primary renewal action clearly.
- Referral, account, payments, and appearance blocks become readable app sections.
- Logout remains visible but separated from normal actions.

Modules:

- Uses readable module cards.
- Lesson/detail screens should fill the app view instead of opening as cramped panels.

Community:

- Uses a chat/app style layout.
- Composer and chat controls should not be hidden by bottom navigation.

Payments:

- Shows payment system state, tariffs, and subscription actions with simple hierarchy.

Support:

- Uses a support/chat style view with unread state visible in navigation.

Admin:

- Available to admins/owners, but separated from the main user bottom navigation.

## Error Handling

- Form errors appear near the relevant field.
- Async actions disable their buttons while pending.
- Disabled states must be visibly disabled and non-interactive.
- Empty states should explain what is missing and what the user can do next.

## Testing And Verification

Before deployment:

- Run web tests.
- Run web build.
- Check browser gate at desktop width.
- Check installed-PWA route behavior via `/?source=pwa`.
- Check mobile viewport around 390x850.
- Check desktop viewport around 1440x900.
- Confirm no horizontal scroll on mobile.
- Confirm bottom navigation has no more than 5 visible primary tabs.
- Confirm app content is not hidden behind fixed navigation.

