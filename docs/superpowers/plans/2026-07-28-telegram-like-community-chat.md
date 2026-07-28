# Telegram-like Community Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить существующий клубный чат в надёжный Telegram-подобный PWA-чат с синхронными непрочитанными, поиском, упоминаниями, черновиками, идемпотентной отправкой, 15-минутным редактированием/удалением и прямой безопасной загрузкой медиа в S3.

**Architecture:** PostgreSQL становится источником истины для прочитанной позиции, уведомлений, упоминаний и жизненного цикла удалённых сообщений. API сохраняет существующие проверки доступа и SSE/Redis realtime, добавляя небольшие изолированные доменные модули и курсорные маршруты. Vue-клиент оставляет один пользовательский экран, но делит 62-КБ `CommunitySection.vue` на компоненты и composables с явными props/events; локальный IndexedDB/localStorage слой отвечает только за черновики и очередь отправки.

**Tech Stack:** Vue 3, Pinia, TypeScript, Hono, Drizzle ORM, PostgreSQL 16, AWS SDK S3 presigned PUT/multipart, Redis/SSE, Web Push, Vitest, Testing Library Vue, Playwright, Docker Compose, ClamAV sidecar.

## Global Constraints

- Автор может изменить или удалить своё сообщение только в течение 15 минут после серверного `createdAt`.
- Обычный участник видит `Сообщение удалено`; модератор видит исходное содержимое 30 дней, затем содержимое и медиа очищаются окончательно.
- Режим уведомлений по умолчанию: только ответы и упоминания; варианты — `all`, `mentions`, `off`.
- Лимиты: изображение 15 МБ и не более 10 изображений; голосовое 30 МБ и 5 минут; видео 100 МБ; документ 50 МБ.
- Допустимые видео: MP4, MOV, WebM. Допустимые документы: PDF, DOCX, XLSX, PPTX. Архивы, HTML/SVG и исполняемые форматы запрещены.
- Медиа не проходят через память API: одиночные файлы используют presigned PUT, крупные — S3 multipart; API подтверждает object key, владельца, размер, MIME и сигнатуру.
- Документы недоступны до результата ClamAV; при недоступном сканере они остаются в карантине, а не выдаются пользователям.
- Поиск и сериализация всегда учитывают доступ к теме и статус сообщения.
- Пользовательский экран остаётся единым; внутреннее выделение компонентов не создаёт новой навигации.
- Поддерживаются ширины 320, 390, 768, 1024 и 1440 px, четыре темы приложения, экранные клавиатуры iPhone/Android и reduced motion.

---

### Task 1: Контракты и миграция данных чата

**Files:**
- Create: `apps/api/drizzle/0063_reliable_community_chat.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts:852-1000`
- Modify: `packages/shared/src/index.ts:836-980`
- Create: `packages/shared/src/communityChat.test.ts`
- Create: `apps/api/src/db/reliableCommunityChatSchema.test.ts`

**Interfaces:**
- Produces: `CommunityNotificationMode = "all" | "mentions" | "off"`.
- Produces: `ClubTopic.unreadCount`, `ClubTopic.notificationMode`, `ClubMessage.editedAt`, `ClubMessage.deletedByUserAt`, `ClubMessage.clientOperationId`, `ClubMessage.mentions`, attachment states and search response schemas.
- Consumes: existing `ClubTopic`, `ClubMessage`, `commentAuthorSchema`, `supportUploadedObjectSchema` patterns.

- [ ] **Step 1: Write failing shared-contract tests**

```ts
it("parses synchronized topic state", () => {
  const parsed = clubTopicSchema.parse({ ...topicFixture, unreadCount: 3, notificationMode: "mentions" });
  expect(parsed.unreadCount).toBe(3);
  expect(parsed.notificationMode).toBe("mentions");
});

it("parses edited and user-deleted messages", () => {
  const parsed = clubMessageSchema.parse({
    ...messageFixture,
    editedAt: "2026-07-28T01:00:00.000Z",
    deletedByUserAt: null,
    clientOperationId: "device-1:message-1",
    mentions: [{ userId: "user-2", displayName: "Анна", start: 7, end: 12 }]
  });
  expect(parsed.mentions[0]?.displayName).toBe("Анна");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @club/shared test -- src/communityChat.test.ts`

Expected: FAIL because the new fields and schemas do not exist.

- [ ] **Step 3: Add exact shared schemas**

```ts
export const communityNotificationModeSchema = z.enum(["all", "mentions", "off"]);
export const communityMentionSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).max(160),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive()
});
export const communityMessageSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  topicId: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
```

Extend topic/message responses and add exact request/response schemas for read position, notification settings, search, edit/delete, participant suggestions, upload intents and completed objects.

- [ ] **Step 4: Write the migration and Drizzle tables**

The migration must create:

```sql
CREATE TABLE "community_topic_reads" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "club_chat_topics"("id") ON DELETE CASCADE,
  "last_read_message_id" uuid REFERENCES "club_chat_messages"("id") ON DELETE SET NULL,
  "last_read_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_id")
);
CREATE TABLE "community_topic_notification_settings" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "club_chat_topics"("id") ON DELETE CASCADE,
  "mode" varchar(16) NOT NULL DEFAULT 'mentions' CHECK ("mode" IN ('all','mentions','off')),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_id")
);
CREATE TABLE "club_message_mentions" (
  "message_id" uuid NOT NULL REFERENCES "club_chat_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  PRIMARY KEY ("message_id", "user_id")
);
ALTER TABLE "club_chat_messages" ADD COLUMN "client_operation_id" varchar(96);
ALTER TABLE "club_chat_messages" ADD COLUMN "edited_at" timestamptz;
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_by_user_at" timestamptz;
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_content_expires_at" timestamptz;
ALTER TABLE "club_message_attachments" ADD COLUMN "file_name" varchar(255);
ALTER TABLE "club_message_attachments" ADD COLUMN "scan_status" varchar(16) NOT NULL DEFAULT 'ready';
ALTER TABLE "club_message_attachments" ADD COLUMN "scanned_at" timestamptz;
ALTER TABLE "club_message_attachments" ADD COLUMN "scan_error" varchar(160);
CREATE UNIQUE INDEX "club_chat_messages_user_operation_idx"
  ON "club_chat_messages" ("user_id", "client_operation_id")
  WHERE "client_operation_id" IS NOT NULL;
CREATE UNIQUE INDEX "club_message_attachments_object_key_idx" ON "club_message_attachments" ("object_key");
CREATE INDEX "club_chat_messages_search_idx"
  ON "club_chat_messages" USING gin (to_tsvector('simple', coalesce("body", '')));
CREATE INDEX "club_chat_messages_deleted_expiry_idx" ON "club_chat_messages" ("deleted_content_expires_at");
```

Add journal entry `idx: 63`, tag `0063_reliable_community_chat`, and matching Drizzle definitions/relations.

- [ ] **Step 5: Add schema-source regression tests and run GREEN**

Run: `pnpm --filter @club/shared test -- src/communityChat.test.ts && pnpm --filter @club/api test -- src/db/reliableCommunityChatSchema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/drizzle apps/api/src/db/schema.ts apps/api/src/db/reliableCommunityChatSchema.test.ts packages/shared/src/index.ts packages/shared/src/communityChat.test.ts
git commit -m "feat: add reliable community chat data model"
```

### Task 2: Изолированные доменные правила

**Files:**
- Create: `apps/api/src/community/readState.ts`
- Create: `apps/api/src/community/readState.test.ts`
- Create: `apps/api/src/community/messageLifecycle.ts`
- Create: `apps/api/src/community/messageLifecycle.test.ts`
- Create: `apps/api/src/community/mentions.ts`
- Create: `apps/api/src/community/mentions.test.ts`
- Create: `apps/api/src/community/notificationPolicy.ts`
- Create: `apps/api/src/community/notificationPolicy.test.ts`

**Interfaces:**
- Produces: `advanceReadPosition(current, candidate)`, `canAuthorMutateMessage(message, userId, now)`, `getDeletedContentExpiry(now)`, `serializeDeletedBody(input)`, `validateMentionRanges(body, candidates)`, `shouldNotifyCommunityUser(input)`.
- Consumes: Task 1 notification and mention types.

- [ ] **Step 1: Write failing tests for time and visibility rules**

```ts
expect(canAuthorMutateMessage(messageAt("10:00"), "owner", at("10:14:59"))).toBe(true);
expect(canAuthorMutateMessage(messageAt("10:00"), "owner", at("10:15:01"))).toBe(false);
expect(serializeDeletedBody({ moderator: false, originalBody: "secret", purged: false })).toBe("Сообщение удалено");
expect(serializeDeletedBody({ moderator: true, originalBody: "secret", purged: false })).toBe("secret");
expect(getDeletedContentExpiry(at("2026-07-28T00:00:00Z")).toISOString()).toBe("2026-08-27T00:00:00.000Z");
```

- [ ] **Step 2: Write failing tests for read monotonicity, mentions and notification modes**

```ts
expect(advanceReadPosition(currentAt("12:00"), candidateAt("11:59"))).toEqual(currentAt("12:00"));
expect(validateMentionRanges("Привет, @Анна", [{ userId, displayName: "Анна", start: 8, end: 13 }])).toEqual([{ userId, start: 8, end: 13 }]);
expect(shouldNotifyCommunityUser({ mode: "mentions", mentioned: false, replied: false })).toBe(false);
expect(shouldNotifyCommunityUser({ mode: "mentions", mentioned: true, replied: false })).toBe(true);
```

- [ ] **Step 3: Run and verify RED**

Run: `pnpm --filter @club/api test -- src/community/readState.test.ts src/community/messageLifecycle.test.ts src/community/mentions.test.ts src/community/notificationPolicy.test.ts`

- [ ] **Step 4: Implement pure functions with no database access**

```ts
export const authorMutationWindowMs = 15 * 60 * 1000;
export const deletedContentRetentionMs = 30 * 24 * 60 * 60 * 1000;

export function canAuthorMutateMessage(message: { userId: string; createdAt: Date; deletedByUserAt: Date | null }, userId: string, now = new Date()) {
  return message.userId === userId && !message.deletedByUserAt && now.getTime() - message.createdAt.getTime() <= authorMutationWindowMs;
}
```

Reject overlapping/out-of-range mention spans and notification to the sender.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter @club/api test -- src/community/readState.test.ts src/community/messageLifecycle.test.ts src/community/mentions.test.ts src/community/notificationPolicy.test.ts`

```bash
git add apps/api/src/community
git commit -m "feat: define community chat lifecycle rules"
```

### Task 3: Безопасное внутреннее разделение Vue-чата

**Files:**
- Create: `apps/web/src/features/community/ChatTopicList.vue`
- Create: `apps/web/src/features/community/ChatRoom.vue`
- Create: `apps/web/src/features/community/ChatMessage.vue`
- Create: `apps/web/src/features/community/ChatComposer.vue`
- Create: `apps/web/src/features/community/ChatModerationMenu.vue`
- Create: `apps/web/src/features/community/communityViewModel.ts`
- Create: `apps/web/src/features/community/communityComponentBoundaries.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/communityArchive.test.ts`
- Modify: `apps/web/src/features/community/communityMediaUi.test.ts`
- Modify: `apps/web/src/features/community/adminOnlyTopicsUi.test.ts`

**Interfaces:**
- Produces: presentational components with typed props/events; no API calls inside `ChatMessage.vue` or `ChatTopicList.vue`.
- `ChatMessage` emits `reply`, `react`, `open-actions`, `jump-reply`, `poll-vote`, `poll-close`.
- `ChatComposer` emits `send-text`, `send-voice`, `send-files`, `create-poll`, `draft-change`.
- Consumes: current ClubMessage/ClubTopic and existing voice/image/poll components.

- [ ] **Step 1: Add a failing boundary test**

```ts
expect(sectionSource.length).toBeLessThan(45_000);
expect(messageSource).not.toContain("@/api/client");
expect(topicListSource).not.toContain("@/api/client");
expect(sectionSource).toContain("<ChatTopicList");
expect(sectionSource).toContain("<ChatRoom");
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @club/web test -- src/features/community/communityComponentBoundaries.test.ts`

- [ ] **Step 3: Extract one component at a time without changing copy or behavior**

Define the stable message action payload:

```ts
export type ChatMessageAction =
  | { type: "reply"; message: ClubMessage }
  | { type: "react"; message: ClubMessage; reaction: VisibleMessageReaction }
  | { type: "open-actions"; message: ClubMessage }
  | { type: "jump-reply"; messageId: string };
```

Keep API/realtime orchestration in `CommunitySection.vue`; move only rendering and local interaction state.

- [ ] **Step 4: Update old source-string tests to assert the new owning files**

Do not delete coverage for 44-pixel controls, pinned-message accessibility, iPhone composer stability, archive labels, admin-only topics or reaction placement.

- [ ] **Step 5: Run focused and full community tests**

Run: `pnpm --filter @club/web test -- src/features/community`

Expected: all existing community behavior remains green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/community
git commit -m "refactor: split community chat presentation"
```

### Task 4: Серверные непрочитанные и настройки тем

**Files:**
- Create: `apps/api/src/community/topicStateRepository.ts`
- Create: `apps/api/src/community/topicStateRepository.test.ts`
- Create: `apps/api/src/community/topicStateRoutes.test.ts`
- Modify: `apps/api/src/routes/community.ts:180-900`
- Modify: `apps/web/src/api/client.ts:180-320`

**Interfaces:**
- Produces: `POST /community/topics/:id/read` body `{ messageId }`.
- Produces: `PUT /community/topics/:id/notification-settings` body `{ mode }`.
- Produces: topic serialization with `unreadCount` and `notificationMode`.
- Consumes: Task 1 tables and Task 2 monotonic read rule.

- [ ] **Step 1: Write failing repository tests**

Cover: first read insert, forward-only upsert, candidate must belong to topic, unread counts exclude system/hidden/user-deleted messages, member cannot read admin-only topic.

```ts
await repository.markRead({ userId, topicId, messageId: newerId });
await repository.markRead({ userId, topicId, messageId: olderId });
expect(await repository.getReadMessageId(userId, topicId)).toBe(newerId);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/api test -- src/community/topicStateRepository.test.ts src/community/topicStateRoutes.test.ts`

- [ ] **Step 3: Implement aggregated topic state without N+1 queries**

Use one grouped unread query for all accessible topic ids and one settings/read query. Do not issue a query per topic.

- [ ] **Step 4: Add routes with existing `getAccessibleTopic` and rate limiting**

Return the authoritative `{ unreadCount, lastReadMessageId, notificationMode }` after each mutation and publish a targeted realtime refresh event.

- [ ] **Step 5: Add typed web client methods and run GREEN**

Run: `pnpm --filter @club/api test -- src/community/topicStateRepository.test.ts src/community/topicStateRoutes.test.ts && pnpm --filter @club/web check`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/community apps/api/src/routes/community.ts apps/web/src/api/client.ts
git commit -m "feat: synchronize community unread state"
```

### Task 5: Безопасный поиск и переход к сообщению

**Files:**
- Create: `apps/api/src/community/messageSearch.ts`
- Create: `apps/api/src/community/messageSearch.test.ts`
- Create: `apps/api/src/community/messageSearchRoutes.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `GET /community/messages/search?q=&topicId=&before=&limit=`.
- Produces: `GET /community/topics/:topicId/messages/:messageId/context?before=20&after=20`.
- Search result: `{ messageId, topicId, topicTitle, author, excerpt, createdAt }`.
- Consumes: Task 1 GIN index and access helpers.

- [ ] **Step 1: Write failing query-builder and route tests**

```ts
expect(buildSearchTokens("  привет   анна ")).toEqual(["привет", "анна"]);
expect(routeSource).toContain("to_tsvector('simple'");
expect(routeSource).toContain("isTopicAccessibleForRole");
```

Test that a member cannot discover admin-only, hidden, user-deleted or quarantined content and that the result page is capped at 50.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/api test -- src/community/messageSearch.test.ts src/community/messageSearchRoutes.test.ts`

- [ ] **Step 3: Implement parameterized PostgreSQL full-text search**

Use `websearch_to_tsquery('simple', query)` and a secondary normalized author-name match. Return a bounded highlighted excerpt generated as text, never raw HTML.

- [ ] **Step 4: Implement context loading by stable message id**

Load the target plus bounded rows before/after in the same accessible topic. A purged or inaccessible target returns 404.

- [ ] **Step 5: Add clients, run GREEN and commit**

Run: `pnpm --filter @club/api test -- src/community/messageSearch.test.ts src/community/messageSearchRoutes.test.ts && pnpm --filter @club/web check`

```bash
git add apps/api/src/community apps/api/src/routes/community.ts apps/web/src/api/client.ts
git commit -m "feat: add secure community message search"
```

### Task 6: Идемпотентная отправка, упоминания, редактирование и удаление

**Files:**
- Create: `apps/api/src/community/messageMutationService.ts`
- Create: `apps/api/src/community/messageMutationService.test.ts`
- Create: `apps/api/src/community/messageMutationRoutes.test.ts`
- Create: `apps/api/src/community/deletedMessageCleanup.ts`
- Create: `apps/api/src/community/deletedMessageCleanup.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/backgroundJobs.ts`
- Modify: `apps/api/src/community/messageMetadata.ts`
- Modify: `apps/api/src/notifications/create.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: idempotent `POST /topics/:id/messages` with `{ body, replyToMessageId, clientOperationId, mentions }`.
- Produces: `PATCH /community/messages/:id` and `DELETE /community/messages/:id`.
- Produces: `GET /community/participants?q=&limit=20` for mention suggestions.
- Consumes: Tasks 1–2 contracts/rules and Task 4 notification setting.

- [ ] **Step 1: Write failing idempotency and permission tests**

```ts
const first = await service.createText(input({ clientOperationId: "device:a" }));
const retry = await service.createText(input({ clientOperationId: "device:a" }));
expect(retry.id).toBe(first.id);
expect(insertMessage).toHaveBeenCalledTimes(1);
```

Cover author at 14:59/15:01, moderator visibility, replies to deleted messages, mention range validation and sender-notification suppression.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/api test -- src/community/messageMutationService.test.ts src/community/messageMutationRoutes.test.ts src/community/deletedMessageCleanup.test.ts`

- [ ] **Step 3: Move text-message mutation into a transaction service**

In one transaction: validate topic/reply/mentions, insert-or-load by `(userId, clientOperationId)`, insert mention rows, then publish realtime only for a newly inserted message.

- [ ] **Step 4: Implement edit/delete and role-aware serialization**

On author delete set `deletedByUserAt` and `deletedContentExpiresAt`; do not reuse moderation `status`. Serialize placeholder for members and original content plus deletion metadata only for users with community moderation permission.

- [ ] **Step 5: Implement notification fanout**

Notify reply target and validated mentions once. For `all`, notify other subscribed users; for `mentions`, notify only reply/mention targets; for `off`, do not notify. Reuse existing app notification/Web Push pipeline and deduplicate by message/user/reason.

- [ ] **Step 6: Add 30-day cleanup job**

The job deletes retained S3 objects first, then blanks body/mention rows and sets attachments deleted. It must be idempotent, bounded per run and log ids/counts without original message content.

- [ ] **Step 7: Run GREEN and commit**

Run: `pnpm --filter @club/api test -- src/community/messageMutationService.test.ts src/community/messageMutationRoutes.test.ts src/community/deletedMessageCleanup.test.ts`

```bash
git add apps/api/src/community apps/api/src/routes/community.ts apps/api/src/backgroundJobs.ts apps/api/src/notifications apps/web/src/api/client.ts
git commit -m "feat: add reliable community message mutations"
```

### Task 7: Прямая S3-загрузка и карантин документов

**Files:**
- Create: `apps/api/src/community/directUpload.ts`
- Create: `apps/api/src/community/directUpload.test.ts`
- Create: `apps/api/src/community/documentScanner.ts`
- Create: `apps/api/src/community/documentScanner.test.ts`
- Create: `apps/api/src/community/directUploadRoutes.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/storage/s3.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/backgroundJobs.ts`
- Modify: `apps/api/Dockerfile`
- Modify: `docker-compose.prod.yml`
- Modify: `docker-compose.scale.yml`
- Modify: `apps/api/src/deploy/securityConfig.test.ts`
- Modify: `apps/api/src/deploy/updateScript.test.ts`
- Create: `apps/web/src/features/community/directUpload.ts`
- Create: `apps/web/src/features/community/directUpload.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: upload intent `{ uploadToken, objectKey, uploadUrl | multipart, contentType, sizeBytes, expiresAt }`.
- Produces: completed object `{ uploadToken, objectKey, fileName, contentType, sizeBytes, kind }`.
- Produces: ClamAV scan result `clean | infected | unavailable`.
- Consumes: existing `createObjectUploadUrl`, multipart S3 functions and metadata verification helper.

- [ ] **Step 1: Write failing policy/ownership/signature tests**

```ts
expect(getCommunityUploadError(file("clip.mp4", "video/mp4", 100 * MiB))).toBeNull();
expect(getCommunityUploadError(file("clip.mp4", "video/mp4", 100 * MiB + 1))).toBe("file_too_large");
expect(validateCommunityObject({ userId: "u1", objectKey: "community/pending/u2/x" })).toEqual({ ok: false, error: "foreign_object" });
```

Test false MIME headers, executable/ZIP/SVG/HTML rejection, expired intent, reused object key, excessive part count and missing ClamAV.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/api test -- src/community/directUpload.test.ts src/community/documentScanner.test.ts src/community/directUploadRoutes.test.ts`

- [ ] **Step 3: Implement short-lived presigned PUT and multipart intents**

Generate keys only as `community/pending/<userId>/<date>/<token>-<safe-name>`. Files at or below 25 MiB use presigned PUT; larger files use 8-MiB multipart parts with no more than four concurrent uploads client-side. Completion verifies `HeadObject` metadata and consumes each key once.

- [ ] **Step 4: Implement content verification and attachment creation**

Read only bounded leading bytes for magic-number checks. Images are normalized after upload in a bounded worker; voice conversion has a semaphore of 2 and a 60-second timeout. Video is served only after signature verification. Documents enter `scanning` and are unavailable through signed read URLs until clean.

- [ ] **Step 5: Add ClamAV sidecar and fail-closed scanner**

Add `clamav/clamav:1.4` with private network exposure, healthcheck, `mem_limit: 768m`, `pids_limit: 256`, no public ports and persistent signature volume. Add `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310`; API readiness remains independent, but documents remain quarantined while scanner health is unavailable.

- [ ] **Step 6: Implement browser uploader and recovery**

```ts
export async function uploadCommunityFile(file: File, deps = productionDeps): Promise<CommunityUploadedObject> {
  const intent = await deps.createIntent(describeCommunityFile(file));
  return intent.multipart
    ? uploadMultipartWithConcurrency(file, intent, { concurrency: 4, partSize: 8 * MiB })
    : uploadPresignedPut(file, intent);
}
```

Persist multipart session metadata, not file bytes; allow resume while the user still has the selected File handle/session.

- [ ] **Step 7: Run focused security/infrastructure tests and commit**

Run: `pnpm --filter @club/api test -- src/community/directUpload.test.ts src/community/documentScanner.test.ts src/community/directUploadRoutes.test.ts src/deploy/securityConfig.test.ts src/deploy/updateScript.test.ts && pnpm --filter @club/web test -- src/features/community/directUpload.test.ts`

```bash
git add apps/api apps/web/src/features/community apps/web/src/api/client.ts docker-compose.prod.yml docker-compose.scale.yml
git commit -m "feat: secure community media uploads"
```

### Task 8: Клиентское состояние черновиков, outbox и чтения

**Files:**
- Create: `apps/web/src/features/community/communityDrafts.ts`
- Create: `apps/web/src/features/community/communityDrafts.test.ts`
- Create: `apps/web/src/features/community/communityOutbox.ts`
- Create: `apps/web/src/features/community/communityOutbox.test.ts`
- Create: `apps/web/src/features/community/useCommunityTopicState.ts`
- Create: `apps/web/src/features/community/useCommunityTopicState.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`

**Interfaces:**
- Produces: `loadDraft(topicId)`, `saveDraft(topicId, text)`, `queueTextMessage(input)`, `retryQueuedMessage(localId)`, `removeQueuedMessage(localId)`.
- Produces: per-topic authoritative unread/settings state and debounced `markVisibleMessageRead(messageId)`.
- Consumes: Tasks 4 and 6 API clients.

- [ ] **Step 1: Write failing persistence and idempotency tests**

```ts
saveDraft("topic-a", "Первый");
saveDraft("topic-b", "Второй");
expect(loadDraft("topic-a")).toBe("Первый");
expect(createDeliveryKey("device-1", "local-1")).toBe("device-1:local-1");
```

Cover corrupt storage, per-user namespace, logout clearing, retry with same delivery key and merge of realtime confirmation with optimistic message.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/web test -- src/features/community/communityDrafts.test.ts src/features/community/communityOutbox.test.ts src/features/community/useCommunityTopicState.test.ts`

- [ ] **Step 3: Implement bounded local persistence**

Store drafts and text outbox only, capped at 50 topics and 100 queued messages, scoped by current user id. Never persist signed S3 URLs or media bytes.

- [ ] **Step 4: Implement visible-read tracking**

Use `IntersectionObserver` for the last visible server message; debounce 400 ms and only advance. Flush when visibility changes or room closes.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter @club/web test -- src/features/community/communityDrafts.test.ts src/features/community/communityOutbox.test.ts src/features/community/useCommunityTopicState.test.ts`

```bash
git add apps/web/src/features/community
git commit -m "feat: persist community drafts and outbox"
```

### Task 9: Непрочитанные, поиск и настройки в интерфейсе

**Files:**
- Modify: `apps/web/src/features/community/ChatTopicList.vue`
- Modify: `apps/web/src/features/community/ChatRoom.vue`
- Create: `apps/web/src/features/community/ChatSearchPanel.vue`
- Create: `apps/web/src/features/community/ChatSearchPanel.test.ts`
- Create: `apps/web/src/features/community/ChatUnreadUi.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/features/community/communityRoute.css`

**Interfaces:**
- Produces: topic badges, notification selector, new-message divider, jump button and search task layer.
- Consumes: Tasks 4, 5 and 8.

- [ ] **Step 1: Write failing mounted component tests**

Test exact badge count, singular/plural accessible labels, default `mentions`, line before first unread, jump button, search debounce/result click and 404 result recovery.

```ts
expect(screen.getByRole("status", { name: "3 непрочитанных сообщения" })).toBeTruthy();
expect(screen.getByText("Новые сообщения")).toBeTruthy();
await fireEvent.click(screen.getByRole("button", { name: "Перейти к новым сообщениям" }));
expect(scrollTarget).toHaveBeenCalledWith("message-3");
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/web test -- src/features/community/ChatSearchPanel.test.ts src/features/community/ChatUnreadUi.test.ts`

- [ ] **Step 3: Implement mobile-first UI**

Keep search in a task layer/drawer inside the existing chat route. Notification mode lives in the topic header menu and uses radio semantics. Do not add a second bottom navigation item.

- [ ] **Step 4: Implement bounded scroll restoration**

Opening a topic positions at the first unread; a searched message uses context endpoint and highlight; loading older pages preserves pixel position.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter @club/web test -- src/features/community/ChatSearchPanel.test.ts src/features/community/ChatUnreadUi.test.ts src/features/community/communityArchive.test.ts`

```bash
git add apps/web/src/features/community
git commit -m "feat: add community unread and search UI"
```

### Task 10: Упоминания, отправка, редактирование и сообщения

**Files:**
- Create: `apps/web/src/features/community/ChatMentionPicker.vue`
- Create: `apps/web/src/features/community/ChatMentionPicker.test.ts`
- Modify: `apps/web/src/features/community/ChatComposer.vue`
- Modify: `apps/web/src/features/community/ChatMessage.vue`
- Modify: `apps/web/src/features/community/ChatModerationMenu.vue`
- Create: `apps/web/src/features/community/ChatMessageInteractions.test.ts`
- Modify: `apps/web/src/features/community/communityViewModel.ts`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Produces: mention selection with character ranges, optimistic states `sending | failed | sent`, edit mode and user-delete action.
- Consumes: Tasks 6 and 8.

- [ ] **Step 1: Write failing behavior tests**

Cover `@` suggestions, keyboard selection, failed retry, same delivery key, 15-minute menu visibility, edited label, member/admin deletion views, grouped author messages, day dividers, long-press reactions and explicit keyboard menu.

```ts
expect(screen.getByText("Не отправлено")).toBeTruthy();
await fireEvent.click(screen.getByRole("button", { name: "Повторить отправку" }));
expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ clientOperationId: originalKey }));
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/web test -- src/features/community/ChatMentionPicker.test.ts src/features/community/ChatMessageInteractions.test.ts`

- [ ] **Step 3: Implement composer and optimistic states**

Restore per-topic draft on room switch. Clear only after authoritative success. Preserve unsent text when API/search/settings fail.

- [ ] **Step 4: Implement message grouping and actions**

Group only adjacent messages from the same author within five minutes and same day; never merge system messages. Short click remains inert, swipe replies, long press opens action sheet, and a visible accessible menu button offers identical actions.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter @club/web test -- src/features/community/ChatMentionPicker.test.ts src/features/community/ChatMessageInteractions.test.ts src/features/community/communityMediaUi.test.ts`

```bash
git add apps/web/src/features/community
git commit -m "feat: improve community message interactions"
```

### Task 11: Новый редактор медиа и состояния карантина

**Files:**
- Create: `apps/web/src/features/community/ChatAttachmentDraft.vue`
- Create: `apps/web/src/features/community/ChatAttachmentDraft.test.ts`
- Create: `apps/web/src/features/community/ChatFileMessage.vue`
- Create: `apps/web/src/features/community/ChatFileMessage.test.ts`
- Modify: `apps/web/src/features/community/ChatComposer.vue`
- Modify: `apps/web/src/features/community/ChatMessage.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Create: `apps/web/src/stores/communityUploads.ts`
- Create: `apps/web/src/stores/communityUploads.test.ts`

**Interfaces:**
- Produces: gallery/camera/video/document choices, per-file progress, cancel/retry/resume, video player, safe document download and scanning/rejected states.
- Consumes: Task 7 uploader.

- [ ] **Step 1: Write failing component tests**

Test policy errors, progress, cancel, retry, refresh recovery metadata, `scanning` disabled download, `rejected` copy, expired objects and no rendering of arbitrary HTML/SVG.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @club/web test -- src/features/community/ChatAttachmentDraft.test.ts src/features/community/ChatFileMessage.test.ts`

- [ ] **Step 3: Implement attachment draft and message renderers**

Show filename, human-readable size, progress and one primary action. Do not nest a card inside the chat bubble. Video uses `playsinline`; documents open only a server-issued signed read URL after `ready`.

- [ ] **Step 4: Replace legacy multipart image/voice routes in the client**

Keep old API routes temporarily for backwards-compatible in-flight clients, but new version must call only upload-intent/completion endpoints. Mark legacy routes deprecated and retain their current bounds until a later removal release.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter @club/web test -- src/features/community/ChatAttachmentDraft.test.ts src/features/community/ChatFileMessage.test.ts src/features/community/communityMediaUi.test.ts src/features/community/voiceUpload.test.ts`

```bash
git add apps/web/src/features/community apps/web/src/stores
git commit -m "feat: add resilient community attachments"
```

### Task 12: Безопасность, нагрузка и сквозные сценарии

**Files:**
- Create: `apps/api/src/community/communitySecurityIntegration.test.ts`
- Create: `apps/api/src/community/communityLoadModel.test.ts`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `apps/api/src/deploy/pwaQuality.test.ts`

**Interfaces:**
- Produces: release gates proving permissions, resource bounds and multi-device behavior.
- Consumes: all previous tasks.

- [ ] **Step 1: Add failing security integration tests**

Cover IDOR across topic/message/object keys, forged mention ids/ranges, backward read updates, duplicate operation keys, edit-window boundary, deleted-content role leakage, search leakage, signed URL expiry, MIME spoofing, quarantine bypass and rate limits.

- [ ] **Step 2: Add failing bounded-load tests**

Assert topic list uses bounded aggregate queries, message/search pages are capped, cleanup batches are capped, realtime events contain ids rather than message histories, upload concurrency is four, voice conversion concurrency is two, and API routes do not call `formData()` for new community media.

- [ ] **Step 3: Add Playwright scenarios**

Scenarios: two browser contexts synchronize unread/read; offline text becomes failed and retries without duplicate; search jumps to an older message; mention notification setting; edit/delete views; keyboard does not double-scroll composer; 320 px has no overflow; long press and keyboard menu both work.

- [ ] **Step 4: Run focused gates and fix only evidenced failures**

Run:

```bash
pnpm --filter @club/api test -- src/community
pnpm --filter @club/web test -- src/features/community
pnpm test:e2e:release
```

Expected: 0 failures; platform-specific iPhone keyboard cases may remain explicitly skipped outside WebKit exactly as existing config defines.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/community apps/api/src/deploy tests/e2e playwright.release.config.ts
git commit -m "test: cover reliable community chat release"
```

### Task 13: Релиз 5.79 и production

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: version `5.79`, PWA cache `club-pwa-v251`, Russian/English release notes.
- Consumes: completed and reviewed Tasks 1–12.

- [ ] **Step 1: Write failing release tests**

```ts
expect(appVersion).toBe("5.79");
expect(releaseNotes[0]?.title).toBe("Надёжный и удобный клубный чат");
expect(worker).toContain('const cacheName = "club-pwa-v251"');
```

- [ ] **Step 2: Run RED, then update release metadata**

Move 5.78 into history. Russian items must mention synchronized unread, reliable messages/search and safe direct media. English current notes must contain no Cyrillic.

- [ ] **Step 3: Run complete local verification**

Run separately and require exit code 0:

```bash
pnpm check
pnpm test
pnpm build
pnpm test:e2e:release
```

Run the PWA visual audit for 320, 390, 768, 1024 and 1440 px across all configured themes/light-dark modes. Inspect screenshots for topic list, long history, search, composer with keyboard, failed send, media progress and moderation view.

- [ ] **Step 4: Review migration/deployment safety**

Verify backup-before-migration, additive columns/tables, ClamAV health behavior, rollback compatibility with the old web client, object cleanup dry-run, Docker memory totals and production free memory. Do not deploy if the server cannot keep PostgreSQL, API, web, Caddy, Redis and ClamAV within safe memory headroom.

- [ ] **Step 5: Commit, merge and push**

```bash
git add packages/shared/src/release.ts apps/web/src/features/app apps/web/public/sw.js
git commit -m "chore: publish reliable community chat release"
git merge --ff-only feat/reliable-community-chat
git push origin main
```

- [ ] **Step 6: Wait for exact-SHA deployment and verify production**

Require successful `Deploy to VPS`, `PWA device regression` and image-publication workflows for the pushed SHA. Verify:

```text
GET /                         -> 200
GET /api/health               -> {"ok":true}
GET /api/ready                -> {"ok":true}
GET /sw.js                    -> contains club-pwa-v251
production JS assets          -> contain 5.79 and Надёжный и удобный клубный чат
```

Use authenticated read-only checks to verify topic unread/settings responses, search bounds and a clean document scanner health state. Do not create production chat messages or uploads solely for smoke testing.

- [ ] **Step 7: Clean owned worktree and report**

Remove only the implementation worktree created under `.worktrees/`, prune it and delete the merged feature branch. Report implemented behavior, security/load decisions, test totals, deployment workflow URL, production health and any non-blocking follow-up.
