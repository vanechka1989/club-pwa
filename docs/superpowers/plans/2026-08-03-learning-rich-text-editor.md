# Learning Rich Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one safe, mobile-first visual/HTML editor to the lesson body and every additional-material note, then render the saved formatting to members.

**Architecture:** A focused web helper owns legacy-text normalization and browser sanitization; a reusable Vue component owns visual/HTML editing. The learning screens consume both units, while a matching API helper sanitizes the two persisted body fields at the trust boundary.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, Hono, sanitize-html, existing CSS design tokens.

## Global Constraints

- Keep existing API field names and database schema.
- Visual mode is the default; HTML mode is secondary.
- Allow only paragraphs, breaks, h2/h3, strong/b/em/i/u, blockquote, code, ul/ol/li, and safe links.
- Minimum mobile tap target is 44 × 44 px; no horizontal overflow at 320 px.
- Preserve legacy plain text and line breaks.
- Sanitize on both client display and API write.

---

### Task 1: Learning HTML policy

**Files:**
- Create: `apps/web/src/features/learning/learningRichText.ts`
- Test: `apps/web/src/features/learning/learningRichText.test.ts`
- Create: `apps/api/src/learning/html.ts`
- Test: `apps/api/src/learning/html.test.ts`

**Interfaces:**
- Produces: `prepareLearningHtml(value: string): string` for safe browser editing/display.
- Produces: `sanitizeLearningHtml(value: string | null | undefined): string | null` for API persistence.

- [ ] Write web tests asserting legacy line breaks become `<br>`, allowed formatting survives, scripts/events are removed, and unsafe links lose their anchor.
- [ ] Run `pnpm --filter @club/web test -- learningRichText.test.ts`; expect module-not-found failure.
- [ ] Implement `prepareLearningHtml` using the existing client sanitizer and consistent newline normalization.
- [ ] Run the focused web test; expect PASS.
- [ ] Write API tests with the same safe-tag and link policy, including empty input returning `null`.
- [ ] Run `pnpm --filter @club/api test -- learning/html.test.ts`; expect module-not-found failure.
- [ ] Implement `sanitizeLearningHtml` with `sanitize-html`, allowed attributes only on anchors, and safe schemes/relative paths.
- [ ] Run the focused API test; expect PASS.
- [ ] Commit the helper and tests.

### Task 2: Reusable mobile editor

**Files:**
- Create: `apps/web/src/features/learning/LearningRichTextEditor.vue`
- Test: `apps/web/src/features/learning/LearningRichTextEditor.test.ts`
- Modify: `apps/web/src/features/learning/learningRoute.css`

**Interfaces:**
- Consumes: `prepareLearningHtml(value: string): string`.
- Produces: Vue `v-model` string plus `label`, `placeholder`, and compact mobile toolbar.

- [ ] Write component tests for visual initialization, input emission, HTML-mode editing, safe paste, toolbar labels, and 44 px mobile controls.
- [ ] Run `pnpm --filter @club/web test -- LearningRichTextEditor.test.ts`; expect component-not-found failure.
- [ ] Implement the component with selection preservation, visual/HTML modes, accessible toolbar actions, and application-styled link entry.
- [ ] Add mobile-first styles with a wrapping/sticky toolbar and no fixed editor width.
- [ ] Run the focused component test; expect PASS.
- [ ] Commit the component, styles, and tests.

### Task 3: Learning screen and API integration

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/learning/htmlIntegration.test.ts`

**Interfaces:**
- Consumes: `LearningRichTextEditor` and `prepareLearningHtml` on the web.
- Consumes: `sanitizeLearningHtml` before saving main and nested material bodies in the API.

- [ ] Add failing learning-screen tests proving both textarea locations use the rich editor and member output renders safe HTML.
- [ ] Run `pnpm --filter @club/web test -- learningArchive.test.ts`; expect the new assertions to fail.
- [ ] Replace both textarea bindings with `LearningRichTextEditor` and render prepared HTML for the main body and nested notes.
- [ ] Run the focused learning-screen tests; expect PASS.
- [ ] Add a failing API source/integration test proving create and update sanitize `body` and every `materials[].body` before persistence.
- [ ] Run `pnpm --filter @club/api test -- learning/htmlIntegration.test.ts`; expect failure because the route does not call the policy.
- [ ] Apply `sanitizeLearningHtml` in direct create/update and legacy form create/update paths plus nested material replacement.
- [ ] Run focused API tests; expect PASS.
- [ ] Run `pnpm --filter @club/web test -- learningRichText.test.ts LearningRichTextEditor.test.ts learningArchive.test.ts` and `pnpm --filter @club/api test -- learning/html.test.ts learning/htmlIntegration.test.ts`; expect PASS.
- [ ] Run `pnpm --filter @club/web check`, `pnpm --filter @club/api check`, and `pnpm build`; expect success with no new warnings.
- [ ] Verify the editor visually at 320, 390, 768, 1024, and 1440 px and in a phone landscape viewport.
- [ ] Commit the integration and verification changes.
