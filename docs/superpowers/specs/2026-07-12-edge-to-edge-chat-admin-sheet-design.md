# Edge-to-edge chat and admin action sheet

## Goal

Make the community chat visually fill the installed PWA viewport, keep the composer against the bottom safe area for empty, short and long conversations, and replace overlapping inline moderation actions with a touch-friendly action sheet.

## Layout

The open-chat route bypasses the normal padded content container. Its room occupies the full width and the entire usable shell height below the Android status area. The room is a grid with header, notices, one `minmax(0, 1fr)` message scroller, and composer. Header and composer backgrounds extend edge to edge; their controls receive safe-area-aware inner padding. The message list retains a compact 16 px reading inset.

The composer remains in normal grid flow. Empty and short conversations expand only the message row, leaving the composer at the bottom. When the keyboard opens, the shell follows `visualViewport`; only the message row shrinks and scrolls.

## Moderation actions

A moderator opens actions from the existing message interaction. Inline horizontal buttons are removed. A modal action sheet appears at the bottom with a title identifying the selected author and full-width rows at least 48 px high:

- pin or unpin;
- delete or restore;
- mute until manually removed;
- delete all messages by that author.

Destructive rows use the semantic danger token. The sheet has a separate cancel action, closes on backdrop, Escape and successful action, and does not change moderation API behavior.

## Verification

Add source-level regression assertions for an edge-to-edge room, bottom-aligned composer, safe-area padding and the absence of the inline moderation row. Run focused community, foundation, application and PWA tests plus API/web production builds. Verify the deployed version, cache revision, health endpoint and production assets.
