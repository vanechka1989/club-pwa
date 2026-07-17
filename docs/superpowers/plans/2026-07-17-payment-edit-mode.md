# Payment Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Скрыть административные элементы раздела оплаты до явного включения режима редактирования владельцем.

**Architecture:** Локальный `ref` в `PaymentsSection.vue` управляет только представлением. Существующие проверки ролей и обработчики API остаются источником авторизации.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS.

## Global Constraints

- Кнопка редактирования находится слева от существующего плюса в шапке.
- Бизнес-логика оплаты и права не меняются.
- Клиентская карточка тарифа остаётся доступной в обоих режимах.

---

### Task 1: Контракт режима редактирования

**Files:**
- Modify: `apps/web/src/features/billing/paymentProviderStyle.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `isEditingPayments: Ref<boolean>` и кнопка `aria-label="Редактировать оплату"`.

- [ ] Добавить тест, требующий локальный переключатель и условия для всех административных элементов.
- [ ] Запустить тест и подтвердить падение из-за отсутствующего режима.
- [ ] Добавить переключатель слева от плюса и условия `isEditingPayments`.
- [ ] Добавить активное состояние кнопки без изменения общих UI-токенов.
- [ ] Запустить профильный тест, полный web-тест и production-сборку.
