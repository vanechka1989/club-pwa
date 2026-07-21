# Admin and Learning Polish Design

## Goal

Make the affected admin and learning screens behave like deliberate mobile PWA pages: stable action placement, less nested content, compact progressive disclosure, and visible lesson media before saving.

## Decisions

- Keep the payment refresh action because payment and webhook state may change while the panel is open. Give the heading text a flexible column and keep the action at a fixed, non-wrapping 44 px tap target.
- Remove the mailing-history refresh action. Mailings load when the panel or routed history screen opens, so a second manual refresh adds clutter without a distinct recovery purpose.
- Replace the embedded mailing history with a summary card that opens `/admin/mailings/history`. The routed `TaskScreen` contains the complete mailing list; selecting a mailing continues to open its existing detail route.
- Make the project settings audit log collapsible and collapsed by default. Its summary always shows the title and number of records.
- Add a current-content preview to the lesson editor. Existing media, selected local files, direct media links, and recorded voice blobs use the same preview area. Audio uses native controls so it can be played before saving.
- Revoke temporary object URLs when content changes or the editor closes to avoid retaining blobs in memory.
- Preserve all existing API contracts, save flows, mailing analytics, and access permissions.

## Performance Package

- Profile the admin/API paths touched by the release and add only indexes or query changes justified by existing filters and ordering.
- Keep the current request metrics and health behavior intact.
- Avoid speculative cache layers that could make payments, mailings, or permissions stale.

## Responsive and Accessibility Rules

- Support 320, 390, 768, 1024, and 1440 px without horizontal overflow.
- Buttons remain at least 44 px high and do not split words.
- Routed mailing history fills the PWA task layer and respects safe areas.
- Collapsible logs use an actual button with `aria-expanded` and an accessible region.
- Media previews never exceed their container and use `playsinline` for video.

## Verification

- Add failing source/component tests before each behavior change.
- Run focused admin and learning tests, then the full type, unit, build, dependency, and routed viewport checks.
- Increase the application version and deploy only after local verification passes.
- Verify production health, readiness, rendered version, containers, and backup timer after deployment.
