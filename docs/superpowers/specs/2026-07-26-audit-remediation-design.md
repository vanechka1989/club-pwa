# Audit Remediation Design

## Goal

Close the actionable findings from the customer, administrator, developer, and learning-module audits without initiating a real payment or changing production business data during verification.

## Decisions

### Reversible module deletion

Learning categories receive an `archivedUntil` timestamp. Deleting a module archives the category and all of its active lessons for seven days in one database transaction. No lesson media, thumbnails, or additional-material objects are removed during that retention period. The administration response separates active and archived modules, the UI exposes archived modules in the existing deleted-content area, and a restore endpoint restores the module and its lessons. Expired archive cleanup removes lesson objects first and then the expired category.

The archive operation publishes nothing. Restoring a module restores the category and lessons as drafts, which prevents unfinished or previously hidden content from becoming visible to members unexpectedly.

### Draft-first publishing

New modules and lessons are created as drafts. Both editors expose a clear publication checkbox and preserve the current state while editing. Cards show a draft/published status. The existing status APIs remain the single mechanism for later publication changes, while create/update payloads carry the desired status to avoid a visible intermediate state.

### Developer authorization

Developer-only UI requires both the persisted preview mode `developer` and the authenticated user's `realRole === "owner"`. When a non-owner administrator enters the admin surface with a stale developer preview value, the UI normalizes it to `admin`. Server authorization remains unchanged and continues to be the final boundary.

### 320 px usability

At 320 px the payment product title may wrap instead of being ellipsized. Bottom-navigation labels remain visible with compact typography and spacing while preserving at least 44 x 44 px interactive targets, safe-area behavior, and no horizontal overflow.

## Data and API contract

- Migration adds nullable `content_categories.archived_until` and an archive lookup index.
- `LearningCategory` includes nullable `archivedUntil` with a backward-compatible default.
- `AdminLearningResponse` includes `deletedCategories` with a backward-compatible empty default.
- Category create/update accepts `isPublished`, defaulting to `false` for create and preserving the current state on update.
- `DELETE /api/admin/learning/categories/:id` archives rather than physically deletes.
- `POST /api/admin/learning/categories/:id/restore` restores an unexpired archived module and its lessons as drafts.
- Member learning queries exclude archived categories.

## Error handling

- Archive/restore rejects missing, non-module, already-active, or expired categories with an explicit 404/409 response as appropriate.
- Database changes for a category and its lessons are transactional.
- Object-store cleanup failures are tolerated and retried by the next cleanup pass; the database category is removed only after its lesson objects have been processed.
- The client reports save/archive/restore errors through the existing operation and dialog mechanisms.

## Verification

- API/unit tests prove archive, restore, visibility, TTL cleanup, and draft defaults.
- Component/E2E tests prove draft controls, status badges, archived-module restore, and non-owner developer-route denial.
- Responsive browser tests cover 320, 390, 768, 1024, and 1440 widths and assert no horizontal overflow or clipped payment title/navigation labels.
- Full typecheck, unit suites, production build, bundle budgets, and release Playwright matrix run before deployment.
- Payment tests use intercepted/mocked API responses only. No checkout URL is opened against a real provider and no charge is initiated.

## Scope boundary

The large `AdminSection.vue` and `LearningSection.vue` files remain technical debt. This remediation extracts only small policy helpers where they materially improve testability; a broad component rewrite is excluded because it would add release risk without closing a user-visible audit defect.
