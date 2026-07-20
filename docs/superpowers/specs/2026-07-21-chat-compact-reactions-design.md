# Compact Chat Reactions Design

## Goal

Remove distracting scroll chrome from the module editor and make chat reactions and pinned messages compact without changing message, reaction, or moderation APIs.

## Decisions

- Keep the module editor body scrollable, but hide its native scrollbar on the learning task screen.
- Render applied reactions outside the message bubble at its lower outer corner. Incoming messages anchor reactions to the right; outgoing messages anchor them to the left. The reaction layer is absolute, so it does not change bubble height.
- Keep reaction controls visually compact while preserving an expanded touch area.
- Render one active reaction palette through `Teleport` at the document body level. This removes it from transformed and scroll-clipped chat ancestors and keeps it above the header.
- Replace the permanently expanded pinned summary with a compact toggle row. The row exposes `aria-expanded`; the detailed latest message and pinned list render only while expanded. The default state is collapsed.

## Components and data flow

- `CommunitySection.vue` keeps the existing `activeReactionMessageId` and `showPinnedMessages` state. A computed active message supplies the teleported palette.
- Each non-system message receives a content wrapper containing the bubble and an absolutely positioned reactions layer.
- Existing `handleReaction`, `scrollToMessage`, pinning APIs, swipe/reply behavior, and message ordering remain unchanged.
- `community.css` owns chat geometry. `styles.css` owns the learning task-screen scrollbar rule and shared pinned panel presentation.

## Accessibility and responsive behavior

- The pinned toggle has `aria-expanded` and a descriptive label.
- The palette uses a dialog-style labelled container and remains viewport-safe above the composer.
- Layout is verified at 320, 390, 768, 1024, and 1440 px widths, with particular attention to incoming/outgoing reaction anchors, topmost messages, and horizontal overflow.

## Testing

- Source/CSS contract tests first demonstrate the missing wrapper, teleported palette, compact reaction geometry, collapsible pinned panel, and hidden learning scrollbar.
- Focused community and learning tests run after each change.
- The full test suite, type/build checks, production build, and browser screenshots gate deployment.
