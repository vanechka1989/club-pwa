export function serializeLearningProgressRows(
  rows: Array<{ contentItemId: string; completedAt: Date | null }>
) {
  const startedItemIds = [...new Set(rows.map((row) => row.contentItemId))];
  const completedItemIds = [...new Set(rows.filter((row) => row.completedAt !== null).map((row) => row.contentItemId))];

  return { startedItemIds, completedItemIds };
}
