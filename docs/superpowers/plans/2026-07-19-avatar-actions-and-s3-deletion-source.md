# Avatar Actions And S3 Deletion Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the profile photo action beside the name editor, make the avatar invoke the same action, and show a durable human-readable source for deleted S3 files, including best-effort enrichment of old logs.

**Architecture:** Keep the existing avatar upload and crop flows, but route both UI triggers through one handler and hidden file input. Extend the existing batch S3 metadata resolver into a structured source resolver used before deletion and while serializing old audit rows. Keep the public action-log schema compatible by storing the snapshot in `metadata`, then format it in a focused frontend presenter.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod-compatible JSON metadata, Vitest, existing CSS token system.

## Global Constraints

- Preserve existing avatar upload validation, crop behavior, and API contracts.
- New deletion logs must retain their source after related content is removed.
- Old deletion logs must be enriched when database links still exist.
- Source lookup failure must never prevent S3 deletion.
- Never store S3 credentials, signed URLs, or other secrets in audit metadata.
- Maintain a minimum 44 × 44 px tap target and avoid horizontal overflow.

---

### Task 1: Unified Profile Photo Actions

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/ProfileSection.layout.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing `avatarPhotoMenuOpen`, `avatarSaving`, `handleAvatarUpload`, and `openAvatarEditor` state/actions.
- Produces: `openAvatarPhotoActions(): void`, used by both the avatar button and the camera button.

- [ ] **Step 1: Write the failing layout and interaction source tests**

Add assertions that the large avatar is a button, both triggers call `openAvatarPhotoActions`, the camera lives inside `profile-display-name-row`, and the old overlay button is absent:

```ts
expect(source).toContain('class="profile-avatar profile-avatar-large profile-avatar-trigger"');
expect(source.match(/@click="openAvatarPhotoActions"/g)).toHaveLength(2);
expect(source).toMatch(/profile-display-name-row[\s\S]*profile-avatar-icon-button/);
expect(source).not.toContain("profile-avatar-menu-button");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- ProfileSection.layout.test.ts`

Expected: FAIL because the avatar is a `div`, the camera is an overlay, and `openAvatarPhotoActions` does not exist.

- [ ] **Step 3: Implement the shared action and markup**

Add a file-input ref and shared handler:

```ts
const avatarUploadInput = ref<HTMLInputElement | null>(null);

function openAvatarPhotoActions() {
  if (avatarSaving.value) return;
  if (session.user?.photoUrl) {
    avatarPhotoMenuOpen.value = true;
    return;
  }
  avatarUploadInput.value?.click();
}
```

Render the avatar as a button, move the camera next to the name pencil, and connect both to the handler. Keep one hidden input available for accounts without a photo.

- [ ] **Step 4: Update focused styles**

Remove overlay positioning from the camera action, keep `.profile-avatar-trigger` visually neutral, and preserve a 44 px interactive area beside the pencil without changing the visible avatar crop.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm --filter @club/web test -- ProfileSection.layout.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/profile/ProfileSection.vue apps/web/src/features/profile/ProfileSection.layout.test.ts apps/web/src/styles.css
git commit -m "fix(profile): unify avatar photo actions"
```

### Task 2: Structured S3 Source Classification

**Files:**
- Create: `apps/api/src/storage/s3ObjectSource.ts`
- Create: `apps/api/src/storage/s3ObjectSource.test.ts`

**Interfaces:**
- Consumes: `classifyS3ObjectKey(key)` from `apps/api/src/storage/s3Object.ts`.
- Produces: `S3ObjectSourceSnapshot` and `createFallbackS3ObjectSource(key: string): S3ObjectSourceSnapshot`.

- [ ] **Step 1: Write failing fallback classification tests**

Test the exact structured output for learning video, community voice, and unknown paths:

```ts
expect(createFallbackS3ObjectSource("community/voice/a.webm")).toEqual({
  category: "community",
  categoryLabel: "Общение",
  fileKind: "Голосовое сообщение",
  sourceKind: "community",
  sourceTitle: null,
  parentTitle: null,
  resolved: false
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/api test -- s3ObjectSource.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Add the minimal pure types and fallback factory**

```ts
export type S3ObjectSourceSnapshot = {
  category: S3ObjectCategory;
  categoryLabel: string;
  fileKind: string;
  sourceKind: "learning" | "lesson_material" | "community" | "support" | "mailing" | "notification" | "other";
  sourceTitle: string | null;
  parentTitle: string | null;
  resolved: boolean;
};
```

Use `classifyS3ObjectKey` to populate the common fields and map its category to the fallback `sourceKind`.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --filter @club/api test -- s3ObjectSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage/s3ObjectSource.ts apps/api/src/storage/s3ObjectSource.test.ts
git commit -m "feat(storage): define S3 object source snapshots"
```

### Task 3: Resolve Database Links And Persist Deletion Snapshots

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/deploy/updateScript.test.ts`
- Create: `apps/api/src/admin/s3DeletionAudit.test.ts`

**Interfaces:**
- Consumes: `S3ObjectSourceSnapshot` and `createFallbackS3ObjectSource` from Task 2.
- Produces: `buildS3ObjectMetadata(keys: string[]): Promise<Map<string, { entityTitle: string | null; uploadedBy: AdminActionActor | null; source: S3ObjectSourceSnapshot }>>`.

- [ ] **Step 1: Write failing structural regression tests**

Require the resolver to query `contentItems`, `lessonMaterials` with their parent item, `clubMessageAttachments` with message/topic, support attachments, notifications, and mailings. Require deletion to call the resolver before `deleteObject` and store `source` in metadata.

```ts
expect(adminRoute).toContain("db.query.lessonMaterials.findMany");
expect(adminRoute).toContain("db.query.clubMessageAttachments.findMany");
expect(deleteBlock.indexOf("buildS3ObjectMetadata")).toBeLessThan(deleteBlock.indexOf("deleteObject"));
expect(deleteBlock).toContain("source:");
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/api test -- s3DeletionAudit.test.ts updateScript.test.ts`

Expected: FAIL because nested lesson materials, community attachments, and source snapshots are not covered.

- [ ] **Step 3: Expand the batch resolver**

For every key, seed fallback metadata. Overlay exact links with these rules:

```ts
// contentItems media/thumbnail: sourceKind "learning", sourceTitle item.title
// lessonMaterials media: sourceKind "lesson_material", sourceTitle material.title, parentTitle item.title
// clubMessageAttachments: sourceKind "community", sourceTitle topic.title
// support: sourceKind "support", sourceTitle ticket topic
// mailing/notification: matching sourceKind and title
```

Retain current `entityTitle` and `uploadedBy` values for the S3 browser.

- [ ] **Step 4: Snapshot source before deletion**

Resolve the single key in a guarded block before calling `deleteObject`. Record:

```ts
metadata: {
  key: body.data.key,
  source: resolvedMetadata?.source ?? createFallbackS3ObjectSource(body.data.key)
}
```

Keep source-resolution failure non-blocking and continue with fallback classification.

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm --filter @club/api test -- s3DeletionAudit.test.ts updateScript.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/admin/s3DeletionAudit.test.ts apps/api/src/deploy/updateScript.test.ts
git commit -m "feat(admin): capture deleted file sources"
```

### Task 4: Enrich Historical Deletion Logs

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/admin/s3DeletionAudit.test.ts`

**Interfaces:**
- Consumes: expanded `buildS3ObjectMetadata` from Task 3.
- Produces: settings-audit responses where old `storage.s3.object.deleted` rows receive an in-memory `metadata.source` fallback without rewriting stored rows.

- [ ] **Step 1: Add a failing test for historical enrichment**

Require `/settings-audit` to collect `metadata.key`/`entityId` from deletion logs lacking `metadata.source`, batch-resolve them, and merge the result only into the serialized response.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/api test -- s3DeletionAudit.test.ts`

Expected: FAIL because settings audit serializes stored metadata unchanged.

- [ ] **Step 3: Implement one batch enrichment pass**

Extract deletion keys, call the resolver once, and merge:

```ts
metadata: {
  ...log.metadata,
  source: storedSource ?? resolvedByKey.get(key)?.source ?? createFallbackS3ObjectSource(key)
}
```

Do not mutate database rows and do not query once per log.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --filter @club/api test -- s3DeletionAudit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/admin/s3DeletionAudit.test.ts
git commit -m "feat(admin): enrich historical S3 deletion logs"
```

### Task 5: Human-Readable Audit Presentation

**Files:**
- Modify: `apps/web/src/features/admin/adminAuditPresentation.ts`
- Modify: `apps/web/src/features/admin/adminAuditPresentation.test.ts`
- Modify: `apps/web/src/features/admin/AdminProjectSettingsPanel.vue`

**Interfaces:**
- Consumes: `AdminActionLog.metadata.key` and `AdminActionLog.metadata.source`.
- Produces: `getS3DeletionPresentation(log): { source: string; key: string } | null`.

- [ ] **Step 1: Write failing presenter tests**

Cover lesson/card, community voice/topic, fallback classification, malformed metadata, and unrelated audit rows. Example:

```ts
expect(getS3DeletionPresentation(log)).toEqual({
  source: 'Источник: урок «Основы» · карточка «Видео 1»',
  key: "learning/video/file.mp4"
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/web test -- adminAuditPresentation.test.ts`

Expected: FAIL because the presenter does not exist.

- [ ] **Step 3: Implement defensive metadata parsing and formatting**

Use runtime type guards for all unknown metadata fields. Format every supported `sourceKind`, otherwise return the category/file-kind fallback. Never throw for malformed data.

- [ ] **Step 4: Render source and technical key separately**

For deletion events, use title `Удалён файл из S3`, render the source as the detail line, and render `S3: ${key}` as a separate muted code-like line. Keep existing `distinctAuditDetails` behavior for other events.

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm --filter @club/web test -- adminAuditPresentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/admin/adminAuditPresentation.ts apps/web/src/features/admin/adminAuditPresentation.test.ts apps/web/src/features/admin/AdminProjectSettingsPanel.vue
git commit -m "feat(admin): explain deleted file origins"
```

### Task 6: Integrated Verification And Release Note

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: completed profile and audit behavior.
- Produces: user-facing release note for the next existing release entry.

- [ ] **Step 1: Add failing release-note assertions**

Require the current Russian release entry to mention the camera beside the name editor, avatar click, and source labels for deleted attachments.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts`

Expected: FAIL until copy is updated.

- [ ] **Step 3: Update release-note copy and run focused tests**

Run:

```bash
pnpm --filter @club/web test -- ProfileSection.layout.test.ts adminAuditPresentation.test.ts releaseNotes.test.ts
pnpm --filter @club/api test -- s3ObjectSource.test.ts s3DeletionAudit.test.ts updateScript.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run repository verification**

Run:

```bash
pnpm check
pnpm test
```

Expected: both commands exit 0 with no failed tests.

- [ ] **Step 5: Inspect the final diff and commit**

```bash
git diff --check
git status --short
git add apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts
git commit -m "docs: announce avatar and audit source improvements"
```
