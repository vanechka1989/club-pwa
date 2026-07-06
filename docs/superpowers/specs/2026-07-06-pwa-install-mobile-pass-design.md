# PWA Install And Mobile App Pass Design

## Goal

Make the first production path feel like a real app: a visitor opens the domain, installs Club through the correct platform flow, launches it from the app icon, signs in by email, and then uses a readable mobile cabinet without Telegram-era window behavior.

## Scope

This pass focuses on the member-facing PWA shell, not a full admin rebuild. It covers install guidance, installed-mode detection, auth entry, the mobile app shell, bottom navigation, and the main member screens: profile, learning, community, payments, and support. Admin remains accessible, but it is not a primary mobile tab.

## UX Principles

- Before install, the page is an install assistant, not an email login form.
- iPhone does not show a dead native install button. It immediately explains `Share` -> `Add to Home Screen`.
- Chrome and Android keep the native prompt path when the browser exposes it, then show manual fallback instructions if needed.
- Installed launch opens the auth flow directly.
- Mobile screens use app-style density: readable 16px base text, 44px+ tap targets, one primary action per panel, no horizontal scroll, and safe-area padding above the OS gesture bar.
- Desktop remains a calm dashboard with the same product language, not a mobile layout stretched wide.

## Recommended Approach

Use the current Vue feature boundaries and improve the shell incrementally.

1. Keep `AuthSection.vue` as the install/auth gate, but make platform copy explicit and testable.
2. Keep `PwaInstallPrompt.vue` as the floating installed-user helper, but ensure pre-auth has only one install surface.
3. Keep `App.vue` as the shell owner, but move mobile navigation decisions into clear constants and tests.
4. Add CSS rules in `styles.css` only where they target shared shell/card behavior; avoid rewriting every feature component in this pass.
5. Add Playwright or DOM smoke checks for small phone widths where possible.

This approach is less risky than a wholesale rewrite and still removes the Telegram/webview assumptions from the user path.

## Screens

### Install Gate

The install gate has one card centered on mobile and desktop. On iPhone it shows:

- title: `Добавьте Club на экран Домой`;
- no `Установить приложение` button;
- a short reason explaining that iPhone installation is done through browser sharing;
- Safari instructions with visible `Поделиться`, `На экран Домой`, `Добавить`.

On Chrome/Android/Desktop it shows:

- title: `Установите приложение`;
- a primary install button when native prompt can be requested;
- manual fallback after the button is pressed or when no native prompt exists.

### Auth

After installed launch, the install gate is skipped and the user sees email auth. Code entry stays on the same email session, the resend button remains disabled during cooldown, and the user never has to re-enter the email just to enter a code.

### Mobile Cabinet

The signed-in mobile layout uses:

- full-width app shell without the old centered desktop card;
- bottom navigation with exactly five member tabs: profile, learning, community, payments, support;
- admin entry as a secondary pill for admins/owners, not a sixth bottom tab;
- safe bottom padding so content and controls are not hidden behind the OS nav bar;
- section cards that read as app panels: compact, readable, and stable.

## Testing

- Unit tests cover platform install behavior, installed-mode auth switching, cooldown state, and mobile navigation membership.
- CSS source tests cover removal of legacy collapse/window behavior and mobile typography rules.
- Build verification uses `pnpm --filter @club/web build`.
- Production verification checks `/api/health`, current deployed commit, and a small-phone smoke test for iPhone install copy and horizontal overflow.

## Out Of Scope

- Payment provider redesign.
- New admin CRUD workflows.
- Full content editor rebuild.
- Native App Store distribution.
- Push campaign tooling beyond preserving existing PWA push hooks.
