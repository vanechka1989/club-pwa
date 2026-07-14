# Lesson Upload Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать загрузку файлов урока устойчивой к кратковременным обрывам и показывать сохранённую конкретную причину окончательной ошибки.

**Architecture:** Чистый модуль классифицирует ошибки и выполняет ограниченные повторы. `LearningSection.vue` применяет его к каждой multipart-части, а Pinia сохраняет завершившиеся ошибкой задачи. API возвращает структурированные коды ошибок и записывает диагностику.

**Tech Stack:** Vue 3, Pinia, TypeScript, Hono, AWS SDK S3 multipart upload, Vitest.

## Global Constraints

- Не менять формат уроков и существующих вложений.
- Не повторять отменённые пользователем запросы и ошибки 4xx валидации.
- Не показывать ложные 100% после ошибки.
- Сохранять понятную и техническую причины до ручного закрытия карточки.

---

### Task 1: Классификация и повторы

**Files:**
- Create: `apps/web/src/features/learning/uploadRecovery.ts`
- Test: `apps/web/src/features/learning/uploadRecovery.test.ts`

**Interfaces:**
- Produces: `runUploadWithRetry`, `LearningUploadRequestError`, `describeLessonUploadFailure`.

- [ ] Написать тесты для сетевого повтора, отказа от повтора 400 и отмены.
- [ ] Запустить тест и получить ожидаемый FAIL из-за отсутствующего модуля.
- [ ] Реализовать максимум три попытки и классификацию понятной причины.
- [ ] Запустить тест и получить PASS.

### Task 2: Multipart и API

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/web/src/features/learning/learningBackgroundUpload.test.ts`
- Test: `apps/api/src/learning/mediaUpload.test.ts`

**Interfaces:**
- Consumes: функции из Task 1.
- Produces: максимум два параллельных PUT, структурированные ответы `UPLOAD_CONNECTION_CLOSED` и `STORAGE_UNAVAILABLE`.

- [ ] Добавить проверки retry, параллелизма и кодов API; подтвердить FAIL.
- [ ] Обернуть чтение тела и S3-вызов в обработку с корректными статусами.
- [ ] Применить retry к каждой части и обнулять прогресс части перед повтором.
- [ ] Запустить целевые тесты и получить PASS.

### Task 3: Видимая и сохранённая диагностика

**Files:**
- Modify: `apps/web/src/stores/lessonUploads.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/api/src/clientErrors.ts`
- Test: `apps/web/src/features/learning/learningBackgroundUpload.test.ts`
- Test: `apps/api/src/clientErrors.test.ts`

**Interfaces:**
- Produces: поля `failure`, локальное сохранение ошибочных задач и серверную запись `lesson-upload`.

- [ ] Добавить тесты подробной карточки, локального сохранения и заголовка серверного журнала; подтвердить FAIL.
- [ ] Показывать этап, описание, код, попытки и время; сохранять только ошибки.
- [ ] Отправлять окончательный сбой через `/client-errors`.
- [ ] Запустить целевые тесты и получить PASS.

### Task 4: Выпуск и проверка

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Обновить версию приложения и service worker.
- [ ] Запустить `pnpm test` и получить ноль падений.
- [ ] Запустить `pnpm build` и получить exit code 0.
- [ ] Отправить commit в `main`, выполнить принудительную серверную сборку и проверить `/api/health`.
