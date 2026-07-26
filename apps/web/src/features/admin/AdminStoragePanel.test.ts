import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import AdminStoragePanel from "./AdminStoragePanel.vue";

const storageForm = {
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicBaseUrl: "",
  reserveEndpoint: "",
  reserveRegion: "us-east-1",
  reserveBucket: "",
  reserveAccessKeyId: "",
  reserveSecretAccessKey: "",
  reservePublicBaseUrl: "",
  signedUrlTtlSeconds: 3600
};

describe("AdminStoragePanel", () => {
  afterEach(cleanup);

  it("emits the file-overview intent without owning storage operations", async () => {
    const { emitted } = render(AdminStoragePanel, {
      props: {
        storageSettings: null,
        selectedStorageTarget: "primary",
        selectedStorageTargetLabel: "S3 основное",
        selectedStorageFilesStatus: "Не подключено",
        selectedStorageSettingsStatus: "Заполнить",
        selectedStorageSettingsTitle: "Настройки S3 основного",
        storageOverview: [],
        storageObjects: [],
        storageObjectsLoading: false,
        storageObjectsCursor: null,
        storagePrefix: "",
        showStorageFilesModal: false,
        showStorageFolderModal: false,
        selectedStorageFolder: null,
        selectedStorageFolderObjects: [],
        storageFolderGroups: [],
        storageSearch: "",
        storageFolderSort: "date",
        showStorageSettingsModal: false,
        storageForm,
        saving: false,
        formatStorageSize: (bytes: number) => `${bytes} Б`,
        storageObjectFileName: (key: string) => key,
        storageSourceLabel: () => "не подключено"
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: /Обзор файлов/i }));

    expect(emitted()["open-files"]).toEqual([[]]);
  });
});
