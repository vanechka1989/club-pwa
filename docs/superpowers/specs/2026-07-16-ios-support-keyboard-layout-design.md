# iOS Support Keyboard Layout Design

## Problem

In the installed iPhone PWA, focusing a support textarea shrinks the visual viewport, but the application also stores the keyboard gap as the system safe-bottom inset. Support footers then add that gap as padding even though the viewport is already reduced. Existing ticket replies gain a large empty area, while the create-ticket submit action scrolls away with the form.

Production device diagnostics confirm the affected client uses an iPhone standalone PWA at a 430 x 873 CSS viewport with scale 1. The defect is application layout behavior, not a user zoom or device configuration problem.

## Approaches considered

1. **Patch only the two support screens with negative margins.** Small diff, but it hides the duplicated inset and would break on other keyboard heights.
2. **Separate keyboard occlusion from the stable system inset, then use the shared task-screen footer.** Recommended. The visible viewport accounts for the keyboard once, while `safe-area-inset-bottom` continues to protect the iPhone home indicator. Both support flows use the same three-row screen structure.
3. **Manually reposition focused controls with JavaScript.** More fragile because it competes with Safari's own focus scrolling and creates timing-dependent movement.

## Design

- Detect keyboard state before publishing layout CSS variables.
- While the keyboard is open, publish `0px` as the dynamic system-bottom value; the visual viewport already excludes the keyboard. Preserve the measured value when the keyboard is closed.
- Keep `--club-keyboard-bottom` for diagnostics and components that explicitly need the raw occlusion measurement.
- Move the create-ticket submit action from the scrollable form body into `TaskScreen`'s footer, linked to the form with the HTML `form` attribute.
- Keep ticket reply actions in the existing footer.
- Under `club-keyboard-open`, use the visible viewport as the task-screen height, keep the footer as the third grid row, and use only small fixed spacing—not keyboard-sized padding.
- Do not change support APIs, ticket data, attachments, permissions, or validation.

## Acceptance criteria

- On iPhone standalone PWA, focusing either support textarea does not create a keyboard-sized blank area.
- The active textarea remains inside the scrollable body.
- The submit/close actions remain visible directly above the keyboard.
- The iPhone home-indicator safe area remains respected after the keyboard closes.
- Existing Android, chat, modal, support, localization, type-check, and build tests remain green.

