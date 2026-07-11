# Community Chat Layout Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove competing chat layouts and make viewport, pin errors and pinned metadata deterministic.

**Architecture:** Load a dedicated community stylesheet after foundation, remove chat layout from foundation and remove component-local viewport measurement. Reuse the global visual viewport state for keyboard resizing.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Preserve community API routes and moderation behavior.
- Keep `.chat-messages` as the only vertical scroller.
- Keep all controls at least 44 px and all action rows at least 48 px.

### Task 1: Canonical layout

- [x] Add failing tests for stylesheet order, conflicting foundation rules and duplicate viewport measurement.
- [x] Create `features/community/community.css` and import it after foundation.
- [x] Remove community layout rules from foundation and remove component-local viewport listeners.

### Task 2: Pin feedback and metadata

- [x] Convert pin HTTP 409 to a readable five-message-limit alert.
- [x] Show author, date and time in the current pin and expanded pin list.

### Task 3: Verification and release

- [x] Run all community API tests and focused web layout, keyboard, foundation and PWA tests.
- [x] Build, deploy version 3.67 with service-worker cache v68 and verify production assets.
