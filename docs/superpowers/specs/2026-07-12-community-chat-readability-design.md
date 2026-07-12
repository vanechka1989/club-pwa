# Community Chat Readability Design

## Goal

Make community conversations calmer and easier to scan in every design theme, widen the message field, and clearly identify a message reached from the pinned-message list.

## Chat color model

Community chat receives semantic tokens derived from each active theme instead of hard-coded teal, blue, or purple gradients. Incoming bubbles use the elevated neutral surface. Outgoing bubbles blend 14% of the active accent into the elevated surface, with an accent-tinted border. Text uses the theme text tokens in both light and dark modes. Polls, voice players, reply previews, and reactions inherit the bubble surface rather than introducing another saturated block.

## Composer

The composer is one full-width rounded field. Attachment and emoji controls sit inside its left edge, the text input expands through the center, and the right edge shows one contextual action: microphone when the field is empty, send when text exists. All controls retain a 44 px touch target, but only three targets are present instead of four.

## Pinned-message navigation

Selecting a pinned-message entry closes the pinned list, scrolls the target bubble to the center, and applies a high-contrast but theme-aware highlight ring and soft glow for 1.8 seconds. Repeated selections replace the previous highlight timer. The behavior does not change pinning permissions or message data.

## Verification

Tests cover semantic chat tokens, contextual composer actions, and pinned-jump highlight state. Mobile verification covers 320 px and 390 px widths, light and dark variants, overflow, readable contrast, and preserved 44 px targets.
