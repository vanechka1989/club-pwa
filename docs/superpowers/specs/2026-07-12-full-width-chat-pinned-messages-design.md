# Full-width chat and pinned messages

Community chat uses the existing application shell but fills its available width and height. The room is a four-row grid: header, notices, one scrollable message list, and the composer. This keeps the composer at the bottom for empty and short conversations without fixed positioning, and lets the visual viewport resize the shell when the keyboard opens.

The header, message list, notices, and composer own only their safe-area-aware inner padding; the room itself adds no duplicate horizontal inset. Light themes explicitly use the primary foreground color for the emoji control.

Moderators and administrators can pin visible user messages. A topic may contain at most five visible pins. The compact pin banner displays the newest pin and total count; expanding it lists all pins, and selecting one scrolls its message into view. Hiding or bulk-deleting a message clears its pin metadata.
