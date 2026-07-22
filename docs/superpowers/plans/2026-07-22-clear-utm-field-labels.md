# Clear UTM Field Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every UTM input in the advertising-link form understandable while retaining its exact technical parameter name.

**Architecture:** Keep the existing form model and API unchanged. Modify only the field-label markup and scoped responsive styles in `AdminAcquisitionAnalytics.vue`, protected by its existing source-level UI test.

**Tech Stack:** Vue 3, scoped CSS, Vitest, TypeScript.

## Global Constraints

- Preserve all existing form values, validation and submission behavior.
- Show human-readable and technical UTM names together.
- Keep the two-column layout at normal mobile widths and the existing one-column layout below 360 px.

---

### Task 1: Clarify UTM labels

**Files:**
- Modify: `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`
- Modify: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

**Interfaces:**
- Consumes: existing `form.source`, `form.medium`, `form.campaign`, and `form.content` bindings.
- Produces: visible `.acquisition-utm-label` elements with a human label and `utm_*` name.

- [ ] **Step 1: Write the failing test**

Assert that the component contains the four human-readable labels, four technical UTM names, and the `.acquisition-utm-label` class.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- adminAcquisitionAnalytics.test.ts`

Expected: FAIL because the new human-readable labels are absent.

- [ ] **Step 3: Write minimal implementation**

Replace each plain label span with a `.acquisition-utm-label` span containing the human name and a `<small>` technical name. Add scoped styles for a compact two-line label with non-wrapping `utm_*` text.

- [ ] **Step 4: Run verification**

Run:

```text
pnpm --filter @club/web test -- adminAcquisitionAnalytics.test.ts
pnpm check
pnpm build
pnpm test
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Release**

Increment the app patch version, add release notes, merge to `main`, push, deploy with `deploy/update.sh`, and confirm production health, readiness, version, and updated labels.
