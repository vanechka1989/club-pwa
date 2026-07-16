# iOS Support Keyboard Stability Design

## Goal

Keep the new-ticket form and the open-ticket reply composer stable and visible when the iPhone keyboard opens, without requiring the user to drag the page back into place.

## Root cause

The task-screen layout already resizes to `visualViewport`, but the global focus handler also centers every task-screen field and schedules four follow-up scroll corrections. Support task screens use an internal `.task-screen-body` scroller while the correction targets the outer route layer, which is locked with `overflow: hidden`. iOS performs its own caret scroll at the same time, producing the observed double movement. Support inputs also inherit `0.95rem`, which can fall below 16 CSS pixels at a reduced user scale and trigger iOS focus zoom/panning.

## Design

- Treat fields inside `.support-task-screen` as keyboard-managed and do not run the global center-scroll routine for them.
- Let the browser scroll the existing internal task body naturally while the task grid and footer resize to the visible viewport.
- Force support inputs and textareas to 16px on iOS so focus never activates browser zoom.
- Preserve all existing support actions, attachment handling, ticket status behavior, and desktop/Android layouts.

## Verification

- Unit test that support task fields never call `scrollIntoView` or the follow-up correction scheduler.
- Source/CSS regression test that all support text controls use a 16px iOS override.
- Run focused tests, the complete web test suite, type checks, build, and production health/deployment checks.
