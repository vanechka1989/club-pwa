# Full-screen Header Contract Design

## Goal

Make every full-screen internal PWA page visually match the main section header and use the same horizontal content gutters.

## Root cause

Main section headers live inside the padded application shell. Full-screen `TaskScreen` routes remove that shell padding, while the chat implements a second edge-to-edge header. A profile-only override corrected two routes but left every other task route unchanged. Support also has late 8 px gutter overrides.

## Design

- Promote the existing profile detail treatment to the shared `TaskScreen` contract: 14 px safe-area-aware outer gutters, a 12 px top gap, 18 px radius, and 14 px body gutters.
- Keep screen-specific header grids and actions, but make their outer card geometry shared.
- Apply the same outer geometry to the full-screen chat header and align chat notices/messages to the same 14 px gutter.
- Remove profile-only geometry so future routes cannot drift from the shared contract.
- Replace support's 8 px body/footer overrides with the shared 14 px gutter.

## Scope and safety

No routing, data loading, form submission, referral, payment, chat, or admin behavior changes. Footer positioning and keyboard handling remain intact. Verify 320, 390, 768, 1024, and 1440 px widths with no horizontal overflow.
