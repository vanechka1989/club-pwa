# Chat Reaction Corners Design

## Goal

Match the annotated chat layout by placing reactions as circles over the lower-right corner of every message without changing the message bubble size or reaction behavior.

## Decisions

- Incoming and outgoing messages use the same lower-right reaction anchor.
- Each reaction is a fixed 32 × 32 px circle. The emoji and count remain inside the circle; width never grows with the count.
- The reaction layer remains absolutely positioned outside `.chat-bubble`, so it cannot affect bubble dimensions.
- An invisible pseudo-element expands the touch target to at least 44 × 44 px.
- If a message has multiple reaction types, the circles form a compact row extending left from the lower-right anchor.
- Existing reaction APIs, active-state styling, message ordering, avatars, reply gestures, and moderation behavior remain unchanged.

## Responsive and accessibility behavior

- The circle overlaps the bubble edge enough to read as a corner badge and stays clear of the avatar.
- The same geometry is used from 320 px through 1440 px.
- Buttons keep their current accessible semantics and active state.
- No horizontal overflow or message-height change is introduced.

## Testing

- A CSS contract test must first fail against the current left anchor and pill geometry.
- Focused community tests verify the new right anchor, fixed circle, internal count, and expanded touch target.
- The production build and the full test suite gate deployment.
- Browser checks cover 320 × 720, 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900.
