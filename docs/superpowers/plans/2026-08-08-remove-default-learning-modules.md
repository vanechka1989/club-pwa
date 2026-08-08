# Remove Default Learning Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two historical seed learning modules and their demo lessons while preserving every human-created module.

**Architecture:** A new idempotent Drizzle SQL migration deletes categories by the two immutable seed slugs only. Existing foreign-key cascades remove their demo content; application query and UI code remain unchanged because they already display persisted API data without production fixtures.

**Tech Stack:** PostgreSQL, Drizzle migrations, TypeScript, Vitest, pnpm.

## Global Constraints

- Delete only `module-1-seed` and `module-2-seed`.
- Never identify deletion targets by title, description, publication state, or dates.
- Preserve human-created, archived, and draft modules.
- Keep historical migration `0017_delete_legacy_learning_content.sql` unchanged.
- Keep browser-only test fixtures because they are not used by the production application.

---

### Task 1: Add a regression test for the cleanup migration

**Files:**
- Create: `apps/api/src/learning/defaultModuleCleanupMigration.test.ts`

**Interfaces:**
- Consumes: migration files under `apps/api/drizzle` and `apps/api/drizzle/meta/_journal.json`.
- Produces: a contract requiring migration tag `0071_remove_default_learning_modules` and exact-slug deletion SQL.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";

const migrationUrl = new URL("../../drizzle/0071_remove_default_learning_modules.sql", import.meta.url);

describe("default learning module cleanup migration", () => {
  it("deletes only the two historical seed modules", () => {
    const sql = readFileSync(migrationUrl, "utf8");

    expect(sql).toContain('DELETE FROM "content_categories"');
    expect(sql).toContain('"slug" IN (\'module-1-seed\', \'module-2-seed\')');
    expect(sql).not.toContain('"title"');
    expect(sql).not.toContain('"description"');
  });

  it("registers the cleanup as migration 71", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0071_remove_default_learning_modules")).toMatchObject({
      idx: 71,
      version: "7"
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration fails**

Run: `pnpm --filter @club/api exec vitest run src/learning/defaultModuleCleanupMigration.test.ts`

Expected: FAIL because `0071_remove_default_learning_modules.sql` and its journal entry do not exist.

### Task 2: Implement the exact cleanup migration

**Files:**
- Create: `apps/api/drizzle/0071_remove_default_learning_modules.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/learning/defaultModuleCleanupMigration.test.ts`

**Interfaces:**
- Consumes: `content_categories.slug` and the existing `content_items.category_id ON DELETE CASCADE` relation.
- Produces: an idempotent migration that leaves all non-seed categories untouched.

- [ ] **Step 1: Create the minimal migration**

```sql
DELETE FROM "content_categories"
WHERE "slug" IN ('module-1-seed', 'module-2-seed');
```

- [ ] **Step 2: Register journal entry 71**

Append this entry after migration 70:

```json
{
  "idx": 71,
  "version": "7",
  "when": 1786183200000,
  "tag": "0071_remove_default_learning_modules",
  "breakpoints": true
}
```

- [ ] **Step 3: Run the focused test**

Run: `pnpm --filter @club/api exec vitest run src/learning/defaultModuleCleanupMigration.test.ts`

Expected: 2 tests pass.

- [ ] **Step 4: Verify no historical seed migration or fixture changed**

Run: `git diff --name-only`

Expected changed implementation files: only migration 71, the journal, and the new test. Migration 17 and `learningTestFixtures.ts` must not appear.

- [ ] **Step 5: Commit the cleanup**

```bash
git add apps/api/drizzle/0071_remove_default_learning_modules.sql apps/api/drizzle/meta/_journal.json apps/api/src/learning/defaultModuleCleanupMigration.test.ts
git commit -m "fix: remove default learning modules"
```

### Task 3: Verify and release the cleanup

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: the standard release metadata and automatic deployment workflow on `main`.
- Produces: the next visible release and a production deployment that applies migration 71.

- [ ] **Step 1: Run local verification**

Run:

```bash
pnpm --filter @club/api exec vitest run --testTimeout=15000
pnpm --filter @club/shared test
pnpm --filter @club/web test
pnpm -r check
pnpm -r build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Advance release metadata**

Move release 6.31 into history, publish version 6.32 titled `Только ваши модули`, describe the removal of built-in examples, and increment the service-worker cache from `club-pwa-v303` to `club-pwa-v304`. Update the two corresponding tests to expect 6.32 and cache 304.

- [ ] **Step 3: Verify release metadata**

Run: `pnpm --filter @club/web exec vitest run src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts && pnpm -r check && pnpm -r build`

Expected: all commands exit 0.

- [ ] **Step 4: Commit and push main**

```bash
git add packages/shared/src/release.ts apps/web/src/features/app/releaseHistory.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts apps/web/public/sw.js apps/web/src/features/app/pwa.test.ts
git commit -m "chore: release module cleanup v6.32"
git push origin main
```

- [ ] **Step 5: Wait for the deployment workflow and verify production**

Resolve the run and wait for it:

```bash
run_id="$(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --exit-status
```

Then verify:

- deployment status is `success` for the exact pushed commit;
- `/api/health` returns `{ "ok": true }`;
- `/api/ready` returns `{ "ok": true }`;
- `/sw.js` contains `club-pwa-v304`;
- the production JavaScript contains release `6.32` and `Только ваши модули`.

- [ ] **Step 6: Confirm a clean repository**

Run: `git status --short && git rev-parse HEAD && git rev-parse origin/main`

Expected: no status output and identical commit hashes.
