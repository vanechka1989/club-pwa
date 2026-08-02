# Learning Engagement Dashboard Design

## Goal

Bring visual order to the admin learning analytics screen without changing its API, date filtering, drill-down behavior, or business calculations.

## Chosen Layout

Use three clearly separated levels: a single overview card containing four equal KPI cells, a dedicated assessment card, and a materials section with a heading and consistently structured material cards. This keeps related values together and avoids the current impression of unrelated floating tiles.

Each material card keeps its category, title, viewers, opens, average time, quick exits, engaged views, completions, and video duration. Quick exits gain a proportional horizontal indicator so the most important quality signal is visible without comparing every number manually. Footer facts become compact pills instead of a loose text line.

## Responsive and Accessibility Rules

- Preserve the existing two-column KPI and metric grids on phones and four overview columns from 768 px.
- Keep all cards at the same width with at least 8 px vertical spacing and no horizontal overflow from 320 through 1440 px.
- Keep every material card as a semantic button with its existing accessible drill-down behavior and a minimum 44 px target.
- Preserve designed loading, empty, error, and member drill-down states.
- Reuse existing semantic colors and typography tokens; do not change theme tokens or business data.

## Verification

Add a browser regression to open the learning detail, verify the three-level structure, equal card widths, bounded quick-exit bars, and responsive integrity. Run unit tests, type checks, production build, and the full release browser suite before deployment.
