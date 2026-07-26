# Disable Native Context Menu Design

## Goal

Make the installed PWA feel like a native application by suppressing browser context menus and mobile long-press callouts on ordinary application UI.

## Behavior

- Prevent the `contextmenu` default action for buttons, links, images, cards, navigation, lesson surfaces, and other non-editable UI.
- Suppress the WebKit touch callout across the application shell so a long press does not show the browser image/link menu on iOS.
- Preserve native editing actions inside `input`, `textarea`, `select`, contenteditable regions, and descendants of those regions.
- Allow an explicit `[data-native-context-menu]` escape hatch for any future component that intentionally needs the browser menu.
- Do not interfere with clicks, taps, pointer gestures, image zoom, scrolling, keyboard input, file pickers, or accessibility focus.

## Architecture

Create a focused `nativeContextMenu.ts` module that decides whether an event target is editable and installs/removes the document-level listener. `App.vue` owns the listener lifecycle. Global CSS handles the iOS touch-callout behavior, with matching editable-element exceptions.

## Testing

- Unit-test the real event handler with ordinary UI, form controls, nested contenteditable elements, and the explicit escape hatch.
- Mount `App.vue` and verify listener registration/removal through observable context-menu behavior.
- Run the full web test suite, type checks, production build, and release E2E on desktop Chromium, Android Chrome emulation, and iOS WebKit.

## Release

Publish as version 5.66 with a service-worker cache bump so installed PWAs receive the behavior promptly.
