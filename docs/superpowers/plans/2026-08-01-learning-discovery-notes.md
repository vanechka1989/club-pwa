# Learning Discovery and Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side lesson discovery, server-synced favorites, and per-lesson personal notes without duplicating the existing continue-learning card or admin engagement dashboard.

**Architecture:** Keep filtering as pure client-side domain logic over the already loaded learning catalog. Persist favorites in a user-scoped join table exposed through active-member routes, and reuse the existing user-filtered lesson comments API for notes. Add focused Vue components so `LearningSection.vue` only coordinates state and lesson selection.

**Tech Stack:** Vue 3, TypeScript, Pinia, Hono, Drizzle ORM, PostgreSQL, Zod, Vitest, Testing Library Vue, Playwright.

## Global Constraints

- Search module title/description and lesson title/summary without a new network request.
- Filters are exactly «Все», «Избранное», «В процессе», and «Пройдено».
- Favorites are isolated by authenticated user and synchronized across devices.
- Notes are limited to 2000 characters, visible to their author and authorized administrators, and never shown to another client.
- Touch targets are at least 44×44 px and the 320 px layout has no page-level horizontal scroll.
- Existing «Продолжить обучение» and admin lesson analytics remain unchanged and are not duplicated.

---

### Task 1: Search and learning-state filters

**Files:**
- Create: `apps/web/src/features/learning/learningDiscovery.ts`
- Create: `apps/web/src/features/learning/learningDiscovery.test.ts`
- Create: `apps/web/src/features/learning/LearningDiscoveryToolbar.vue`
- Create: `apps/web/src/features/learning/learningDiscoveryToolbar.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`

**Interfaces:**
- Consumes: module and lesson metadata already loaded by `LearningSection.vue`, plus `startedItemIds`, `completedItemIds`, and favorite ids.
- Produces: `LearningDiscoveryFilter`, `filterLearningModules(modules, options)`, and `LearningDiscoveryToolbar` events `update:query`, `update:filter`, and `reset`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
expect(normalizeLearningQuery("  ЙОГА   ДЛЯ Спины ")).toBe("йога для спины");
expect(filterLearningModules(modules, { query: "спина", filter: "all", startedIds: new Set(), completedIds: new Set(), favoriteIds: new Set() })[0]?.lessons.map((item) => item.id)).toEqual(["lesson-back"]);
expect(filterLearningModules(modules, { query: "", filter: "in_progress", startedIds: new Set(["a"]), completedIds: new Set(), favoriteIds: new Set() }).flatMap((module) => module.lessons).map((item) => item.id)).toEqual(["a"]);
```

- [ ] **Step 2: Run the domain test and confirm RED**

Run: `pnpm --filter @club/web test -- learningDiscovery.test.ts`

Expected: FAIL because `learningDiscovery.ts` does not exist.

- [ ] **Step 3: Implement pure discovery logic**

```ts
export type LearningDiscoveryFilter = "all" | "favorites" | "in_progress" | "completed";
export type DiscoveryLesson = { id: string; title: string; description: string };
export type DiscoveryModule = { id: string; title: string; description: string; lessons: DiscoveryLesson[] };
export function normalizeLearningQuery(value: string): string;
export function filterLearningModules<TLesson extends DiscoveryLesson, TModule extends Omit<DiscoveryModule, "lessons"> & { lessons: TLesson[] }>(
  modules: TModule[],
  options: { query: string; filter: LearningDiscoveryFilter; startedIds: ReadonlySet<string>; completedIds: ReadonlySet<string>; favoriteIds: ReadonlySet<string> }
): TModule[];
```

The implementation preserves source order, matches module and lesson text case-insensitively, returns every lesson when the module itself matches, and otherwise returns only matching lessons.

- [ ] **Step 4: Write and run toolbar component tests**

```ts
expect(screen.getByRole("searchbox", { name: "Найти модуль или урок" })).toBeTruthy();
await fireEvent.click(screen.getByRole("button", { name: "Избранное" }));
expect(emitted()["update:filter"]?.[0]).toEqual(["favorites"]);
```

Run: `pnpm --filter @club/web test -- learningDiscoveryToolbar.test.ts`

Expected before component: FAIL; expected after component: PASS.

- [ ] **Step 5: Integrate filtered modules into `LearningSection.vue`**

Add member-only `learningSearchQuery`, `learningFilter`, and computed `visibleModuleCards`. Render the toolbar above the catalog, iterate `visibleModuleCards`, automatically expand modules while a query/filter is active, and render a result-empty card with «Сбросить поиск».

- [ ] **Step 6: Run focused learning tests**

Run: `pnpm --filter @club/web test -- learningDiscovery.test.ts learningDiscoveryToolbar.test.ts learningMemberContent.test.ts learningPath.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/learning
git commit -m "feat(learning): add lesson search and filters"
```

### Task 2: User-scoped favorites persistence and API

**Files:**
- Create: `apps/api/drizzle/0064_learning_favorites.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/learningContent.test.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Create: `apps/api/src/learning/learningFavoritesRoute.test.ts`

**Interfaces:**
- Produces: table `userLearningFavorites`; `LearningProgressSummary.favoriteItemIds: string[]`; routes `PUT /learning/items/:id/favorite` and `DELETE /learning/items/:id/favorite` returning `{ ok: true, favorite: boolean }`.
- Security source: authenticated `c.get("userId")`; no user id is accepted from request data.

- [ ] **Step 1: Add failing shared contract tests**

```ts
expect(learningHomeResponseSchema.parse(home).progress.favoriteItemIds).toEqual([]);
expect(learningFavoriteMutationResponseSchema.parse({ ok: true, favorite: true })).toEqual({ ok: true, favorite: true });
```

Run: `pnpm --filter @club/shared test -- learningContent.test.ts`

Expected: FAIL because the favorite fields/schema do not exist.

- [ ] **Step 2: Extend shared schemas with backward-compatible defaults**

```ts
favoriteItemIds: z.array(z.string()).default([])
export const learningFavoriteMutationResponseSchema = z.object({ ok: z.boolean(), favorite: z.boolean() });
export type LearningFavoriteMutationResponse = z.infer<typeof learningFavoriteMutationResponseSchema>;
```

- [ ] **Step 3: Add migration and Drizzle relations**

```sql
CREATE TABLE "user_learning_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content_item_id" uuid NOT NULL REFERENCES "content_items"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_learning_favorites_user_item_unique" UNIQUE("user_id", "content_item_id")
);
CREATE INDEX "user_learning_favorites_user_created_idx" ON "user_learning_favorites" ("user_id", "created_at");
```

Expose `favorites: many(userLearningFavorites)` from users and content items, and `user`/`item` relations from the new table.

- [ ] **Step 4: Add failing API security/contract test**

```ts
expect(source).toContain('.put("/items/:id/favorite", requireActiveMember');
expect(source).toContain('.delete("/items/:id/favorite", requireActiveMember');
expect(source).toContain('const userId = c.get("userId")');
expect(source).not.toMatch(/favorite[\s\S]{0,900}body\.data\.userId/);
expect(source).toContain("onConflictDoNothing");
```

Run: `pnpm --filter @club/api test -- learningFavoritesRoute.test.ts`

Expected: FAIL before route implementation.

- [ ] **Step 5: Implement favorite reads and idempotent mutations**

Query favorite ids in `GET /learning` only through published module content. `PUT` inserts the pair with `onConflictDoNothing`; `DELETE` deletes only where both authenticated user id and lesson id match. Both routes first resolve a published lesson and return 404 otherwise.

- [ ] **Step 6: Run shared and API tests**

Run: `pnpm --filter @club/shared test -- learningContent.test.ts && pnpm --filter @club/api test -- learningFavoritesRoute.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/drizzle/0064_learning_favorites.sql apps/api/src/db/schema.ts apps/api/src/routes/learning.ts apps/api/src/learning/learningFavoritesRoute.test.ts packages/shared/src/index.ts packages/shared/src/learningContent.test.ts
git commit -m "feat(learning): persist member favorites"
```

### Task 3: Favorite controls and optimistic synchronization

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/learning/useLearningFavorites.ts`
- Create: `apps/web/src/features/learning/useLearningFavorites.test.ts`
- Create: `apps/web/src/features/learning/LearningFavoriteButton.vue`
- Create: `apps/web/src/features/learning/learningFavoriteButton.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`

**Interfaces:**
- Consumes: `favoriteItemIds` from learning home and `setLearningFavorite(id, favorite)` from the API client.
- Produces: `isFavorite(id)`, `toggleFavorite(id)`, and button props `{ active, pending, compact? }` with event `toggle`.

- [ ] **Step 1: Add API client methods and failing composable tests**

```ts
export function setLearningFavorite(id: string, favorite: boolean) {
  return api<LearningFavoriteMutationResponse>(`/learning/items/${id}/favorite`, { method: favorite ? "PUT" : "DELETE" });
}
```

Test optimistic add, optimistic remove, repeated taps while pending, and rollback after rejection.

Run: `pnpm --filter @club/web test -- useLearningFavorites.test.ts`

Expected: FAIL before composable implementation.

- [ ] **Step 2: Implement `useLearningFavorites`**

```ts
export function useLearningFavorites(initialIds: Ref<readonly string[]>) {
  const favoriteIds = ref(new Set(initialIds.value));
  const pendingIds = ref(new Set<string>());
  function isFavorite(id: string): boolean;
  async function toggleFavorite(id: string): Promise<void>;
  return { favoriteIds, pendingIds, isFavorite, toggleFavorite };
}
```

Rollback to the previous set on API failure and rethrow so `LearningSection` can show the standard notification.

- [ ] **Step 3: Build and test `LearningFavoriteButton`**

Render `Bookmark`/`BookmarkCheck`, `aria-pressed`, disabled pending state, and a 44×44 px control. The card variant is icon-only; the lesson-view variant includes «В избранном» or «В избранное».

- [ ] **Step 4: Integrate buttons and favorite filter**

Place the compact control above the clickable lesson card without nesting buttons. Place the labeled control in the lesson viewer. Use the composable set in `filterLearningModules` and show «В избранном пока ничего нет» when that filter is empty.

- [ ] **Step 5: Run focused UI tests**

Run: `pnpm --filter @club/web test -- useLearningFavorites.test.ts learningFavoriteButton.test.ts learningMemberContent.test.ts learningDiscovery.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/features/learning
git commit -m "feat(learning): add favorite lesson controls"
```

### Task 4: Lazy personal notes inside the lesson viewer

**Files:**
- Create: `apps/web/src/features/learning/LearningLessonNotes.vue`
- Create: `apps/web/src/features/learning/learningLessonNotes.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Create: `apps/api/src/learning/learningNotesRoute.test.ts`

**Interfaces:**
- Consumes: `getLessonComments(id)` and `createLessonComment(id, body)` from the existing API client.
- Produces: component props `{ lessonId: string }`; all loading, error, expansion, draft, and submission state stays inside the component.

- [ ] **Step 1: Strengthen the existing notes isolation test**

Assert that the comments query includes both `contentItemId` and authenticated `userId`, and that create obtains `userId` only from `c.get("userId")`.

Run: `pnpm --filter @club/api test -- learningNotesRoute.test.ts`

Expected: PASS only when existing isolation remains explicit.

- [ ] **Step 2: Write failing component tests**

```ts
expect(getLessonComments).not.toHaveBeenCalled();
await fireEvent.click(screen.getByRole("button", { name: "Открыть мои заметки" }));
await waitFor(() => expect(getLessonComments).toHaveBeenCalledWith("lesson-1"));
await fireEvent.update(screen.getByRole("textbox", { name: "Новая заметка" }), "Важная мысль");
await fireEvent.click(screen.getByRole("button", { name: "Сохранить заметку" }));
expect(createLessonComment).toHaveBeenCalledWith("lesson-1", "Важная мысль");
```

Also test empty state, retry after load failure, trim/empty validation, 2000-character limit, duplicate-submit prevention, and the administration visibility hint.

- [ ] **Step 3: Implement the lazy notes component**

Use a disclosure button, fetch only on first expansion, prepend the returned created note after success, clear the draft, format dates in Russian, and expose retry within the block. Do not fetch notes for administrators previewing lessons.

- [ ] **Step 4: Mount notes in member lesson view**

Render `<LearningLessonNotes v-if="!canManageModules && selectedLessonItem.isPersisted" :lesson-id="selectedLessonItem.id" />` after lesson materials and before previous/next navigation. Remount on lesson id change through `:key`.

- [ ] **Step 5: Run notes and member integration tests**

Run: `pnpm --filter @club/web test -- learningLessonNotes.test.ts learningMemberContent.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/learning apps/api/src/learning/learningNotesRoute.test.ts
git commit -m "feat(learning): add personal lesson notes"
```

### Task 5: Release verification, responsive audit, and deployment readiness

**Files:**
- Modify: `apps/web/src/features/learning/learningMemberContent.test.ts`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Consumes: all functionality from Tasks 1–4.
- Produces: a releasable build with updated release metadata and cache version.

- [ ] **Step 1: Add integration coverage for the complete member flow**

Cover search → favorite → favorites filter → open lesson → add note → next lesson, while verifying the existing continue card remains singular.

- [ ] **Step 2: Run focused test suites**

Run: `pnpm --filter @club/shared test && pnpm --filter @club/api test && pnpm --filter @club/web test -- learningDiscovery.test.ts learningDiscoveryToolbar.test.ts useLearningFavorites.test.ts learningFavoriteButton.test.ts learningLessonNotes.test.ts learningMemberContent.test.ts learningPath.test.ts`

Expected: PASS.

- [ ] **Step 3: Run static checks and production build**

Run: `pnpm check && pnpm build`

Expected: PASS, including bundle budgets.

- [ ] **Step 4: Run browser/device checks**

Run the existing learning Playwright spec at 320×568, 390×844, 768×1024, 1024×768, and 1440×900. Verify no horizontal overflow, keyboard focus visibility, 44×44 px controls, filtering states, optimistic rollback, and notes retry.

- [ ] **Step 5: Update release metadata and re-run release checks**

Increment the app version, add a concise Russian release note for search/favorites/notes, increment the service-worker cache key, then run `pnpm test:e2e:release`.

Expected: PASS on configured release browsers.

- [ ] **Step 6: Commit the release**

```bash
git add apps/web/src/features/learning apps/web/src/features/app/releaseHistory.ts apps/web/public/sw.js packages/shared/src/release.ts tests
git commit -m "release: publish learning discovery tools"
```

- [ ] **Step 7: Deploy and verify production**

Push `main`, wait for the deployment workflow, verify `/health`, `/ready`, the installed release version, service-worker cache version, and the member learning flow without changing production learning content.
