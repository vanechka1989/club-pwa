# Profile Access Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать карточку профиля компактнее и исправить расположение действий, текста подарочного доступа и раскрытого email.

**Architecture:** Бизнес-данные и API-контракт не меняются. Правки ограничены presentational helper, шаблоном `ProfileSection` и профильными стилями; существующие тесты расширяются до реализации.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright, pnpm.

## Global Constraints

- Минимальная область нажатия интерактивных иконок — 44×44 px.
- Раскрытый email не должен вызывать горизонтальную прокрутку на 320 px.
- Кнопка оплаты сохраняет правило появления только в последние три дня подходящего доступа.
- Production target: `club2.myn8nservertest.ru`, `2.27.28.89`, `/opt/club-pwa`.

---

### Task 1: Зафиксировать тексты и структуру тестами

**Files:**
- Modify: `apps/web/src/features/profile/profileAccess.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.layout.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `getProfileAccessMetaText(access, locale)` и существующую разметку профиля.
- Produces: требования к тексту gift, отдельной кнопке аватара, полноширинному email и компактному статусу.

- [ ] **Step 1: Добавить ожидание `gift -> «Выдана администратором»` и layout-маркеры новых областей.**
- [ ] **Step 2: Запустить focused Vitest и убедиться, что новые ожидания падают по отсутствующей реализации.**
- [ ] **Step 3: Расширить E2E раскрытием длинного email и проверкой отсутствия overflow.**

### Task 2: Перестроить карточку

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/profileAccess.ts`
- Modify: `apps/web/src/features/profile/profileRoute.css`

**Interfaces:**
- Consumes: текущие обработчики `openAvatarPhotoActions`, `openDisplayNameEditor`, `toggleEmailVisibility` и `copyAccountEmail`.
- Produces: `.profile-identity-actions`, `.profile-email-row--visible` и компактный `.profile-dashboard-subscription`.

- [ ] **Step 1: Перенести камеру из наложения на аватар в группу действий рядом с карандашом.**
- [ ] **Step 2: Вынести email из левой колонки в полноширинную строку и добавить состояние раскрытия.**
- [ ] **Step 3: Заменить gift-пояснение и сократить вертикальную геометрию статуса.**
- [ ] **Step 4: Запустить focused Vitest и довести его до зелёного состояния.**

### Task 3: Визуальная и production-проверка

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: соответствующие release/PWA tests.

**Interfaces:**
- Consumes: готовую карточку и штатный release/deploy workflow.
- Produces: новый patch release и точный production commit.

- [ ] **Step 1: Проверить профиль на 320, 390 и 768 px в светлой и тёмной темах.**
- [ ] **Step 2: Выполнить `pnpm check`, `pnpm test`, `pnpm build` и release E2E.**
- [ ] **Step 3: Обновить patch version и PWA cache через failing release tests, затем повторить проверки.**
- [ ] **Step 4: Выполнить production preflight, push, штатный deploy и сверить health, ready, version, cache, server HEAD и deployed marker.**

