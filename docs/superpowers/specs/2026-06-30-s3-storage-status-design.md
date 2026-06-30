# S3 Storage Status Design

## Goal

Update the admin storage landing card so the main S3 and reserve S3 are shown as two separate status actions.

## User Flow

The existing single badge that says `S3 подключено` or `S3 не подключено` becomes two side-by-side controls:

- `S3 основное` shows whether the primary S3 is configured.
- `S3 резервное` shows whether the reserve S3 is configured.

Tapping either control opens the same two storage actions already available on the page: file overview and S3 settings. The existing file overview and settings modals remain unchanged.

## Scope

This is a frontend-only change in the admin storage section. The API already returns reserve S3 settings, and the current settings modal already contains reserve S3 fields.

## Behavior

The primary status is connected when `storageSettings.configured` is true. The reserve status is connected when `storageSettings.reserveConfigured` is true.

Both status controls are interactive shortcuts. They reveal the existing action area with `Обзор файлов` and `Настройки S3`; if the current layout already keeps those actions visible, pressing either status scrolls/focuses the action area without changing modal behavior.

## Testing

Update the admin storage section source-level test to check for `S3 основное`, `S3 резервное`, and the reserve status expression. Run the focused web tests.
