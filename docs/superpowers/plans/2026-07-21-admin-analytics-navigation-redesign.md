# Admin Analytics Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed analytics feed with a compact overview and separate full-screen analytic areas inside the PWA.

**Architecture:** `AdminSection.vue` remains the navigation owner and stores the selected analytics area. The existing `TaskScreen` becomes the single full-screen shell for acquisition and the five existing statistic areas; `AdminAcquisitionAnalytics.vue` remains responsible for its graphs and nested link generator.

**Tech Stack:** Vue 3, TypeScript, Vitest, existing PWA UI primitives and Lucide icons.

## Global Constraints

- Do not change analytics APIs, attribution rules, or stored data.
- Do not open browser tabs or external windows.
- Keep a single shared period control on the analytics overview.
- Show graphs only inside the related full-screen area.
- Preserve first-touch / last-touch and the nested link generator inside acquisition.
- Verify widths 320, 360/390, 430, and 768 px without page-level horizontal overflow.

---

### Task 1: Lock the overview/detail navigation contract

**Files:**
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`
- Modify: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

**Interfaces:**
- Consumes: existing `openStatisticsDetail(detail)` navigation.
- Produces: a test contract requiring six overview rows, an acquisition detail screen, and no embedded acquisition dashboard.

- [ ] **Step 1: Write the failing structure tests**

Add assertions equivalent to:

```ts
expect(section.match(/class="admin-stat-nav-row/g)).toHaveLength(6);
expect(section).toContain("openStatisticsDetail('acquisition')");
expect(section).toContain("activeStatisticsDetail === 'acquisition'");
const overview = section.slice(
  section.indexOf(`activePanel === 'statistics'`),
  section.indexOf(`activePanel === 'users'`)
);
expect(overview.indexOf("<AdminAcquisitionAnalytics")).toBeGreaterThan(overview.indexOf("<TaskScreen"));
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts adminAcquisitionAnalytics.test.ts
```

Expected: FAIL because the overview has five rows and embeds acquisition before `TaskScreen`.

- [ ] **Step 3: Commit the test contract with the implementation in Task 2**

Do not commit a permanently failing branch state.

### Task 2: Make analytics overview a compact six-area hub

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/AdminStatisticsDetail.vue`
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`
- Modify: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

**Interfaces:**
- Consumes: `AdminAcquisitionAnalytics` props `from`, `to`, and `learningCategories`.
- Produces: `StatisticsDetail = "acquisition" | "clients" | "finance" | "learning" | "community" | "polls"`.

- [ ] **Step 1: Extend the detail type and metadata**

Use this union and metadata entry:

```ts
export type StatisticsDetail =
  | "acquisition"
  | "clients"
  | "finance"
  | "learning"
  | "community"
  | "polls";

acquisition: {
  title: "Привлечение",
  subtitle: "Источники, воронка и путь до оплаты"
}
```

- [ ] **Step 2: Remove acquisition from the overview feed**

Delete the direct `AdminAcquisitionAnalytics` block between the period control and the two-metric summary.

- [ ] **Step 3: Add the acquisition overview row first**

The row must call `openStatisticsDetail('acquisition')`, display `Привлечение`, describe `Источники и путь до оплаты`, and show a concise value label such as `Воронка` without duplicating async acquisition KPIs on the overview.

- [ ] **Step 4: Render acquisition inside the existing task screen**

Use conditional content:

```vue
<AdminAcquisitionAnalytics
  v-if="activeStatisticsDetail === 'acquisition'"
  :from="statisticsDateRange?.from"
  :to="statisticsDateRange?.to"
  :learning-categories="learningCategories"
/>
<AdminStatisticsDetail
  v-else
  :detail="activeStatisticsDetail"
  :stats="adminStatistics"
  :poll-stats="pollStats"
  @access="openUserAccessDrilldown"
  @tariff="openUserTariffDrilldown"
  @payment="openPaymentDrilldown"
/>
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts adminAcquisitionAnalytics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/admin/AdminSection.vue apps/web/src/features/admin/AdminStatisticsDetail.vue apps/web/src/features/admin/adminStatisticsNavigation.test.ts apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts
git commit -m "fix(admin): separate analytics areas"
```

### Task 3: Release and responsive verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: completed analytics navigation.
- Produces: the next patch release and cache identifier.

- [ ] **Step 1: Write release expectations first**

Update `releaseNotes.test.ts` to require the next patch version and the title `Раздельные экраны аналитики`. Update `pwa.test.ts` to require the next cache number.

- [ ] **Step 2: Run release tests and verify RED**

```bash
pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts
```

Expected: FAIL on the old app version and cache name.

- [ ] **Step 3: Update version, release note, and cache**

The release note must explain that the overview is now compact and all graphs live inside their related full-screen analytic area.

- [ ] **Step 4: Run full verification**

```bash
pnpm test
pnpm build
```

Expected: all tests and builds pass.

- [ ] **Step 5: Verify mobile layouts**

Open the overview, acquisition detail, and link generator at 320, 375, 390, 430, and 768 px. Confirm `document.documentElement.scrollWidth === document.documentElement.clientWidth`; chart overflow may exist only inside `.acquisition-chart-scroll`.

- [ ] **Step 6: Commit and deploy**

```bash
git add apps/web
git commit -m "chore(release): publish separated analytics screens"
git push origin main
```

Wait for the production deployment, verify `/api/health`, the production app version, service-worker cache, and the deployed commit.
