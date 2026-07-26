# Payment and Support Polish Design

## Goal

Make payment actions consistent and give the admin support screen a modern, compact visual hierarchy without changing checkout or support business logic.

## Payment

- Every available tariff uses the action label `Оплатить`, including recurrent products.
- The recurrent nature remains visible in the tariff metadata (`Автосписание каждые … дн.`).
- Loading copy remains `Открываем…`.
- Checkout confirmation, provider choice, recurrent restrictions, and API calls remain unchanged.

## Support overview

- Replace four unrelated pill cards with one cohesive overview surface.
- Use a 2×2 metric grid on phones and a 4×1 grid from 620 px.
- Each metric has a restrained semantic icon/tone, left-aligned label, and prominent value.
- Average response time has enough width and must not clip or overflow.

## Support tickets

- Keep `Запросы клиентов` as a standalone section heading.
- Render each request as a compact 8 px-radius surface with a thin border, subtle background, and state-colored leading accent.
- Put customer name and status on the first line; identity/topic and waiting/closure metadata below.
- Add a small chevron to communicate navigation.
- Target 76–96 px row height on mobile while preserving a 44 px tap target and readable text.

## Themes and accessibility

- Reuse `--panel`, `--panel-soft`, `--border`, `--text`, `--muted`, `--accent`, `--warning`, and danger/success tokens.
- Do not add hard-coded dark-only colors.
- Preserve accessible names, focus states, and button semantics.
- Prevent horizontal overflow at 320, 390, 768, 1024, and 1440 px.

## Verification

- Use TDD for the payment label and support layout contracts.
- Capture authenticated Playwright screenshots for payment and support on Android; run the same geometry/overflow assertions on desktop Chromium and iOS WebKit.
- Run type checks, the full unit suite, production build, and the full release E2E suite.

## Release

Publish as version 5.67 with service-worker cache `club-pwa-v239`.
