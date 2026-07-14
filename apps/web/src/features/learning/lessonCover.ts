import { getYouTubeThumbnailUrl, type ContentKind, type LessonCoverMode } from "@club/shared";

type LessonCoverSelection = {
  coverMode: LessonCoverMode;
  thumbnailUrl: string | null;
  coverSourceUrl: string | null;
};

export function resolveLessonCoverUrl(selection: LessonCoverSelection, defaultCoverUrl: string) {
  if (selection.coverMode === "custom") {
    return selection.thumbnailUrl ?? defaultCoverUrl;
  }

  if (selection.coverMode === "first_material") {
    return selection.coverSourceUrl ?? defaultCoverUrl;
  }

  return defaultCoverUrl;
}

export function isDefaultLessonCover(selection: LessonCoverSelection) {
  if (selection.coverMode === "custom") {
    return !selection.thumbnailUrl;
  }

  if (selection.coverMode === "first_material") {
    return !selection.coverSourceUrl;
  }

  return true;
}

type LessonCoverMedia = {
  kind: ContentKind;
  mediaUrl: string | null;
};

function getVisualCoverUrl(media: LessonCoverMedia) {
  if (media.kind === "photo") return media.mediaUrl;
  if (media.kind === "video") return getYouTubeThumbnailUrl(media.mediaUrl);
  return null;
}

export function getFirstVisualLessonCoverUrl(item: LessonCoverMedia, materials: LessonCoverMedia[]) {
  return getVisualCoverUrl(item) ?? materials.map(getVisualCoverUrl).find(Boolean) ?? null;
}
