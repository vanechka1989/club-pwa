# System Alert Email Design

## Goal

Make owner-only infrastructure alerts unmistakably different from client mail and understandable without knowledge of systemd or Docker.

## Message contract

- The visible sender is `Club PWA • Системный монитор` while the configured SMTP address remains unchanged.
- Every subject starts with `[СИСТЕМА] Club PWA` and contains a Russian status label: `Внимание`, `Критично`, `Авария`, or `Восстановлено`.
- Both plain-text and HTML bodies begin by saying that the email is automatic and is not sent to club clients.
- The body shows a human-readable event, status, whether action is required, and the send time in the `Asia/Novosibirsk` time zone.
- Known backup unit names are translated into Russian. Unknown technical details are preserved so diagnostics are not lost.
- Recovery messages explicitly say that no action is required.

## Architecture

Create a pure formatter module that accepts severity, raw detail, configured sender, and time, then returns the complete Nodemailer message fields. Keep SMTP transport and process lifecycle in the existing command-line sender. This separation makes the wording deterministic and testable without sending email.

## Safety and testing

- Never change the recipient: alerts continue to go only to `OWNER_EMAIL`.
- Never expose SMTP credentials or internal environment values in the message.
- Unit tests cover the sender identity, system prefix, client-exclusion notice, friendly unit-name translation, recovery behavior, and preservation of unknown details.
