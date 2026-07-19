# Idempotent Learning Card Save Design

## Problem

The direct learning-card endpoint can finish successfully while the mobile browser loses the HTTP response. The server then stores the card, but the client reports `Failed to fetch` and shows a false save error. Blindly retrying the request could create a duplicate card.

## Goal

Make creation of a learning card recoverable when the final HTTP response is lost. The client must verify the server-side outcome: treat an existing saved card as success and show an error only when the operation was not completed.

## Scope

- Apply the behavior to new cards created through `POST /admin/learning/materials/direct`, including cards whose media files were uploaded before the final save.
- Preserve the current behavior for ordinary HTTP validation and server errors that include a response.
- Do not automatically retry file uploads or create a second card.
- Keep older cached clients compatible: the idempotency header remains optional on the server, while the updated client always sends it for direct card creation.

## Architecture

Use the standard idempotency-key pattern. The client generates one UUID when a background lesson-save task starts and sends it in the `Idempotency-Key` header on the final create request. The same key remains attached to that task for the entire attempt.

The API stores a durable operation record keyed by the authenticated administrator, operation scope, and idempotency key. The record contains a request fingerprint, status (`processing`, `succeeded`, or `failed`), the resulting learning-card ID when available, safe failure information, and timestamps. Reusing a key with different card data is rejected.

Card creation and the transition of the operation to `succeeded` are committed atomically in one database transaction. A unique constraint prevents concurrent requests with the same key from creating duplicates. The operation record is independent of the card so the outcome remains available even if the card is later archived or deleted.

## API Behavior

### Create card

`POST /admin/learning/materials/direct` accepts an optional `Idempotency-Key` UUID header.

- No header: retain the legacy create behavior for compatibility.
- New key: claim the operation, create the card once, record `succeeded`, and return the existing mutation response.
- Previously succeeded key with the same fingerprint: return the originally created card without inserting another card.
- Key already processing: return `409` with a stable `IDEMPOTENCY_IN_PROGRESS` code.
- Same key with a different fingerprint: return `409` with `IDEMPOTENCY_KEY_REUSED`.
- Definitive failure: record `failed` and return the original HTTP error where practical.

### Check operation

`GET /admin/learning/materials/operations/:key` is authenticated and scoped to the current administrator.

- `200` and `{ status: "succeeded", material }` when the card was saved.
- `200` and `{ status: "failed" }` when the operation definitively failed.
- `202` and `{ status: "processing" }` while the server is still completing it.
- `404` when no operation exists for that administrator and key.

The endpoint never exposes another administrator's operation.

## Client Flow

1. Generate the idempotency key before starting the background save.
2. Upload media exactly as today.
3. Send the final direct-create request with the key.
4. If the request succeeds, add the returned material and finish normally.
5. If the request fails without any HTTP response, poll the operation endpoint for a short bounded interval.
6. If the check returns `succeeded`, use the returned material and show `Урок сохранён` without an error.
7. If it returns `processing`, wait briefly and check again.
8. If it returns `failed`, `404` after the bounded checks, or the check itself remains unreachable, show the existing upload/save error with the precise stage.

Errors with an HTTP response are not reconciled because the server has already given a definitive outcome.

## Data Integrity and Retention

- The uniqueness boundary is `(actor_telegram_id, scope, idempotency_key)`.
- A deterministic SHA-256 fingerprint of the normalized request JSON prevents accidental reuse of a key for different content.
- Successful records retain the resource ID and a minimal result reference, not uploaded file bytes or secrets.
- Records expire after 30 days and are pruned opportunistically, matching the project's existing lightweight retention style.
- Database migration `0048` adds the operation table, indexes, and foreign-key behavior required for lookup and cleanup.

## Error Handling

The client distinguishes an ambiguous network failure from an HTTP error by checking whether the fetch error contains a response. Reconciliation is only entered for the ambiguous case. Polling is bounded so a persistent outage does not leave the task indefinitely in `saving` state.

If the card was saved but serialization temporarily fails, the operation lookup serializes the stored card again. If the card was subsequently removed before lookup, the operation remains `succeeded`; the endpoint returns a successful outcome with a `material: null` marker, and the client refreshes the admin learning list before deciding whether to finish or report that the saved card is no longer available.

## Testing

- Unit-test operation claiming, fingerprint matching, duplicate-key behavior, actor isolation, and terminal status transitions.
- API-test that two create attempts with one key produce one card and return the same material ID.
- API-test the operation lookup statuses and authorization boundary.
- Web-test that a response-less final-save failure followed by `succeeded` completes the upload task without an error.
- Web-test that `failed`, persistent `404`, and unreachable reconciliation retain the current visible error.
- Run focused tests, the full test suite, the production build, and `git diff --check` before completion.

## Non-goals

- Generalizing every mutation in the application in this change.
- Retrying or resuming completed S3 uploads beyond the existing upload logic.
- Changing card editing, module creation, or deletion semantics.
