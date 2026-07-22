# Client Actions Before Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place client access actions above the acquisition source card.

**Architecture:** Reorder existing Vue template blocks only. Keep component props, event handlers, permissions, and responsive styles unchanged.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite.

## Global Constraints

- Preserve all action and attribution behavior.
- Keep the message button between the action and source sections.
- Publish the change as the next application version.

---

### Task 1: Reorder client detail sections

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: the existing action panel, message button, warnings, and `AdminClientAcquisition` component.
- Produces: KPI → actions → message → warnings → source → activity ordering.

- [ ] Add a source-order test and confirm it fails.
- [ ] Move the existing action block before the message button.
- [ ] Move `AdminClientAcquisition` after the warnings.
- [ ] Update version and release notes.
- [ ] Run focused and full verification, deploy, and verify production assets.
