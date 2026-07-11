# Community chat layout architecture

The chat has one layout owner: `features/community/community.css`, imported after the global foundation. Global CSS may provide tokens and generic controls but must not calculate chat height, width, rows or composer placement.

The installed-PWA chat root fills `100dvh`. When the keyboard is detected, the existing application-wide `--club-visible-viewport-height` becomes the root height. Every descendant from app shell through chat room uses `height: 100%` and `min-height: 0`; the room grid has header, notices, one scrollable message row and composer.

The component does not measure or publish a second chat viewport. Pin-limit conflicts are translated from HTTP 409 to a user-facing alert. Pin summaries show author, message date and time.
