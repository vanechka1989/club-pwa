# Mailing Delivery Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исключить повторную отправку одной доставки при параллельных запусках очереди рассылок.

**Architecture:** Каждая строка доставки атомарно захватывается переходом `pending -> processing`. Счётчики обновляются SQL-приращениями, а завершение учитывает незаконченные строки `pending` и `processing`.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Не менять правила формирования аудитории и каналы Push/Email.
- Не добавлять локальную блокировку процесса как единственную защиту.
- Сохранить существующие статусы результата `sent`, `failed` и `skipped_*`.

---

### Task 1: Регрессионная защита очереди

**Files:**
- Modify: `apps/api/src/mailings/pushEmailQueue.test.ts`
- Modify: `apps/api/src/routes/mailings.ts`

**Interfaces:**
- Consumes: `adminMailingRecipients`, `adminMailings`, `processMailingQueue(limit)`.
- Produces: атомарный захват строк и корректные агрегатные счётчики.

- [ ] **Step 1: Write the failing test**

Добавить проверки наличия условного обновления `status = pending`, перехода в `processing`, учёта обоих незавершённых статусов и SQL-приращений счётчиков.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/api test -- src/mailings/pushEmailQueue.test.ts`
Expected: FAIL из-за отсутствия статуса `processing` и атомарного захвата.

- [ ] **Step 3: Write minimal implementation**

Перед `sendMailingToRecipient` выполнить условный `UPDATE` и продолжить только при получении строки через `.returning()`. В итоговом обновлении использовать `sql\`${adminMailings.sentCount} + ${sent}\`` и аналогичные выражения.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/api test -- src/mailings/pushEmailQueue.test.ts`
Expected: PASS.

### Task 2: Версия и полная проверка

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: версия 4.10 и cache `club-pwa-v111`.

- [ ] **Step 1: Write failing release tests**

Ожидать версию `4.10`, заголовок исправления дублей и cache `v111`.

- [ ] **Step 2: Run release tests and verify RED**

Run: `pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts`
Expected: FAIL на старых `4.09` и `v110`.

- [ ] **Step 3: Update release metadata**

Добавить release note о защите Push/Email от повторной обработки и обновить service worker cache.

- [ ] **Step 4: Verify and deploy**

Run: `pnpm test`, `pnpm check`, `pnpm build`, `git diff --check`.
Expected: все команды завершаются с кодом 0; затем commit, push и deployment на `club2.myn8nservertest.ru`.
