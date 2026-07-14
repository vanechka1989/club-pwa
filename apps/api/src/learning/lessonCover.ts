import { getYouTubeThumbnailUrl, type ContentKind } from "@club/shared";

type LessonCoverMedia = {
  kind: ContentKind;
  mediaUrl: string | null;
};

function getVisualCoverUrl(media: LessonCoverMedia) {
  if (media.kind === "photo") {
    return media.mediaUrl;
  }

  if (media.kind === "video") {
    return getYouTubeThumbnailUrl(media.mediaUrl);
  }

  return null;
}

export function getFirstVisualLessonCoverUrl(item: LessonCoverMedia, materials: LessonCoverMedia[]) {
  return getVisualCoverUrl(item) ?? materials.map(getVisualCoverUrl).find(Boolean) ?? null;
}
