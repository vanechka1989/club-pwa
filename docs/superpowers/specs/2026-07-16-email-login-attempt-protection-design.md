# Email login attempt protection

## Goal

Keep the email-code form in place after a failed verification, explain the failure, and prevent repeated code guessing without blocking unrelated users behind the same mobile or home IP.

## Design

- The API assigns an opaque, long-lived HttpOnly device cookie before code verification.
- The primary one-hour bucket is a SHA-256 key derived from normalized email plus the opaque device token. It allows five failed codes.
- A secondary SHA-256 IP bucket allows 25 failed codes per hour across devices and emails. It limits cookie clearing while avoiding a five-attempt lock for an entire shared network.
- Only scope hashes, counters, and timestamps are stored. Raw email, IP, and device tokens are not written to the attempt table.
- A valid code clears the email-device bucket. An expired code does not consume an attempt and asks for a new code.
- Invalid verification uses HTTP 400 with `AUTH_INVALID_CODE`; a blocked verification uses HTTP 429 with `AUTH_TOO_MANY_ATTEMPTS` and `retryAfterSeconds`.

## Interface

- The form reads the API error payload instead of the network library's generic message.
- The code step remains visible and shows the remaining count.
- During a lock, the submit button is disabled and displays a live `MM:SS` countdown.
- The error panel uses the semantic danger palette for every application theme.
