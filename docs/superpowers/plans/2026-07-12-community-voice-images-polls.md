# Community Voice, Images, and Polls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expiring voice messages, expiring image galleries, persistent admin media, chat polls, and poll analytics to the existing community chat.

**Architecture:** Extend chat messages with a discriminated kind, store media in a normalized attachment table, and store polls/options/votes in normalized poll tables. Keep the current community routes, membership checks, moderation, reactions, replies, polling refresh, and S3 adapter; add focused media-policy, upload, cleanup, poll, recorder, gallery, and analytics modules so the existing large route and Vue component only orchestrate them.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle/PostgreSQL, Zod, S3, Sharp, MediaRecorder, Vitest, pnpm workspace.

## Global Constraints

- User voice and image attachments expire exactly 30 days after upload.
- Admin and owner voice and image attachments have `expiresAt = null` and persist permanently based on the role at upload time.
- Voice duration is at most 300 seconds; image messages contain 1–10 files; each source image is at most 15 MB.
- Images are normalized to WebP, quality 82, maximum long edge 1600 px, with metadata removed.
- Deleted media leaves a stable message placeholder so replies, reactions, pins, and chat counts remain valid.
- Polls support 2–10 options, single or multiple selection, anonymous mode, optional closing time, vote changes before close, and early moderator close.
- Anonymous poll APIs never return voter identities, including to owner accounts.
- Existing text messages and APIs remain backward compatible.
- Mobile controls preserve 44 px minimum tap targets and do not overflow at 320 px.

---

### Task 1: Database schema and shared contracts

**Files:**
- Create: `apps/api/drizzle/0038_community_media_polls.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/db/communityMediaSchema.test.ts`
- Create: `packages/shared/src/communityMessages.test.ts`

**Interfaces:**
- Produces `ClubMessage.kind`, `ClubMessage.voice`, `ClubMessage.images`, and `ClubMessage.poll`.
- Produces Drizzle tables `clubMessageAttachments`, `clubPolls`, `clubPollOptions`, and `clubPollVotes`.

- [ ] Write failing schema tests asserting migration tables, `message_kind`, attachment expiry/indexes, poll foreign keys, vote uniqueness, and shared parsing for all four message kinds.
- [ ] Run `pnpm --filter @club/shared test -- communityMessages.test.ts` and `pnpm --filter @club/api test -- communityMediaSchema.test.ts`; expect failures because the contracts and migration do not exist.
- [ ] Add enum-compatible `message_kind` with default `text`; add attachment fields `kind`, `object_key`, `content_type`, `size_bytes`, `duration_seconds`, `width`, `height`, `sort_order`, `expires_at`, `deleted_at`; add poll, option, and vote tables with cascade deletes and unique constraints.
- [ ] Extend shared Zod schemas with concrete nullable objects for voice, images, poll results, user selections, and optional admin voter details.
- [ ] Run both focused tests; expect pass.

### Task 2: Media policy, upload validation, and cleanup

**Files:**
- Create: `apps/api/src/community/mediaPolicy.ts`
- Create: `apps/api/src/community/mediaPolicy.test.ts`
- Create: `apps/api/src/community/mediaUpload.ts`
- Create: `apps/api/src/community/mediaUpload.test.ts`
- Create: `apps/api/src/community/mediaCleanup.ts`
- Create: `apps/api/src/community/mediaCleanup.test.ts`
- Modify: `apps/api/src/storage/imageOptimizer.ts`
- Modify: `apps/api/src/storage/imageOptimizer.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Produces `getCommunityMediaExpiry(role, createdAt): Date | null`.
- Produces `prepareCommunityVoice(file)` and `prepareCommunityImages(files)` returning upload-ready objects.
- Produces `cleanupExpiredCommunityMedia(now)` and `startCommunityMediaCleanupJob()`.

- [ ] Write failing policy tests for user `+30 days`, admin/owner `null`, maximum voice/image limits, supported audio MIME normalization, WebP output, 1600 px sizing, and safe S3 keys under `community/voice/` and `community/images/`.
- [ ] Write failing cleanup tests proving expired S3 objects are deleted before database media fields are marked deleted, permanent attachments are skipped, and retries are idempotent.
- [ ] Run the three focused API test files; expect missing-module failures.
- [ ] Implement policy and upload helpers by reusing `optimizeImageForUpload`, extending it to decode supported HEIC/HEIF through Sharp and always emit WebP for community images.
- [ ] Implement a ten-minute cleanup job that selects due attachments, deletes S3 objects, marks rows deleted, and logs per-object failures without clearing failed rows.
- [ ] Register cleanup startup with the API lifecycle without blocking server startup.
- [ ] Run focused tests; expect pass.

### Task 3: Message serialization and community media endpoints

**Files:**
- Create: `apps/api/src/community/messageSerialization.ts`
- Create: `apps/api/src/community/messageSerialization.test.ts`
- Modify: `apps/api/src/community/messageMetadata.ts`
- Modify: `apps/api/src/community/messageMetadata.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Create: `apps/api/src/community/communityMediaRoutes.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces serialized media URLs and expiry placeholders in `ClubMessage`.
- Produces `createClubVoiceMessage(topicId, file, durationSeconds, replyId)` and `createClubImageMessage(topicId, files, replyId)`.

- [ ] Write failing serialization tests for active/expired voice, partial/fully expired galleries, reply labels, and pinned labels.
- [ ] Write failing route-source/API tests for multipart voice and image endpoints, membership/mute/locked-topic checks, upload rollback, and 1–10 ordered images.
- [ ] Run focused API tests; expect failures because serialization and endpoints are missing.
- [ ] Extract existing text-message serialization into the focused module and include attachment/poll relations without changing current text output.
- [ ] Add multipart endpoints that validate all files before insertion, upload with rollback on failure, insert the message and attachments transactionally, and return the normal mutation response.
- [ ] Add web API client multipart functions with explicit duration and reply metadata.
- [ ] Run focused API and client tests; expect pass.

### Task 4: Poll domain, endpoints, and analytics

**Files:**
- Create: `apps/api/src/community/polls.ts`
- Create: `apps/api/src/community/polls.test.ts`
- Create: `apps/api/src/community/pollStats.ts`
- Create: `apps/api/src/community/pollStats.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces `createPoll`, `replacePollVotes`, `closePoll`, and `getPollStatistics`.
- Produces community poll endpoints and `/admin/stats/polls`.

- [ ] Write failing domain tests for 2–10 unique non-empty options, single/multiple votes, vote replacement, idempotency, scheduled close, moderator early close, and hidden identities for anonymous polls.
- [ ] Write failing analytics tests for created/active/closed totals, unique voters, total selections, participation rate, distributions, period filtering, and anonymous detail suppression.
- [ ] Run focused poll tests; expect missing-module failures.
- [ ] Implement transactional poll creation and vote replacement with membership/topic/mute checks and server-authoritative close state.
- [ ] Add create/vote/close/details endpoints and shared/API client contracts.
- [ ] Add admin poll aggregate/detail endpoint guarded by `statistics` permission.
- [ ] Run focused tests; expect pass.

### Task 5: Voice recorder and chat player UI

**Files:**
- Create: `apps/web/src/features/community/useVoiceRecorder.ts`
- Create: `apps/web/src/features/community/useVoiceRecorder.test.ts`
- Create: `apps/web/src/features/community/ChatVoiceMessage.vue`
- Create: `apps/web/src/features/community/chatVoiceMessage.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Consumes `createClubVoiceMessage` and `ClubMessage.voice`.
- Produces recorder states `idle`, `recording`, `preview`, `uploading`, and `error`.

- [ ] Write failing recorder tests for permission denial, MIME selection, 300-second auto-stop, timer cleanup, cancel, retained preview after upload error, and successful reset.
- [ ] Write failing component tests for active player, single-audio playback coordination, duration/progress, expired placeholder, reply label, and 44 px controls.
- [ ] Run focused web tests; expect missing components/modules.
- [ ] Implement the composable with injected browser primitives for deterministic tests and object-URL cleanup.
- [ ] Implement the compact player and integrate mic/recording/preview/send states into the existing composer without disrupting text submission.
- [ ] Run focused web tests; expect pass.

### Task 6: Image draft, gallery, and viewer UI

**Files:**
- Create: `apps/web/src/features/community/useImageDraft.ts`
- Create: `apps/web/src/features/community/useImageDraft.test.ts`
- Create: `apps/web/src/features/community/ChatImageGallery.vue`
- Create: `apps/web/src/features/community/chatImageGallery.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Consumes `createClubImageMessage` and `ClubMessage.images`.
- Produces an ordered 1–10 file draft and fullscreen gallery viewer.

- [ ] Write failing draft tests for gallery/camera input, 10-file cap, 15 MB limit, preview URLs, per-file removal, full reset, and preserving files after upload failure.
- [ ] Write failing gallery tests for 1, 2–4, and 5–10 layouts, remaining-count overlay, swipe/previous/next, zoom-safe viewing, expired and partially expired media, and accessible labels.
- [ ] Run focused web tests; expect missing components/modules.
- [ ] Implement draft management, composer `+` menu, camera/gallery inputs, preview strip, upload progress, retry, and cleanup.
- [ ] Implement responsive gallery and portal-based fullscreen viewer with back/escape close and body scroll lock.
- [ ] Run focused web tests; expect pass.

### Task 7: Poll composer and voting UI

**Files:**
- Create: `apps/web/src/features/community/ChatPollComposer.vue`
- Create: `apps/web/src/features/community/chatPollComposer.test.ts`
- Create: `apps/web/src/features/community/ChatPollMessage.vue`
- Create: `apps/web/src/features/community/chatPollMessage.test.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Consumes poll create/vote/close client functions and `ClubMessage.poll`.
- Produces the poll bottom sheet and inline result card.

- [ ] Write failing composer tests for question, dynamic 2–10 options, duplicate/empty validation, multiple/anonymous toggles, optional local close time, and submit retry.
- [ ] Write failing poll-message tests for single/multiple selection, changing votes, percentages, voter count, closed state, moderator close, anonymous copy, and non-anonymous admin details.
- [ ] Run focused web tests; expect missing components.
- [ ] Implement the bottom-sheet composer from the chat `+` menu and inline poll card with optimistic selection followed by server reconciliation.
- [ ] Integrate reply, reaction, pin, moderation, and refresh signatures for poll messages.
- [ ] Run focused web tests; expect pass.

### Task 8: Admin poll statistics UI

**Files:**
- Create: `apps/web/src/features/admin/AdminPollStatistics.vue`
- Create: `apps/web/src/features/admin/adminPollStatistics.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminStatistics.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes `/admin/stats/polls` aggregate and detail contracts.
- Produces poll KPI cards, list, result distributions, and permitted voter details.

- [ ] Write failing UI tests for KPI totals, period filters, distributions, empty/loading/error states, anonymous suppression, and named voter detail.
- [ ] Run the focused admin statistics test; expect missing component failure.
- [ ] Implement the component using existing admin period and task-screen patterns, then mount it under the current statistics panel.
- [ ] Run focused and existing admin statistics tests; expect pass.

### Task 9: Release, full verification, and production deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces the next app version and service-worker cache revision.

- [ ] Update release notes with voice retention, image retention/galleries, polls, and poll statistics; increment app and service-worker versions exactly once.
- [ ] Run `pnpm test`; expect all workspace tests passing.
- [ ] Run `pnpm check`; expect zero TypeScript/Vue errors.
- [ ] Run `pnpm build`; expect API and web builds to complete.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Verify 320, 360/390, 768, 1024, and 1440 px layouts with the project/skill Playwright audit, including composer, recorder, gallery, poll card, poll sheet, and admin poll statistics.
- [ ] Commit, push `main`, monitor both GitHub workflows, verify production version/assets, run database migration checks, confirm `/opt/club-pwa` commit, and smoke-test text chat plus new endpoints.
