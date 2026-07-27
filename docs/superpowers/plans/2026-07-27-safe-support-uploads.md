# Safe Support Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit avatars to 10 MiB and stream all support attachments up to 50 MiB into S3 without buffering or changing lesson uploads.

**Architecture:** Avatar multipart stays bounded and processed by the API. Support uses an authenticated upload-intent endpoint, a short-lived same-origin streaming PUT, and JSON message finalization that verifies S3 metadata before inserting attachment rows. This avoids the current Beget browser-CORS restriction. Learning routes and multipart contracts remain untouched.

**Tech Stack:** TypeScript, Hono, Vue 3, Zod, AWS SDK S3, Vitest, Caddy/nginx.

## Global Constraints

- Avatar maximum is exactly 10 MiB.
- Support maximum is four attachments, 50 MiB per file, and 100 MiB per message.
- Support bytes may stream through Bun but must never be parsed as multipart or buffered in full.
- Lesson upload endpoints and size limits must remain unchanged.
- Use test-first red/green cycles for every behavior change.

---

### Task 1: Raise and synchronize the avatar limit

**Files:**
- Modify: `apps/api/src/profile/avatarUpload.test.ts`
- Modify: `apps/api/src/profile/avatarUpload.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/avatarUploadLimit.test.ts`

**Interfaces:**
- Produces: `avatarUploadLimits.maxFileBytes === 10 * 1024 * 1024` on the API and the same client-side threshold.

- [ ] Add a failing API assertion for exactly 10 MiB accepted and 10 MiB + 1 rejected.
- [ ] Run `pnpm --filter @club/api test -- src/profile/avatarUpload.test.ts` and confirm the 5 MiB implementation fails.
- [ ] Change `avatarUploadLimits.maxFileBytes` and the profile client constant to `10 * 1024 * 1024`.
- [ ] Add a source-level web regression test asserting the 10 MiB constant and updated user copy.
- [ ] Run the focused API and web tests and commit `fix: enforce ten megabyte avatar limit`.

### Task 2: Define support direct-upload validation

**Files:**
- Modify: `apps/api/src/support/mediaUpload.test.ts`
- Modify: `apps/api/src/support/mediaUpload.ts`
- Create: `apps/api/src/support/directUpload.test.ts`
- Create: `apps/api/src/support/directUpload.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `supportUploadIntentSchema`, `supportUploadedObjectSchema`, `buildSupportUploadKey({ userId, fileName, uploadId, now })`, and `validateSupportUploadedObject(...)`.
- The uploaded-object JSON shape is `{ objectKey: string; fileName: string; contentType: string; sizeBytes: number; uploadToken: string }`.

- [ ] Write failing tests for allowed MIME types, 50 MiB + 1 rejection, user-scoped keys, foreign keys, zero-byte objects, metadata mismatch, and 100 MiB aggregate rejection.
- [ ] Run focused support tests and confirm missing exports fail.
- [ ] Implement the schemas and pure validation helpers with generated keys under `support/pending/<userId>/`.
- [ ] Run focused tests and commit `feat: validate direct support uploads`.

### Task 3: Add upload intent and JSON support message endpoints

**Files:**
- Modify: `apps/api/src/routes/support.ts`
- Modify: `apps/api/src/storage/s3.ts`
- Create: `apps/api/src/support/directUploadRoutes.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0062_support_attachment_object_key_unique.sql`

**Interfaces:**
- Produces: `POST /api/support/uploads` returning `{ uploadUrl, objectKey, uploadToken, contentType, sizeBytes, expiresAt }` and a bounded `PUT /api/support/uploads/:uploadToken` streaming route.
- Consumes JSON bodies on all four message paths with `attachments: SupportUploadedObject[]`.
- Uses `getObjectMetadata(objectKey)` immediately before attachment insertion.

- [ ] Write failing route tests for authentication, rate limiting, generated keys, signed PUT responses, foreign tokens, missing S3 objects, oversized metadata, reused objects, and successful finalization.
- [ ] Run the route tests and confirm they fail because the endpoint and JSON path do not exist.
- [ ] Add a ten-minute upload-intent endpoint and an authenticated streaming PUT route bound to user, key, size, type, and expiry.
- [ ] Replace support `formData()` parsing on new ticket, follow-up, admin reply, and admin-created ticket with shared JSON parsing and verified attachment persistence.
- [ ] Add a unique database index on `support_ticket_attachments.object_key` so an uploaded object can be consumed once; delete the S3 object after a failed metadata/ownership verification and delete unreferenced pending objects older than one hour in the existing cleanup pass.
- [ ] Run support/API tests and commit `feat: finalize support files from s3`.

### Task 4: Migrate the web support client

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/support/directUpload.ts`
- Create: `apps/web/src/features/support/directUpload.test.ts`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/support/supportTickets.test.ts`

**Interfaces:**
- Produces: `uploadSupportAttachments(files, onProgress?)` returning uploaded-object references accepted by Task 3.
- `createSupportTicket`, `createSupportTicketMessage`, `replyAdminSupportTicket`, and `createAdminClientSupportTicket` accept JSON payloads rather than `FormData`.

- [ ] Write failing tests proving each file obtains an intent, uploads with same-origin PUT and exact `Content-Type`, and only then finalizes the support message.
- [ ] Add failures for network interruption, expired signed URL, unsupported type, 50 MiB overflow, and 100 MiB aggregate overflow.
- [ ] Run focused web tests and confirm the current FormData implementation fails them.
- [ ] Implement sequential or two-at-a-time direct uploads with progress state and retryable errors.
- [ ] Migrate all customer/admin support submission paths to JSON attachment references and update Russian/English limit copy.
- [ ] Run focused web tests and commit `feat: upload support attachments directly to s3`.

### Task 5: Add route-specific proxy protection

**Files:**
- Modify: `deploy/Caddyfile`
- Modify: `deploy/Caddyfile.scale`
- Modify: `apps/api/src/deploy/securityConfig.test.ts`

**Interfaces:**
- Produces: early avatar and support-stream caps without matching `/api/admin/learning/materials/uploads/*`.

- [ ] Write a failing deployment test asserting the avatar-only matcher/cap and proving learning route text is outside that matcher.
- [ ] Run `pnpm --filter @club/api test -- src/deploy/securityConfig.test.ts` and confirm failure.
- [ ] Add an avatar-only Caddy request-body limit before the general `/api/*` handler; keep the general API handler and existing learning part uploads unchanged. nginx serves the web container and does not receive `/api/*`, so it requires no body-limit change.
- [ ] Run deployment tests and commit `security: bound avatar request bodies`.

### Task 6: Regression and release verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-safe-support-uploads.md` only to mark completed checkboxes.

**Interfaces:**
- Verifies all contracts produced by Tasks 1–5.

- [ ] Run `pnpm check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run focused learning upload tests and confirm no learning files or contracts changed.
- [ ] Run release E2E if its required services are available; otherwise report the exact environmental blocker.
- [ ] Inspect `git diff --check` and `git status --short`, then commit plan completion metadata if changed.
