# Admin Client Open Section State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ненавязчиво отличить открытый раздел карточки клиента от закрытых во всех темах.

**Architecture:** Состояние строится на нативном атрибуте `details[open]` и существующих семантических переменных темы. Бизнес-логика, DOM и размеры строк не меняются; добавляются только scoped CSS-правила и регрессионная проверка.

**Tech Stack:** Vue 3, CSS, Vitest, Vite, PWA service worker.

## Global Constraints

- Высота закрытой строки остаётся 44 px.
- Цвета используют только `--accent`, `--accent-soft`, `--border`, `--panel` и прозрачное смешивание.
- Закрытые разделы и логика раскрытия не меняются.
- Открытое состояние получает акцентную рамку, лёгкую тонировку шапки и акцентную стрелку.

---

### Task 1: Визуальное состояние открытого раздела

**Files:**
- Modify: `apps/web/src/features/admin/adminClientCard.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Consumes: нативный атрибут `.admin-client-compact-section[open]` и семантические CSS-переменные темы.
- Produces: отдельное визуальное состояние открытого раздела без изменения Vue-компонента.

- [ ] **Step 1: Добавить падающую проверку открытого состояния**

```ts
expect(styles).toMatch(/\.admin-client-workspace \.admin-client-compact-section\[open\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--accent\) 38%, var\(--border\)\);/s);
expect(styles).toMatch(/\.admin-client-workspace \.admin-client-compact-section\[open\] > summary\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent-soft\) 42%, var\(--panel\)\);/s);
expect(styles).toMatch(/\.admin-client-workspace \.admin-client-compact-section\[open\] > summary::after\s*\{[^}]*color:\s*var\(--accent\);/s);
```

- [ ] **Step 2: Запустить целевой тест и подтвердить ожидаемое падение**

Run: `pnpm --filter @club/web test -- adminClientCard.test.ts`

Expected: FAIL в проверке стилей `[open]`, потому что отдельное визуальное состояние ещё не задано.

- [ ] **Step 3: Добавить минимальные scoped-стили**

```css
.admin-client-workspace .admin-client-compact-section[open] {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent);
}

.admin-client-workspace .admin-client-compact-section[open] > summary {
  background: color-mix(in srgb, var(--accent-soft) 42%, var(--panel));
  border-bottom-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.admin-client-workspace .admin-client-compact-section[open] > summary::after {
  color: var(--accent);
}
```

- [ ] **Step 4: Запустить целевой тест и подтвердить прохождение**

Run: `pnpm --filter @club/web test -- adminClientCard.test.ts`

Expected: 20 tests passed.

- [ ] **Step 5: Обновить версию и PWA-кэш**

Поднять версию приложения с `4.05` до `4.06`, добавить верхнюю запись release notes и изменить кэш service worker с `club-pwa-v106` на `club-pwa-v107` вместе с ожиданиями тестов.

- [ ] **Step 6: Выполнить полную проверку**

Run: `pnpm test`

Expected: 433 tests passed.

Run: `pnpm build`

Expected: exit code 0 и созданные production assets.

- [ ] **Step 7: Зафиксировать и опубликовать**

```bash
git add apps/web docs/superpowers/plans/2026-07-13-admin-client-open-section-state.md
git commit -m "feat: highlight open client sections"
git push origin main
```

После деплоя проверить `/api/health`, `sw.js` с кэшем `v107` и наличие всех трёх `[open]`-правил в production CSS.
