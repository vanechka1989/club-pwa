export type SortOrderUpdate = {
  id: string;
  sortOrder: number;
};

export type ReorderValidationResult =
  | {
      ok: true;
      updates: SortOrderUpdate[];
    }
  | {
      ok: false;
      reason: "duplicate" | "mismatch";
    };

export function buildSortOrderUpdates(ids: string[]): SortOrderUpdate[] {
  return ids.map((id, index) => ({
    id,
    sortOrder: index
  }));
}

export function validateReorderIds(ids: string[], existingIds: string[]): ReorderValidationResult {
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    return { ok: false, reason: "duplicate" };
  }

  if (ids.length !== existingIds.length) {
    return { ok: false, reason: "mismatch" };
  }

  const existingSet = new Set(existingIds);
  if (ids.some((id) => !existingSet.has(id))) {
    return { ok: false, reason: "mismatch" };
  }

  return {
    ok: true,
    updates: buildSortOrderUpdates(ids)
  };
}
