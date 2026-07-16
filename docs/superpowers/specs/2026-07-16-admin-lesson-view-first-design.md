# Admin Lesson View-First Design

## Goal

Administrators and developers must open an existing lesson in the same viewer that ordinary members see. Editing starts only after an explicit action in the lesson header.

## User flow

1. Selecting an existing lesson always opens `/learning/lessons/:lessonId` in viewer mode.
2. Members see the current lesson viewer without administrative controls.
3. Users with module-management permission see one compact **Редактировать** action with a pencil icon on the right side of the task header.
4. Selecting **Редактировать** changes the route to `/learning/lessons/:lessonId/edit` and replaces the viewer body with the existing editor.
5. Back from editor mode returns to the viewer for the same lesson without closing the task screen.
6. Back from viewer mode closes the lesson and returns to the modules list.
7. Saving an existing lesson refreshes its data and returns to viewer mode.
8. Creating a new lesson still opens the editor immediately because there is no saved lesson to preview.

## UI rules

- Viewer content is identical for members and administrators.
- The edit action uses the existing task-header action slot and the standard icon-button/button tokens.
- The action has the accessible name **Редактировать урок**.
- Editor-only controls, delete action, fields, and upload controls are never rendered in viewer mode.
- The edit action is not rendered for members or while creating a new lesson.
- No backend or learning-content contract changes are required.

## State and routing

- Derive editor state from the current learning task path rather than from the user role.
- `openLessonModal` always opens the viewer route for existing lessons.
- A dedicated action switches the current lesson to its `/edit` route.
- The task-screen back handler distinguishes editor and viewer routes.
- Existing deep links to `/learning/lessons/:lessonId/edit` continue to open the editor for authorized users; unauthorized users fall back to viewer mode.

## Error handling

- Existing lesson loading errors continue to appear inside the viewer.
- Saving errors keep the administrator in editor mode with the current form state.
- Only a successful save returns to viewer mode.

## Testing

- Owner/admin opening an existing lesson sees viewer content and no editor fields.
- Owner/admin sees the header edit action; member does not.
- The edit action opens the editor and changes the route.
- Back from editor returns to viewer; back from viewer closes the lesson.
- Successful save returns to viewer.
- New-lesson creation remains editor-first.
- Run focused learning tests, full tests, type checks, production build, and mobile visual review.
