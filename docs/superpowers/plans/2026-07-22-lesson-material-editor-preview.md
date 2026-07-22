# Lesson Material Editor Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать любой сохранённый или новый контент дополнительных материалов урока и записывать аудиоматериалы как голосовые сообщения в чате.

**Architecture:** Чистый resolver выбирает сохранённый, внешний или локальный URL без изменения серверных данных. `LearningSection.vue` хранит object URL по id материала и один экземпляр чатового voice recorder, который привязывается к активной аудиокарточке.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, MediaRecorder, Playwright, существующие `useVoiceRecorder` и `ChatVoiceWaveform`.

## Global Constraints

- Предпросмотр обязан работать для текста, фото, видео, YouTube и аудио.
- Одновременно записывается только один дополнительный материал.
- Никаких изменений API-контракта и бизнес-логики сохранения урока.
- Минимальная ширина аудита — 320 px; tap targets — минимум 44 × 44 px.

---

### Task 1: Resolver предпросмотра дополнительных материалов

**Files:**
- Modify: `apps/web/src/features/learning/lessonEditorPreview.ts`
- Modify: `apps/web/src/features/learning/lessonEditorPreview.test.ts`

**Interfaces:**
- Produces: `resolveLessonMaterialPreview({ kind, source, existingUrl, externalUrl, localUrl })` returning `{ url, origin } | null`.

- [ ] **Step 1: Write failing tests** for saved photo/video/audio, external URL, YouTube, local replacement and text-only material.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- lessonEditorPreview.test.ts` and confirm missing export failure.
- [ ] **Step 3: Implement resolver** with priority `localUrl > externalUrl > existingUrl`, returning null for text.
- [ ] **Step 4: Re-run focused tests** and confirm PASS.

### Task 2: Material previews and object URL lifecycle

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `resolveLessonMaterialPreview`.
- Produces: `lesson-material-media-preview` for image, video/YouTube and audio.

- [ ] **Step 1: Add failing source assertions** for preview rendering and cleanup.
- [ ] **Step 2: Run focused tests** and confirm expected markup is absent.
- [ ] **Step 3: Add per-material object URLs**, populate them on file selection, revoke them on replacement/removal/close/unmount, and render responsive media.
- [ ] **Step 4: Run focused tests and typecheck**.

### Task 3: Chat-style voice recording in an audio material

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `useVoiceRecorder`, `ChatVoiceWaveform`, `createVoiceUpload`.
- Produces: start/stop/cancel/apply controls tied to `activeMaterialVoiceId`.

- [ ] **Step 1: Add failing assertions** for recorder controls, waveform, preview player and apply action.
- [ ] **Step 2: Run test and confirm RED**.
- [ ] **Step 3: Implement one active recorder**, attach the approved Blob as `NamedBlobUpload`, and show errors beside the active card.
- [ ] **Step 4: Verify focused tests and typecheck**.

### Task 4: Release, regression and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `tests/e2e/app.spec.ts` only if the route audit needs a stable selector.

- [ ] **Step 1: Add failing release test** for version 5.40.
- [ ] **Step 2: Update version and release notes**, then run release tests.
- [ ] **Step 3: Run** `pnpm check`, `pnpm test`, `pnpm build`, `pnpm audit --prod`.
- [ ] **Step 4: Run lesson editor route audit** on Android 320/390, iPhone/WebKit and tablet.
- [ ] **Step 5: Commit, push main, deploy, and verify health/readiness/version**.
