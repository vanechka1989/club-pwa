# AdminSection Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the remaining large admin views from `AdminSection.vue` while preserving routes and behavior.

**Architecture:** Keep shared state, API orchestration, permission watching, and route parsing in the shell; move presentation into typed panels with props/emits and lazy-load non-default panels.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite, Playwright.

## Global Constraints

- Preserve every admin permission, route, API operation, visible string, and confirmation flow.
- Preserve all themes and layouts from 320 px upward.
- Do not duplicate parent-owned state or introduce a new state library.
- Replace brittle source assertions with owner-component and boundary assertions.
- Start behavior changes with failing tests.

---

### Task 1: Storage panel boundary

**Files:** create `AdminStoragePanel.vue`; modify `AdminSection.vue`, storage/admin boundary tests.

- [ ] Add a failing shell-boundary test for the storage panel contract.
- [ ] Move storage overview/tasks markup into the typed panel with intent emits.
- [ ] Lazy-load the panel while keeping route and API state in the shell.
- [ ] Redirect storage source tests and run focused checks.

### Task 2: Mailings panel boundary

**Files:** create `AdminMailingsPanel.vue`; modify `AdminSection.vue`, mailing/admin boundary tests.

- [ ] Add failing tests for the panel boundary and existing editor/history/detail states.
- [ ] Move mailing templates into the panel and expose typed events for every action.
- [ ] Lazy-load the panel; retain API calls, dialog flow, and route selection in the shell.
- [ ] Redirect mailing source tests and run focused checks.

### Task 3: Permissions panel boundary

**Files:** create `AdminPermissionsPanel.vue`; modify `AdminSection.vue`, permission/admin boundary tests.

- [ ] Add failing tests for access editor and owner-transfer boundaries.
- [ ] Move administrator list/tasks into the panel with readonly candidates and intent events.
- [ ] Lazy-load the panel while preserving permission-loss route closure.
- [ ] Redirect permission source tests and run focused checks.

### Task 4: Clients panel boundary

**Files:** create `AdminClientsPanel.vue`; modify `AdminSection.vue`, client/admin boundary tests.

- [ ] Add failing tests for client list/card and `clientCardOnly` close behavior.
- [ ] Move client templates into the panel without moving shared analytics/payment state.
- [ ] Wire typed props/events and keep the default-route loading strategy performance-neutral.
- [ ] Redirect client source tests and run focused checks.

### Task 5: Admin integration verification

- [ ] Run web TypeScript checks and the complete web test suite.
- [ ] Build and compare `AdminSection.vue` line/byte size and emitted admin chunks.
- [ ] Run admin release/device tests for Chromium, Firefox, WebKit, Android, and iOS profiles.
