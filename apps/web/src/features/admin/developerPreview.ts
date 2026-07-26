import type { UserRole } from "@club/shared";
import type { PreviewMode } from "@/stores/ui";

export function canUseDeveloperPreview(realRole: UserRole | undefined, previewMode: PreviewMode) {
  return realRole === "owner" && previewMode === "developer";
}

export function normalizeAdminPreviewMode(realRole: UserRole | undefined, previewMode: PreviewMode): PreviewMode {
  return realRole !== "owner" && previewMode === "developer" ? "admin" : previewMode;
}
