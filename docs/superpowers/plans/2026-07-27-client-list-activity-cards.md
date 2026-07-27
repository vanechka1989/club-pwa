# Activity-First Client Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать список клиентов визуально выразительным и всегда сортировать его по последнему входу от самого свежего к более ранним.

**Architecture:** Существующая чистая функция фильтрации получает детерминированную сортировку, которая возвращает новую коллекцию и не изменяет ответ API. Существующее поле `AdminStatsUser.lastLoginAt` становится nullable; API возвращает последнюю auth-сессию либо `null` без подстановки даты создания. `AdminClientsPanel.vue` переиспользует текущие функции статуса и тарифа, но разделяет карточку на идентификацию, вторичные показатели и акцентный блок последнего входа. Адаптивное оформление остаётся в `adminShell.css` и использует существующие семантические переменные тем.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS design tokens, Playwright release tests.

## Global Constraints

- Сортировка только по `lastLoginAt`: самый свежий вход сверху, клиенты без корректной даты в конце.
- При одинаковом времени порядок стабилизируется по отображаемому имени, затем по `id`.
- Переключатель сортировки не добавляется.
- Новые API endpoint, поля и миграции не добавляются; nullability существующего `lastLoginAt` меняется минимально, схема базы данных и существующие фильтры сохраняются.
- Карточка остаётся одной доступной кнопкой с минимальной областью нажатия 44 × 44 px.
- Дата последнего входа и подписанный статус остаются видимыми начиная с ширины 320 px.
- Цвета используют существующие семантические переменные и работают во всех пяти текущих темах в светлом и тёмном режимах.

---

## File Map

- Modify: `apps/web/src/features/admin/adminClientAcquisitionFilters.ts` — фильтрация и детерминированная сортировка готового списка.
- Modify: `apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts` — поведение сортировки и совместимость с фильтрами.
- Create: `apps/web/src/features/admin/adminClientList.ts` — контакт и безопасное представление последнего входа для карточки.
- Create: `apps/web/src/features/admin/adminClientList.test.ts` — тесты вспомогательного представления карточки.
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue` — семантическая структура activity-first карточки.
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts` — структурный контракт карточки и адаптивного оформления.
- Modify: `apps/web/src/features/admin/adminShell.css` — визуальная иерархия, статусная полоса и responsive-компоновка.
- Modify: `packages/shared/src/index.ts` — nullable-контракт существующего `lastLoginAt`.
- Create: `apps/api/src/admin/adminClientLastLogin.ts` — сериализация последней auth-сессии без `createdAt` fallback.
- Modify: `apps/api/src/routes/admin.ts` — возврат реального последнего входа либо `null`.
- Modify: `tests/e2e/app.spec.ts` — browser-аудит всех тем, режимов и целевых ширин.

---

### Task 1: Детерминированная сортировка по последнему входу

**Files:**
- Modify: `apps/web/src/features/admin/adminClientAcquisitionFilters.ts`
- Test: `apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts`

**Interfaces:**
- Consumes: `AdminStatsUser[]`, `AdminClientFilters`, `getAdminClientDisplayName(user)`.
- Produces: `sortAdminClientsByLastLogin(users: readonly AdminStatsUser[]): AdminStatsUser[]`; `filterAdminClients` возвращает отфильтрованный и отсортированный новый массив.

- [ ] **Step 1: Write failing sort tests**

Add explicit fixtures and assertions:

```ts
it("sorts filtered clients by the latest login without mutating the input", () => {
  const oldest = client({ id: "oldest", lastLoginAt: "2026-07-20T08:00:00.000Z" });
  const newest = client({ id: "newest", lastLoginAt: "2026-07-27T18:00:00.000Z" });
  const middle = client({ id: "middle", lastLoginAt: "2026-07-25T12:00:00.000Z" });
  const input = [oldest, newest, middle];

  expect(filterAdminClients(input, baseFilters).map((user) => user.id)).toEqual(["newest", "middle", "oldest"]);
  expect(input.map((user) => user.id)).toEqual(["oldest", "newest", "middle"]);
});

it("puts missing logins last and stabilizes equal timestamps by name and id", () => {
  const sameTime = "2026-07-27T12:00:00.000Z";
  const result = sortAdminClientsByLastLogin([
    client({ id: "z", displayName: "Борис", lastLoginAt: sameTime }),
    client({ id: "b", displayName: "Анна", lastLoginAt: sameTime }),
    client({ id: "a", displayName: "Анна", lastLoginAt: sameTime }),
    client({ id: "never", lastLoginAt: null })
  ]);

  expect(result.map((user) => user.id)).toEqual(["a", "b", "z", "never"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminClientAcquisitionFilters.test.ts
```

Expected: FAIL because `sortAdminClientsByLastLogin` is not exported and `filterAdminClients` preserves API order.

- [ ] **Step 3: Implement the minimal pure sorter**

Add the existing display-name helper import and the sorter:

```ts
import { getAdminClientDisplayName } from "./adminClientCard";

function loginTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortAdminClientsByLastLogin(users: readonly AdminStatsUser[]) {
  return [...users].sort((left, right) => {
    const leftLogin = loginTimestamp(left.lastLoginAt);
    const rightLogin = loginTimestamp(right.lastLoginAt);

    if (leftLogin === null && rightLogin !== null) return 1;
    if (leftLogin !== null && rightLogin === null) return -1;
    if (leftLogin !== null && rightLogin !== null && leftLogin !== rightLogin) return rightLogin - leftLogin;

    const byName = getAdminClientDisplayName(left).localeCompare(getAdminClientDisplayName(right), "ru");
    return byName || left.id.localeCompare(right.id, "ru");
  });
}
```

Change the final expression in `filterAdminClients` from returning `users.filter(...)` to:

```ts
const filteredUsers = users.filter((user) => {
  const matchesQuery =
    !query ||
    [user.telegramId, user.firstName, user.username, user.displayName, user.email].some((value) =>
      normalize(value).includes(query)
    );
  const matchesSubscription =
    filters.subscription === "all" ||
    (filters.subscription === "active" ? user.membershipStatus === "active" : user.membershipStatus !== "active");
  const matchesTariff = filters.tariff === "all" || (user.tariff || "future") === filters.tariff;
  const matchesRestrictions = filters.restrictions === "all" || user.hasRestrictions;
  const userSource = normalize(user.acquisition?.source);
  const matchesSource =
    filters.source === allClientSourcesFilter ||
    (filters.source === untaggedClientSourceFilter ? !userSource : userSource === source);
  const acquisition = user.acquisition;
  const utmValues = acquisition
    ? filters.utmField === "all"
      ? [acquisition.source, acquisition.medium, acquisition.campaign, acquisition.content]
      : [acquisition[filters.utmField]]
    : [];
  const matchesUtm = !utmValue || utmValues.some((value) => normalize(value).includes(utmValue));

  return matchesQuery && matchesSubscription && matchesTariff && matchesRestrictions && matchesSource && matchesUtm;
});

return sortAdminClientsByLastLogin(filteredUsers);
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminClientAcquisitionFilters.test.ts
```

Expected: all acquisition filter and sorting tests PASS.

- [ ] **Step 5: Commit sorting behavior**

```powershell
git add apps/web/src/features/admin/adminClientAcquisitionFilters.ts apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts
git commit -m "feat: sort clients by latest login"
```

---

### Task 2: Activity-first card content and safe fallbacks

**Files:**
- Create: `apps/web/src/features/admin/adminClientList.ts`
- Create: `apps/web/src/features/admin/adminClientList.test.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: `AdminStatsUser`, existing `userTitle`, `getAdminTariffLabel`, `getAdminClientAccessState`, `formatAdminCompactDateTime` prop.
- Produces: `getAdminClientContact(user: AdminStatsUser): string | null`; `formatAdminClientLastLogin(value, formatter): string`; card classes `admin-client-list-row-{tone}`, `admin-client-list-contact`, `admin-client-list-metrics`, `admin-client-last-visit`, `admin-client-sort-note`.

- [ ] **Step 1: Write failing helper and component tests**

Create `adminClientList.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatAdminClientLastLogin, getAdminClientContact } from "./adminClientList";

describe("admin client list presentation", () => {
  it("prefers email and falls back to a normalized username", () => {
    expect(getAdminClientContact({ email: "client@example.com", username: "client" })).toBe("client@example.com");
    expect(getAdminClientContact({ email: null, username: "client" })).toBe("@client");
    expect(getAdminClientContact({ email: null, username: "@client" })).toBe("@client");
    expect(getAdminClientContact({ email: null, username: null })).toBeNull();
  });

  it("shows a safe fallback when the last login is missing or invalid", () => {
    const formatter = (value: string) => `formatted:${value}`;
    expect(formatAdminClientLastLogin("2026-07-27T18:00:00.000Z", formatter)).toBe("formatted:2026-07-27T18:00:00.000Z");
    expect(formatAdminClientLastLogin(null, formatter)).toBe("Не входил");
    expect(formatAdminClientLastLogin("invalid", formatter)).toBe("Не входил");
  });
});
```

Extend `adminCompactLayout.test.ts` to require the chosen structure:

```ts
expect(source).toContain('class="admin-client-sort-note"');
expect(source).toContain("Последний вход ↓");
expect(source).toContain("admin-client-list-contact");
expect(source).toContain("admin-client-list-metrics");
expect(source).toContain("admin-client-last-visit");
expect(source).toContain("admin-client-status-rail");
expect(source).toContain("formatAdminClientLastLogin");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminClientList.test.ts src/features/admin/adminCompactLayout.test.ts
```

Expected: FAIL because the helper module and selected card structure do not exist.

- [ ] **Step 3: Implement focused presentation helpers**

Create `adminClientList.ts`:

```ts
type ClientContact = { email?: string | null; username?: string | null };

export function getAdminClientContact(user: ClientContact) {
  if (user.email) return user.email;
  if (!user.username) return null;
  return user.username.startsWith("@") ? user.username : `@${user.username}`;
}

export function formatAdminClientLastLogin(
  value: string | null | undefined,
  formatter: (value: string) => string
) {
  return value && Number.isFinite(Date.parse(value)) ? formatter(value) : "Не входил";
}
```

- [ ] **Step 4: Restructure the Vue card without changing click behavior**

Import the helpers and keep each `<button>` as the single interactive card. Add the status tone class and split the content:

```vue
<p class="admin-client-sort-note">Последний вход ↓</p>
<button
  v-for="user in filteredUsers"
  :key="user.id"
  class="admin-list-item ui-card admin-client-list-row"
  :class="[
    `admin-client-list-row-${getAdminClientAccessState(user).tone}`,
    { 'admin-list-item-active': selectedUser?.id === user.id }
  ]"
  type="button"
  @click="emit('select-user', user)"
>
  <span class="admin-client-status-rail" aria-hidden="true"></span>
  <span class="admin-client-list-avatar">...</span>
  <span class="admin-list-item-main">
    <span class="admin-client-list-name-line"><strong>{{ userTitle(user) }}</strong></span>
    <small v-if="getAdminClientContact(user)" class="admin-client-list-contact">{{ getAdminClientContact(user) }}</small>
    <span class="admin-client-list-metrics">
      <span>{{ getAdminTariffLabel(user.tariff) }}</span>
      <span class="admin-list-item-progress">Уроки {{ user.completedItems }}/{{ user.totalItems }}</span>
    </span>
  </span>
  <span class="admin-client-last-visit">
    <small>Последний вход</small>
    <strong>{{ formatAdminClientLastLogin(user.lastLoginAt, formatAdminCompactDateTime) }}</strong>
    <em class="admin-access-badge" :class="`admin-access-badge-${getAdminClientAccessState(user).tone}`">{{ getAdminClientAccessState(user).label }}</em>
  </span>
  <span class="admin-client-list-chevron"><ChevronRight aria-hidden="true" /></span>
</button>
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminClientList.test.ts src/features/admin/adminCompactLayout.test.ts src/features/admin/AdminClientsPanel.test.ts src/features/admin/adminClientCard.test.ts
```

Expected: all client-list and client-detail tests PASS.

- [ ] **Step 6: Commit the semantic card structure**

```powershell
git add apps/web/src/features/admin/adminClientList.ts apps/web/src/features/admin/adminClientList.test.ts apps/web/src/features/admin/AdminClientsPanel.vue apps/web/src/features/admin/adminCompactLayout.test.ts
git commit -m "feat: emphasize activity in client cards"
```

---

### Task 3: Responsive visual polish and release verification

**Files:**
- Modify: `apps/web/src/features/admin/adminShell.css`
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: card classes introduced in Task 2 and current semantic tokens `--success`, `--warning`, `--danger`, `--accent`, `--panel`, `--border`, `--text`, `--muted`.
- Produces: a 320 px-safe grid, visible status rail, readable last-login block and theme-aware focus/hover states.

- [ ] **Step 1: Add failing responsive style assertions**

Add assertions that protect the actual UI contract:

```ts
expect(styles).toMatch(/\.admin-list-item\.admin-client-list-row\s*\{[^}]*grid-template-columns:\s*4px 40px minmax\(0, 1fr\) minmax\(88px, auto\) 14px;/s);
expect(styles).toContain(".admin-client-status-rail");
expect(styles).toContain(".admin-client-last-visit");
expect(styles).toContain(".admin-client-list-row-open");
expect(styles).toContain(".admin-client-list-row-restricted");
expect(styles).toContain(".admin-client-list-row-closed");
expect(styles).toMatch(/@media \(max-width: 359px\)[\s\S]*\.admin-client-last-visit/);
```

- [ ] **Step 2: Run the compact layout test and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminCompactLayout.test.ts
```

Expected: FAIL because the new status rail and responsive last-login styles are absent.

- [ ] **Step 3: Implement the selected visual direction**

Update `adminShell.css` with the following responsibilities:

```css
.admin-list-item.admin-client-list-row {
  position: relative;
  grid-template-columns: 4px 40px minmax(0, 1fr) minmax(88px, auto) 14px;
  min-height: 72px;
  gap: 8px;
  overflow: hidden;
  padding: 9px 10px 9px 0;
}

.admin-client-status-rail { width: 4px; height: calc(100% + 18px); }
.admin-client-list-row-open .admin-client-status-rail { background: var(--success); }
.admin-client-list-row-restricted .admin-client-status-rail { background: var(--warning); }
.admin-client-list-row-closed .admin-client-status-rail { background: var(--danger); }

.admin-client-list-metrics { display: flex; flex-wrap: wrap; gap: 4px 8px; }
.admin-client-last-visit { display: grid; min-width: 88px; justify-items: end; gap: 3px; text-align: right; }
.admin-client-last-visit > small { color: var(--muted); font-size: 0.62rem; }
.admin-client-last-visit > strong { color: var(--text); font-size: 0.73rem; line-height: 1.15; }

body.club-mobile-device .admin-list-item.admin-client-list-row,
body.club-mobile-app-scaled .admin-list-item.admin-client-list-row {
  grid-template-columns: 4px 40px minmax(0, 1fr) minmax(88px, auto) 14px;
  min-height: 72px;
  gap: 8px;
  padding: 9px 10px 9px 0;
}

@media (max-width: 359px) {
  .admin-list-item.admin-client-list-row {
    grid-template-columns: 4px 36px minmax(0, 1fr) minmax(78px, auto) 14px;
  }
  body.club-mobile-device .admin-list-item.admin-client-list-row,
  body.club-mobile-app-scaled .admin-list-item.admin-client-list-row {
    grid-template-columns: 4px 36px minmax(0, 1fr) minmax(78px, auto) 14px;
  }
  .admin-client-last-visit { min-width: 78px; }
}
```

Retain the existing `.admin-list-item:focus-visible` behavior and the existing 44 px minimum tap target rules; do not introduce fixed widths or horizontal scrolling.

- [ ] **Step 4: Run focused client tests and type checks**

Run:

```powershell
pnpm --filter @club/web test -- src/features/admin/adminCompactLayout.test.ts src/features/admin/adminClientList.test.ts src/features/admin/adminClientAcquisitionFilters.test.ts src/features/admin/AdminClientsPanel.test.ts src/features/admin/adminClientCard.test.ts
pnpm --filter @club/web check
```

Expected: all focused tests PASS and Vue TypeScript check exits 0.

- [ ] **Step 5: Build and visually inspect required widths**

Run:

```powershell
pnpm --filter @club/web build
```

Use the repository Playwright/browser setup to inspect the clients screen at 320, 390, 768 and 1024 px. Verify long names, email-to-username fallback, open/restricted/closed cards, keyboard focus, all five current themes in light/dark modes, a visible chevron at 320 px and zero horizontal overflow. Correct any observed defect and rerun the focused tests.

- [ ] **Step 6: Run complete regression and release gates**

Run:

```powershell
pnpm check
pnpm test
pnpm build
pnpm test:e2e:release
```

Expected: type checks, all unit/component tests, production bundle budget and release browser suite PASS.

- [ ] **Step 7: Commit verified visual polish**

```powershell
git add apps/web/src/features/admin/adminShell.css apps/web/src/features/admin/adminCompactLayout.test.ts
git commit -m "style: polish activity-first client cards"
```
