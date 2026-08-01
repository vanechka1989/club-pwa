# Lesson editor order and publish switch implementation plan

1. Add failing regression tests asserting that assessment settings follow cover controls and precede lesson content, and that publication uses a compact custom switch.
2. Move the assessment settings card in `LearningSection.vue` and update the publication control markup.
3. Add scoped responsive switch styles to `learningRoute.css`.
4. Update release metadata and the service-worker cache version.
5. Run focused and full verification, review the diff, commit, push, deploy, and verify production health.
