import { describe, expect, it, vi } from "vitest";
import { createS3AllVersionDeletionProbe } from "./s3DeletionProbe";

describe("production S3 all-version deletion probe", () => {
  it("creates versions and a delete marker, deletes each VersionId, and verifies emptiness", async () => {
    const objects = [
      { key: "probe", versionId: "v2", kind: "version" as const },
      { key: "probe", versionId: "v1", kind: "version" as const },
      { key: "probe", versionId: "marker", kind: "delete-marker" as const }
    ];
    const deleteVersions = vi.fn(async (removed: typeof objects) => {
      objects.splice(0, objects.length, ...objects.filter((object) => !removed.includes(object)));
    });
    const probe = createS3AllVersionDeletionProbe({
      put: vi.fn(async () => undefined),
      deleteCurrent: vi.fn(async () => undefined),
      list: async () => objects.slice(),
      deleteVersions
    });

    await expect(probe("probe")).resolves.toEqual({ versions: 2, deleteMarkers: 1 });
    expect(deleteVersions).toHaveBeenCalledWith([
      { key: "probe", versionId: "v2", kind: "version" },
      { key: "probe", versionId: "v1", kind: "version" },
      { key: "probe", versionId: "marker", kind: "delete-marker" }
    ]);
  });

  it("fails closed if credentials cannot create a delete marker or leave a version behind", async () => {
    const probeWithoutMarker = createS3AllVersionDeletionProbe({
      put: async () => undefined,
      deleteCurrent: async () => undefined,
      list: async () => [
        { key: "probe", versionId: "v2", kind: "version" },
        { key: "probe", versionId: "v1", kind: "version" }
      ],
      deleteVersions: async () => undefined
    });
    await expect(probeWithoutMarker("probe")).rejects.toThrow("delete marker");
  });
});
