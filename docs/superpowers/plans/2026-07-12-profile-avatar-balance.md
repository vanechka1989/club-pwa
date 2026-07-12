# Profile Avatar Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Увеличить аватар профиля до 84 px и сбалансировать верхнюю карточку без изменения её логики.

**Architecture:** Изменение ограничено существующим CSS-компонентом `profile-avatar-stack-v2`. Регрессионный тест фиксирует мобильный размер аватара и сохранение двухколоночной структуры.

**Tech Stack:** Vue 3, CSS, Vitest, Vite.

## Global Constraints

- Не изменять бизнес-логику аватара, ника, роли или подписки.
- Кнопки сохраняют область нажатия 44 × 44 px.
- Карточка остаётся двухколоночной от 320 px.

---

### Task 1: Баланс карточки профиля

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/profile/profileDisplayName.test.ts`

**Interfaces:**
- Consumes: существующие классы `.profile-avatar-stack-v2`, `.profile-avatar-large`, `.profile-identity-card-v2`.
- Produces: аватар 84 × 84 px в верхней карточке профиля.

- [ ] **Step 1: Write the failing test**

```ts
expect(styles).toContain(".profile-avatar-stack-v2 .profile-avatar-large { width:84px; height:84px; }");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- profileDisplayName.test.ts`
Expected: FAIL, потому что текущий размер равен 64 px.

- [ ] **Step 3: Write minimal implementation**

```css
.profile-avatar-stack-v2 .profile-avatar-large { width:84px; height:84px; }
```

- [ ] **Step 4: Run verification**

Run: `pnpm --filter @club/web test -- profileDisplayName.test.ts pwa.test.ts releaseNotes.test.ts`
Expected: 15 tests PASS.

Run: `pnpm --filter @club/web build`
Expected: typecheck и Vite build завершаются с кодом 0.

- [ ] **Step 5: Publish**

Повысить версию приложения и service worker, зафиксировать изменения, отправить `main` и проверить новую версию на сервере.
