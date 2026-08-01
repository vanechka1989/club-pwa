# Learning search, progress, and quiz review design

## Goal

Make the member learning screen easier to scan and make completed quiz results explain exactly what was right, wrong, and scored.

## Module discovery

The full-width discovery toolbar is removed from the learning feed. A 44×44 search button appears in the right side of the `Модули` header for members. It opens a compact anchored panel immediately below the header containing the existing search field and four filters. The panel preserves the query/filter when closed, exposes an active indicator on the header button, focuses the search input when opened, closes with its close button or Escape, and does not affect administrator edit actions.

## Progress

The overall card shows a prominent percentage, the literal completed/total lesson count, a contextual state label, and a thicker labelled progress rail. Each module shows `Пройдено N из M`, its percentage, and the same visible rail. Completed progress uses a check state; empty and partial progress remain distinguishable without relying only on color.

## Quiz result review

The completed result summary contains status, earned/maximum points, percentage, attempt number, and completion time. The separate `Условие` and duplicate `Результат` cards are removed. A question review follows the summary and displays the question, learner answer, correct answer, correctness state, and earned/maximum points.

Correct answer identifiers are returned only for attempts owned by the signed-in member and only after the attempt is no longer `in_progress`. In-progress quiz responses continue stripping correct answers. Free-text answers remain pending until reviewed and display the awarded review points and reviewer comment when available.

## Responsive and accessibility rules

- Interactive controls are at least 44×44 px.
- The search panel and question review have no horizontal overflow from 320 px upward.
- Search trigger/panel state, progress values, and correct/incorrect results have accessible names and semantic status text.
- Color supplements icons and text; it is never the only status indicator.

## Verification

Focused API and Vue tests cover safe answer disclosure, panel behavior, progress copy, and question review. Type checks, production build, mobile viewport inspection, release metadata, deployment, and production health checks complete the change.
