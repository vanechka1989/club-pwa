export const categoryArchiveTtlMs = 7 * 24 * 60 * 60 * 1000;

export function getArchivedCategoryValues(now: Date) {
  return {
    isPublished: false,
    archivedUntil: new Date(now.getTime() + categoryArchiveTtlMs),
    updatedAt: now
  };
}

export function getArchivedCategoryItemValues(now: Date) {
  return {
    isPublished: false,
    publishedAt: null,
    archivedUntil: new Date(now.getTime() + categoryArchiveTtlMs),
    updatedAt: now
  };
}

export function getRestoredCategoryValues(now: Date) {
  return {
    isPublished: false,
    archivedUntil: null,
    updatedAt: now
  };
}

export function getRestoredCategoryItemValues(now: Date) {
  return {
    isPublished: false,
    publishedAt: null,
    archivedUntil: null,
    updatedAt: now
  };
}

export function getCategoryRestoreState(archivedUntil: Date | null, now: Date) {
  if (!archivedUntil) {
    return "active" as const;
  }
  return archivedUntil > now ? ("restorable" as const) : ("expired" as const);
}
