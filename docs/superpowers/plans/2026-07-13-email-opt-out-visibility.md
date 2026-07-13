# Email Opt-out Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить подтверждаемую отписку и видимый email-статус клиента в админке.

**Architecture:** GET отображает подтверждение, POST меняет существующее поле пользователя. Админский API передаёт дату отказа в общий контракт, а мобильный интерфейс показывает единый компактный статус.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Vue 3, Vitest, CSS semantic tokens.

## Global Constraints

- Коды входа, Push и уведомления приложения не отключаются.
- Новая колонка базы не создаётся; используется `marketing_email_opt_out_at`.
- Метка поддерживает все темы и не увеличивает высоту карточек без необходимости.

---

### Task 1: Безопасное подтверждение отписки

**Files:**
- Modify: `apps/api/src/mailings/unsubscribeRoute.test.ts`
- Modify: `apps/api/src/routes/mailingPreferences.ts`

- [ ] Добавить падающий тест, требующий разные GET и POST обработчики, форму подтверждения и отсутствие обновления пользователя в GET.
- [ ] Запустить `pnpm --filter @club/api test -- src/mailings/unsubscribeRoute.test.ts` и подтвердить RED.
- [ ] Реализовать GET-подтверждение и POST-отписку с тем же подписанным токеном.
- [ ] Повторить тест и подтвердить GREEN.

### Task 2: Статус клиента в API и UI

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminClientCard.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Добавить падающий тест для `marketingEmailOptOutAt`, двух меток `Email отключён` и тематического CSS.
- [ ] Запустить тест и подтвердить RED.
- [ ] Передать дату через `AdminStatsUser`, вывести условные бейджи в списке и карточке, добавить компактный стиль.
- [ ] Повторить тест и подтвердить GREEN.

### Task 3: Версия и публикация

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Сначала изменить тесты на версию `4.11`, заголовок релиза и cache `v112`, подтвердить RED.
- [ ] Обновить production metadata и подтвердить GREEN.
- [ ] Выполнить `pnpm test`, `pnpm check`, `pnpm build`, `git diff --check`.
- [ ] Commit, push, deployment и проверка `club2.myn8nservertest.ru`.
