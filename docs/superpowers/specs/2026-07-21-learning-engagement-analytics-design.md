# Learning Engagement Analytics Design

## Goal

Measure how members actually engage with each learning card and expose useful card-level and member-level analytics in the admin PWA.

## Measurement model

- A viewing session starts when a published learning card is opened.
- The browser counts time only while the document is visible, the window is focused, and the lesson screen remains open.
- The client sends cumulative active seconds, cumulative video-playing seconds, the current material, and an optional close marker. Cumulative counters make retries idempotent.
- The server accepts only authenticated active members, verifies that the learning card and material exist, caps counters to one day per session, and never trusts a client-supplied user id.
- Quick exits are sessions with fewer than 5 active seconds. Engaged views have at least 10 active seconds.
- Existing progress and playback-position behavior remains unchanged.

## Storage

Create `learning_engagement_sessions` with one row per client-generated session UUID. Store user, content card, optional material, opened/last-active/closed timestamps, active seconds, video-playing seconds, and the latest playback position. Keep indexes for content/date, user/date, and unique session id.

## API

- `POST /learning/items/:id/engagement` upserts a member-owned cumulative session snapshot.
- `GET /admin/analytics/learning-engagement?from=YYYY-MM-DD&to=YYYY-MM-DD` returns the period summary and card rows.
- `GET /admin/analytics/learning-engagement/:itemId/users?from=...&to=...` returns per-member drilldown rows.

## Admin UI

The existing Analytics → Learning task screen gains:

- total unique viewers, total views, median active time, and quick-exit rate;
- a responsive list of learning cards with views, viewers, average/median active time, quick exits, completions, and video engagement;
- a tap-through sheet for a selected card listing members, opens, total active time, last view, playback progress, and completion state.

The UI must remain usable at 320, 360/390, 768, 1024, and 1440 px without horizontal overflow.

## Accuracy and privacy

- Background tabs, locked screens, and paused video do not accumulate time.
- Offline/retried snapshots cannot double count because counters are cumulative and server-side values only increase.
- No pointer movement, keystrokes, page contents, or screen recordings are collected.
- Historical engagement time cannot be reconstructed; collection starts after deployment.

## Verification

Use unit tests for counter rules and aggregation, route tests for authorization/validation, component tests for tracker visibility behavior and admin layout, then run workspace checks/build and production smoke tests.
