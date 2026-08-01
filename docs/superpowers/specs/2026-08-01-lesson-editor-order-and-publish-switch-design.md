# Lesson editor order and publish switch

## Goal

Make the lesson editor easier to scan on mobile: place the knowledge-check settings next to the lesson's structural settings and replace the oversized native publish checkbox with a compact, accessible switch.

## Layout

- Keep the cover source selector and any source-specific cover controls together.
- Place the `Проверка знаний` navigation card immediately after those cover controls and before `Содержимое урока`.
- Keep publication after the lesson content, but present it as a full-width row with copy on the left and a compact switch on the right.

## Interaction and accessibility

- The whole publication row remains tappable through a label.
- The native checkbox remains in the document and keyboard-accessible, but is visually hidden so global input styles cannot enlarge it.
- The custom switch shows checked, unchecked, focus-visible, and disabled states.
- The row explains whether the lesson is visible or hidden.

## Verification

- Add source-level regression tests for block order and switch structure/styles.
- Run web type checks, unit tests, the full workspace check/build, and the mobile responsive route audit.
