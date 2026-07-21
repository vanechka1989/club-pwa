# Short advertising links

## Goal

Give every advertising campaign both a readable short URL and the existing full tracked URL without changing attribution behavior.

## Design

- The existing unique `aid` is also the short-link slug, so no database migration is required.
- Admins may enter an optional lowercase Latin slug; when omitted, the existing unique generator creates one.
- `GET /go/:aid` validates the slug, loads an active campaign, and redirects to the full URL containing `aid` and non-empty UTM parameters.
- The web proxy sends `/go/*` to the API. Existing full URLs remain valid.
- The admin card displays separate copy actions for “Короткая” and “Прямая” links.
- Duplicate custom slugs are rejected instead of silently changing an explicitly requested address.

## Validation and compatibility

- Slugs use 3–80 lowercase Latin letters, digits and single hyphen-separated groups.
- Unknown or inactive slugs return 404.
- Both URL variants use the current client-side visit recording flow, visitor identity and destination handling.
