# Client Acquisition Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить совместимую с текущими фильтрами клиентов фильтрацию по источнику регистрации и любому UTM-полю.

**Architecture:** `/admin/stats` одним пакетным запросом дополняет показанных клиентов последним рекламным касанием. Чистая клиентская функция строит варианты и применяет все фильтры; `AdminSection.vue` только хранит состояние и отображает адаптивные контролы.

**Tech Stack:** TypeScript, Vue 3 Composition API, Hono, Drizzle ORM, Zod, Vitest, Playwright.

## Global Constraints

- Не выполнять отдельный запрос источника для каждого клиента.
- Источник регистрации совпадает с последним касанием в карточке клиента.
- Новые контролы находятся внутри «Дополнительных фильтров» и имеют высоту не менее 44 px.
- Поле API необязательное для обратной совместимости.

---

### Task 1: Контракт и серверная сводка источника

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/adminStatsUser.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/admin/clientAcquisitionSummary.test.ts`

**Interfaces:**
- Produces: `AdminStatsUser["acquisition"]` со значениями `source`, `medium`, `campaign`, `content` либо `null`.

- [ ] **Step 1: Write failing contract and route tests**

Проверить разбор `acquisition` общей схемой и потребовать в `/admin/stats` пакетный join `userAcquisitionAttributions` → `acquisitionLinks` по `lastLinkId`.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/shared test -- adminStatsUser.test.ts && pnpm --filter @club/api test -- clientAcquisitionSummary.test.ts`

Expected: FAIL, поле и пакетная загрузка ещё отсутствуют.

- [ ] **Step 3: Implement minimal server enrichment**

Добавить необязательное nullable-поле схемы, импортировать таблицы атрибуции и ссылок, одним запросом получить метки для `recentUsers`, передать сводку в `buildStatsUser`.

- [ ] **Step 4: Run focused tests and checks**

Run: `pnpm --filter @club/shared test -- adminStatsUser.test.ts; pnpm --filter @club/api test -- clientAcquisitionSummary.test.ts; pnpm --filter @club/api check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/adminStatsUser.test.ts apps/api/src/routes/admin.ts apps/api/src/admin/clientAcquisitionSummary.test.ts
git commit -m "feat: include acquisition tags in client stats"
```

### Task 2: Чистая фильтрация клиентов

**Files:**
- Create: `apps/web/src/features/admin/adminClientAcquisitionFilters.ts`
- Create: `apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts`

**Interfaces:**
- Produces: `filterAdminClients(users, filters)`, `getAdminClientSourceOptions(users)`, типы `AdminClientAcquisitionFilters` и `AdminClientUtmField`.

- [ ] **Step 1: Write failing behavior tests**

Проверить точный источник, «Без метки», поиск без учёта регистра по всем UTM-полям, выбор конкретного UTM-поля и совместную работу с существующими фильтрами.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @club/web test -- adminClientAcquisitionFilters.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Нормализовать строки через `trim().toLocaleLowerCase("ru")`, сравнивать источник точно, UTM-значение подстрокой, варианты дедуплицировать и сортировать `localeCompare("ru")`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter @club/web test -- adminClientAcquisitionFilters.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin/adminClientAcquisitionFilters.ts apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts
git commit -m "feat: add client acquisition filter helpers"
```

### Task 3: Мобильный интерфейс фильтров

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: helpers and types from `adminClientAcquisitionFilters.ts`.

- [ ] **Step 1: Write failing UI source test**

Потребовать `sourceFilter`, `utmFieldFilter`, `utmValueFilter`, подписи «Любой источник», «Любая UTM-метка», «Значение UTM» и мобильную сетку `.admin-client-acquisition-filters`.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @club/web test -- adminCompactLayout.test.ts`

Expected: FAIL because controls are absent.

- [ ] **Step 3: Wire state, computed data, reset, and controls**

Заменить локальное тело `filteredUsers` вызовом чистой функции, добавить computed-варианты источников, включить новые значения в `filtersActive` и `resetClientFilters`, вывести контролы в дополнительной сетке.

- [ ] **Step 4: Run focused test and web check**

Run: `pnpm --filter @club/web test -- adminCompactLayout.test.ts adminClientAcquisitionFilters.test.ts; pnpm --filter @club/web check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin/AdminSection.vue apps/web/src/features/admin/adminShell.css apps/web/src/features/admin/adminCompactLayout.test.ts
git commit -m "feat: filter clients by source and UTM"
```

### Task 4: Release, verification, deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

- [ ] **Step 1: Add failing release test for version 5.43**
- [ ] **Step 2: Run release test and verify RED**
- [ ] **Step 3: Publish 5.43 release note**
- [ ] **Step 4: Run `pnpm check`, `pnpm test`, `pnpm build`**
- [ ] **Step 5: Run Android 320 px and iPhone/WebKit responsive route audits**
- [ ] **Step 6: Commit, push `main`, run `deploy/update.sh`, verify `/api/health`, `/api/ready`, server commit and production version**
