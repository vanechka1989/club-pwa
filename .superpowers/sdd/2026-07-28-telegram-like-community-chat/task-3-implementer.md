# Task 3 implementer report

Status: DONE

Implementation:

- Split the community chat presentation into typed topic-list, room, message, composer, and moderation components.
- Kept API and realtime orchestration in `CommunitySection.vue`; `ChatMessage.vue` and `ChatTopicList.vue` have no API client dependency.
- Added the stable `ChatMessageAction` payload, visible-reaction types, and shared presentation helpers in `communityViewModel.ts`.
- Preserved topic creation, archive restoration, pinned-message navigation, swipe replies, reactions, polls, media drafts, moderation, and composer reset behavior.
- Updated source-ownership tests to read the new component that owns each unchanged UI contract.

TDD evidence:

- RED: the new boundary suite failed because `CommunitySection.vue` was 60,316 characters and the presentation boundaries did not exist.
- Migration RED: focused community tests exposed 13 stale source-owner assertions; the first full web run exposed three more stale cross-feature assertions.
- GREEN: focused community tests passed 50/50; the full web suite passed 869/869.
- Typecheck: `pnpm --filter @club/web check` passed.

Self-review:

- Checked the section remains below the 45,000-character boundary and still owns every API/realtime call.
- Checked typed message/composer events, upload retry retention, successful draft reset, reaction completion timing, pinned-message highlight cleanup, and initial scroll-to-bottom timing.
- Checked 44-pixel controls, pinned-message accessibility, iPhone composer stability, archive labels, admin-only topics, avatar loading/cropping, header semantics, and reaction placement remain covered.
- Checked `git diff --check`.

Concerns: the full suite still prints existing `LearningSection` router-injection warnings, but all 869 tests pass.
