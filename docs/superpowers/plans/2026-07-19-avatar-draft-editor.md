# Avatar Draft Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать текущее или выбранное фото в аккуратном редакторе и применять аватарку только после сохранения.

**Architecture:** Локальный файл и object URL живут в черновике `ProfileSection`; существующее состояние пользователя не меняется до подтверждения. Новый multipart-запрос передаёт файл вместе с X/Y/scale, а API сохраняет фото и кадрирование одним обновлением пользователя.

**Tech Stack:** Vue 3, Pinia, Hono, Drizzle, Vitest, Playwright, CSS.

## Global Constraints

- Не менять сохранённую аватарку до нажатия «Сохранить».
- Показывать текущую аватарку в меню и выбранный локальный файл в редакторе.
- Карточка не должна пересекаться с нижней навигацией на мобильных экранах.
- Не добавлять новые зависимости.

---

### Task 1: Атомарная загрузка фото и кадрирования

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/stores/session.ts`
- Modify: `apps/api/src/profile/avatarUpload.ts`
- Modify: `apps/api/src/profile/avatarUpload.test.ts`
- Modify: `apps/api/src/routes/me.ts`

**Interfaces:**
- Consumes: `File`, `avatarPositionX`, `avatarPositionY`, `avatarScale`.
- Produces: `uploadAvatar(file, display)` с обновлением пользователя только после успешного ответа.

- [ ] **Step 1: Write the failing tests**

Добавить проверки нормализации multipart-полей: X/Y ограничиваются `0..100`, scale — `1..2`, неверные значения получают безопасные значения `50/50/1`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @club/api test -- avatarUpload.test.ts`

Expected: FAIL, потому что разбор параметров кадрирования отсутствует.

- [ ] **Step 3: Implement the multipart contract**

Добавить чистую функцию разбора полей и передавать значения в единый `db.update(users).set(...)` вместе с новым `avatarObjectKey` и `photoUrl`. Клиент добавляет три значения в `FormData`; store обновляет `user` только после полного успешного ответа.

- [ ] **Step 4: Verify the focused tests**

Run: `pnpm --filter @club/api test -- avatarUpload.test.ts`

Expected: PASS.

### Task 2: Локальный черновик и корректный предпросмотр

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/ProfileSection.layout.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: действующий `session.user.photoUrl` или локальный object URL.
- Produces: `avatarDraftFile`, `avatarDraftUrl`, единый `avatarEditorPreviewUrl`, отмена без сетевого изменения.

- [ ] **Step 1: Write failing profile tests**

Проверить, что меню содержит текущий круглый preview, редактор использует `avatarEditorPreviewUrl`, выбор файла не вызывает `session.uploadAvatar`, а сохранение вызывает загрузку с параметрами кадрирования.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/web test -- ProfileSection.layout.test.ts`

Expected: FAIL на отсутствующем состоянии черновика и preview.

- [ ] **Step 3: Implement the draft lifecycle**

При выборе файла создать object URL, открыть редактор и не отправлять файл. При отмене отозвать URL. При сохранении нового файла вызвать `session.uploadAvatar(file, display)`, для текущего фото — `session.updateAvatarDisplay(display)`. В шаблоне меню показать текущее фото, в редакторе — computed URL.

- [ ] **Step 4: Fix the mobile card layout**

Поднять карточку на высоту нижней навигации, добавить компактный блок preview без вложенной карточки, сохранить safe-area и размеры тач-целей не меньше 44 px.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter @club/web test -- ProfileSection.layout.test.ts`

Expected: PASS.

### Task 3: Мобильная проверка и выпуск

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: регрессия полного пользовательского сценария и новая версия приложения.

- [ ] **Step 1: Add the mobile regression**

Проверить на `viewport-390-844`: меню выше навигации, текущее фото видно, выбор файла показывает локальный preview, до сохранения PATCH/POST отсутствуют, отмена сохраняет прежнее фото.

- [ ] **Step 2: Run the targeted browser test**

Run: `pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --grep "keeps avatar changes as a draft until save"`

Expected: PASS.

- [ ] **Step 3: Publish version 5.21**

Обновить версию на `5.21`, добавить русское и английское описание исправления и сохранить запись `5.20` следующей.

- [ ] **Step 4: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`

Expected: все команды завершаются с кодом 0.
