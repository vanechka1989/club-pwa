# Admin Transfer Owner Compact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать экран передачи клуба компактным и исключить повторное растягивание формы на мобильных устройствах.

**Architecture:** Отделить форму передачи владельца от универсального полноэкранного класса клиентского модального окна. Использовать специализированные классы для карточки и формы с `max-content`-строками и явным выравниванием по началу.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite, PWA service worker.

## Global Constraints

- Не изменять бизнес-логику передачи клуба и API.
- Сохранить существующие тексты и доступность кнопки назад.
- Элементы формы должны занимать высоту содержимого во всех темах.
- Выпустить версию `4.07` с service-worker cache `club-pwa-v108`.

---

### Task 1: Regression test and compact markup

**Files:**
- Create: `apps/web/src/features/admin/adminTransferOwnerLayout.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue:4161`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `TaskScreen`, `handleTransferOwner`, `transferOwnerTelegramId`.
- Produces: `.admin-transfer-owner-task-screen`, `.admin-transfer-owner-card`, `.admin-transfer-owner-form`.

- [ ] **Step 1: Write the failing test** asserting dedicated markup, no duplicate modal header, start alignment, max-content rows, 12 px gap and 48 px controls.
- [ ] **Step 2: Run RED** with `pnpm --filter @club/web test -- adminTransferOwnerLayout.test.ts`; expect failure because the dedicated classes do not exist.
- [ ] **Step 3: Implement minimal markup and CSS** by removing the duplicate inner header and adding scoped compact classes.
- [ ] **Step 4: Run GREEN** with the same focused test; expect all assertions to pass.

### Task 2: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: verified compact transfer-owner screen.
- Produces: application version `4.07` and cache `club-pwa-v108`.

- [ ] **Step 1: Update release tests first** to expect version `4.07`, compact transfer screen title and cache `v108`.
- [ ] **Step 2: Run RED** and confirm expectations fail against `4.06`/`v107`.
- [ ] **Step 3: Update version, timestamp, release notes and service-worker cache.**
- [ ] **Step 4: Run focused tests, full test suite, checks and production build.**
- [ ] **Step 5: Commit, push `main`, deploy using `/opt/club-pwa/deploy/update.sh`, then verify production health, commit, version, cache and compact CSS selectors.**

## Self-review

- Спецификация покрыта двумя задачами; бизнес-логика не затрагивается.
- Плейсхолдеров и новых API нет.
- Названия CSS-классов совпадают между тестом, Vue-разметкой и стилями.

