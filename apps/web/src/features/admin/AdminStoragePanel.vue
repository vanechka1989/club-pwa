<script setup lang="ts">
import type { S3StorageObject, S3StorageSettings } from "@club/shared";
import { ChevronDown, Cloud, ExternalLink, X } from "lucide-vue-next";
import { ref } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";

type StorageTarget = "primary" | "reserve";
type StorageFolderSort = "date" | "size" | "uploader";
type StorageTask = "files" | "folder" | "settings";

interface StorageFolder {
  value: string;
  label: string;
}

interface StorageOverviewItem extends StorageFolder {
  count: number;
  sizeBytes: number;
}

interface StorageFolderGroup {
  title: string;
  objects: readonly S3StorageObject[];
  sizeBytes: number;
}

interface StorageFormValues {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  reserveEndpoint: string;
  reserveRegion: string;
  reserveBucket: string;
  reserveAccessKeyId: string;
  reserveSecretAccessKey: string;
  reservePublicBaseUrl: string;
  signedUrlTtlSeconds: number;
}

const props = defineProps<{
  storageSettings: Readonly<S3StorageSettings> | null;
  selectedStorageTarget: StorageTarget;
  selectedStorageTargetLabel: string;
  selectedStorageFilesStatus: string;
  selectedStorageSettingsStatus: string;
  selectedStorageSettingsTitle: string;
  storageOverview: readonly StorageOverviewItem[];
  storageObjects: readonly S3StorageObject[];
  storageObjectsLoading: boolean;
  storageObjectsCursor: string | null;
  storagePrefix: string;
  showStorageFilesModal: boolean;
  showStorageFolderModal: boolean;
  selectedStorageFolder: Readonly<StorageFolder> | null;
  selectedStorageFolderObjects: readonly S3StorageObject[];
  storageFolderGroups: readonly StorageFolderGroup[];
  storageSearch: string;
  storageFolderSort: StorageFolderSort;
  showStorageSettingsModal: boolean;
  storageForm: Readonly<StorageFormValues>;
  saving: boolean;
  formatStorageSize: (bytes: number) => string;
  storageObjectFileName: (key: string) => string;
  storageSourceLabel: (source: S3StorageSettings["source"]) => string;
}>();

const emit = defineEmits<{
  "select-target": [target: StorageTarget];
  "open-files": [];
  "open-settings": [];
  back: [task: StorageTask];
  refresh: [];
  "open-folder": [folder: StorageFolder];
  "search-change": [value: string];
  "sort-change": [value: StorageFolderSort];
  "open-object": [item: S3StorageObject];
  "delete-object": [item: S3StorageObject];
  "load-more": [];
  save: [];
  "storage-form-change": [form: StorageFormValues];
}>();

const storageActionGridRef = ref<HTMLElement | null>(null);

function focusStorageActions() {
  storageActionGridRef.value?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  storageActionGridRef.value?.querySelector<HTMLButtonElement>("button")?.focus();
}

defineExpose({ focusStorageActions });

function updateStorageSearch(event: Event) {
  emit("search-change", (event.target as HTMLInputElement).value.trim());
}

function updateStorageFolderSort(event: Event) {
  emit("sort-change", (event.target as HTMLSelectElement).value as StorageFolderSort);
}

function updateStorageForm(field: keyof StorageFormValues, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("storage-form-change", {
    ...props.storageForm,
    [field]: field === "signedUrlTtlSeconds" ? Number(value) : value.trim()
  } as StorageFormValues);
}
</script>

<template>
  <section class="admin-panel ui-page-section">
    <div class="admin-panel-head ui-page-header">
      <div>
        <h3>Хранилище</h3>
        <p>S3-облако для фото, видео, аудио, голосовых и обложек.</p>
      </div>
    </div>

    <article class="admin-crm-block ui-card admin-storage-block">
      <div class="admin-storage-status">
        <div>
          <div class="admin-storage-status-grid" aria-label="Статусы S3">
            <button class="admin-storage-status-card" type="button" :class="[storageSettings?.configured ? 'admin-storage-status-card-ok' : 'admin-storage-status-card-error', { 'admin-storage-status-card-active': selectedStorageTarget === 'primary' }]" @click="emit('select-target', 'primary')">
              <span>S3 основное</span>
              <strong>{{ storageSettings?.configured ? "Подключено" : "Не подключено" }}</strong>
            </button>
            <button class="admin-storage-status-card" type="button" :class="[storageSettings?.reserveConfigured ? 'admin-storage-status-card-ok' : 'admin-storage-status-card-error', { 'admin-storage-status-card-active': selectedStorageTarget === 'reserve' }]" @click="emit('select-target', 'reserve')">
              <span>S3 резервное</span>
              <strong>{{ storageSettings?.reserveConfigured ? "Подключено" : "Не подключено" }}</strong>
            </button>
          </div>
          <small>
            Источник: {{ storageSourceLabel(storageSettings?.source ?? "none") }}
            <template v-if="storageSettings?.updatedAt">· изменено {{ new Date(storageSettings.updatedAt).toLocaleString("ru-RU") }}</template>
            <template v-if="storageSettings?.configured">· резерв: {{ storageSettings.reserveConfigured ? "подключён" : "не подключён" }}</template>
          </small>
        </div>
      </div>

      <div class="admin-storage-current" :class="selectedStorageTarget === 'primary' ? 'admin-storage-current-primary' : 'admin-storage-current-reserve'"><strong>{{ selectedStorageTargetLabel }}</strong></div>

      <div ref="storageActionGridRef" class="admin-storage-action-grid ui-responsive-grid">
        <button class="admin-storage-action-card ui-card" type="button" @click="emit('open-files')">
          <span class="admin-storage-action-top"><span class="admin-storage-action-icon"><Cloud class="h-4 w-4" aria-hidden="true" /></span><ChevronDown class="admin-storage-action-arrow h-4 w-4" aria-hidden="true" /></span>
          <span class="admin-storage-action-label">Обзор файлов</span><strong>{{ selectedStorageFilesStatus }}</strong><small>Открыть файлы по папкам.</small>
        </button>
        <button class="admin-storage-action-card ui-card" type="button" @click="emit('open-settings')">
          <span class="admin-storage-action-top"><span class="admin-storage-action-icon"><ExternalLink class="h-4 w-4" aria-hidden="true" /></span><ChevronDown class="admin-storage-action-arrow h-4 w-4" aria-hidden="true" /></span>
          <span class="admin-storage-action-label">Настройки S3</span><strong>{{ selectedStorageSettingsStatus }}</strong><small>Bucket, ключи и ссылки.</small>
        </button>
      </div>

      <TaskScreen v-if="showStorageFilesModal" class="admin-task-screen" title="Обзор файлов" subtitle="Файлы S3 по папкам и связанным данным." portal @back="emit('back', 'files')">
        <section class="admin-detail ui-card admin-client-modal admin-storage-modal">
          <header class="admin-client-modal-head"><div><h3 id="admin-storage-files-title">Обзор файлов</h3><p>Файлы S3 по папкам, источникам и связанным данным.</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть обзор файлов" @click="emit('back', 'files')"><X class="h-4 w-4" aria-hidden="true" /></button></header>
          <section v-if="storageSettings?.configured" class="admin-storage-browser" aria-label="Файлы S3">
            <div class="admin-storage-browser-head"><div><strong>Папки</strong><small>{{ storageObjects.length }} файлов в списке<template v-if="storageObjectsCursor"> · есть ещё файлы</template></small></div><button class="secondary-button ui-button" type="button" :disabled="storageObjectsLoading" @click="emit('refresh')">{{ storageObjectsLoading ? "Загружаю..." : "Обновить" }}</button></div>
            <div class="admin-storage-folder-grid"><button v-for="folder in storageOverview" :key="folder.value" class="admin-storage-folder-card" :class="{ active: storagePrefix === folder.value }" type="button" :disabled="storageObjectsLoading" @click="emit('open-folder', folder)"><span>{{ folder.label }}</span><strong>{{ folder.count }} файлов</strong><small>{{ formatStorageSize(folder.sizeBytes) }}</small></button></div>
            <p class="admin-storage-hint">Выберите папку, чтобы открыть файлы в отдельном окне.</p>
          </section>
          <p v-else class="admin-empty">S3 не подключено. Откройте настройки S3 и заполните параметры бакета.</p>
        </section>
      </TaskScreen>

      <TaskScreen v-if="showStorageFolderModal && selectedStorageFolder" class="admin-task-screen" :title="selectedStorageFolder.label" :subtitle="`${selectedStorageFolderObjects.length} файлов`" portal @back="emit('back', 'folder')">
        <section class="admin-detail ui-card admin-client-modal admin-storage-modal admin-storage-folder-modal">
          <header class="admin-client-modal-head"><div><h3 id="admin-storage-folder-title">{{ selectedStorageFolder.label }}</h3><p>{{ selectedStorageFolderObjects.length }} файлов · {{ formatStorageSize(selectedStorageFolderObjects.reduce((sum, item) => sum + item.sizeBytes, 0)) }}</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть папку" @click="emit('back', 'folder')"><X class="h-4 w-4" aria-hidden="true" /></button></header>
          <div class="admin-storage-browser">
            <div class="admin-storage-browser-head"><div><strong>Файлы папки</strong><small>{{ selectedStorageFolder.value || "Все файлы" }}<template v-if="storageObjectsCursor"> · есть ещё файлы</template></small></div><button class="secondary-button ui-button" type="button" :disabled="storageObjectsLoading" @click="emit('refresh')">{{ storageObjectsLoading ? "Загружаю..." : "Обновить" }}</button></div>
            <div class="admin-storage-browser-filters"><input :value="storageSearch" class="text-input" placeholder="Поиск по имени, уроку или автору" @input="updateStorageSearch" /><select :value="storageFolderSort" class="text-input" @change="updateStorageFolderSort"><option value="date">По дате загрузки</option><option value="size">По размеру</option><option value="uploader">По автору</option></select></div>
            <div class="admin-storage-folder-group-list"><section v-for="group in storageFolderGroups" :key="group.title" class="admin-storage-folder-group"><header><div><strong>{{ group.title }}</strong><small>{{ group.objects.length }} файлов · {{ formatStorageSize(group.sizeBytes) }}</small></div></header><article v-for="item in group.objects" :key="item.key" class="admin-storage-object-card admin-storage-object-card-rich"><span class="admin-storage-object-copy"><strong>{{ storageObjectFileName(item.key) }}</strong><small>{{ item.categoryLabel }} · {{ item.fileKind }}</small><small v-if="item.uploadedBy">Загрузил: {{ item.uploadedBy.firstName || (item.uploadedBy.username ? `@${item.uploadedBy.username}` : `ID ${item.uploadedBy.telegramId}`) }}</small><small>{{ item.key }}</small><em>{{ formatStorageSize(item.sizeBytes) }}<template v-if="item.lastModified"> · {{ new Date(item.lastModified).toLocaleString("ru-RU") }}</template></em></span><span class="admin-storage-object-actions"><button class="secondary-button ui-button" type="button" @click="emit('open-object', item)">Открыть</button><button class="danger-button" type="button" :disabled="storageObjectsLoading" @click="emit('delete-object', item)">Удалить</button></span></article></section><p v-if="!storageFolderGroups.length && !storageObjectsLoading" class="admin-empty">Файлы не найдены.</p></div>
            <button v-if="storageObjectsCursor" class="secondary-button ui-button" type="button" :disabled="storageObjectsLoading" @click="emit('load-more')">Загрузить ещё</button>
          </div>
        </section>
      </TaskScreen>

      <TaskScreen v-if="showStorageSettingsModal" class="admin-task-screen" :title="selectedStorageSettingsTitle" subtitle="Меняйте только при переносе или подключении хранилища." portal @back="emit('back', 'settings')">
        <section class="admin-detail ui-card admin-client-modal admin-storage-modal"><header class="admin-client-modal-head"><div><h3 id="admin-storage-settings-title">{{ selectedStorageSettingsTitle }}</h3><p>Меняйте только если переносите или подключаете хранилище.</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть настройки S3" @click="emit('back', 'settings')"><X class="h-4 w-4" aria-hidden="true" /></button></header>
          <form class="admin-form admin-storage-settings-form" @submit.prevent="emit('save')">
            <template v-if="selectedStorageTarget === 'primary'"><label class="admin-field"><span>Endpoint URL</span><input :value="storageForm.endpoint" class="text-input" placeholder="https://s3.ru1.storage.beget.cloud" @input="updateStorageForm('endpoint', $event)" /><small>Адрес S3 API у провайдера. Для Beget обычно: https://s3.ru1.storage.beget.cloud</small></label><label class="admin-field"><span>Bucket</span><input :value="storageForm.bucket" class="text-input" placeholder="4165bebe1b26-kindhearted-keaton" @input="updateStorageForm('bucket', $event)" /><small>Имя бакета, куда будут загружаться файлы клуба.</small></label><label class="admin-field"><span>Region</span><input :value="storageForm.region" class="text-input" placeholder="us-east-1" @input="updateStorageForm('region', $event)" /><small>Регион S3. Для S3-compatible часто подходит us-east-1, если провайдер не требует другое значение.</small></label><label class="admin-field"><span>Access key</span><input :value="storageForm.accessKeyId" class="text-input" autocomplete="off" placeholder="Заполните только если меняете ключ" @input="updateStorageForm('accessKeyId', $event)" /><small>{{ storageSettings?.accessKeyConfigured ? "Access key уже сохранён. Поле можно оставить пустым." : "Публичный ключ доступа к бакету." }}</small></label><label class="admin-field"><span>Secret key</span><input :value="storageForm.secretAccessKey" class="text-input" autocomplete="new-password" type="password" placeholder="Заполните только если меняете секрет" @input="updateStorageForm('secretAccessKey', $event)" /><small>{{ storageSettings?.secretKeyConfigured ? "Secret key уже сохранён. Поле можно оставить пустым." : "Секретный ключ доступа. В интерфейсе он не раскрывается." }}</small></label><label class="admin-field"><span>Public base URL</span><input :value="storageForm.publicBaseUrl" class="text-input" placeholder="https://cdn.example.com или пусто" @input="updateStorageForm('publicBaseUrl', $event)" /><small>Необязательно. Если бакет публичный или есть CDN, файлы будут открываться по этому URL. Если пусто, приложение выдаст временную подписанную ссылку.</small></label></template>
            <section v-if="selectedStorageTarget === 'reserve'" class="admin-storage-reserve"><header><div><strong>Резервная S3</strong><small>Резерв не обязателен.<template v-if="storageSettings?.reserveConfigured"> Сейчас подключен.</template><template v-else> Если заполнить, новые загрузки будут зеркалиться туда.</template></small></div></header><label class="admin-field"><span>Reserve Endpoint URL</span><input :value="storageForm.reserveEndpoint" class="text-input" placeholder="https://reserve-s3.example.com" @input="updateStorageForm('reserveEndpoint', $event)" /></label><label class="admin-field"><span>Reserve Bucket</span><input :value="storageForm.reserveBucket" class="text-input" placeholder="club-reserve" @input="updateStorageForm('reserveBucket', $event)" /></label><label class="admin-field"><span>Reserve Region</span><input :value="storageForm.reserveRegion" class="text-input" placeholder="us-east-1" @input="updateStorageForm('reserveRegion', $event)" /></label><label class="admin-field"><span>Reserve Access key</span><input :value="storageForm.reserveAccessKeyId" class="text-input" autocomplete="off" placeholder="Заполните только если меняете ключ" @input="updateStorageForm('reserveAccessKeyId', $event)" /><small>{{ storageSettings?.reserveAccessKeyConfigured ? "Reserve Access key уже сохранён." : "Ключ резервного бакета." }}</small></label><label class="admin-field"><span>Reserve Secret key</span><input :value="storageForm.reserveSecretAccessKey" class="text-input" autocomplete="new-password" type="password" placeholder="Заполните только если меняете секрет" @input="updateStorageForm('reserveSecretAccessKey', $event)" /><small>{{ storageSettings?.reserveSecretKeyConfigured ? "Reserve Secret key уже сохранён." : "Секрет резервного бакета." }}</small></label><label class="admin-field"><span>Reserve Public base URL</span><input :value="storageForm.reservePublicBaseUrl" class="text-input" placeholder="https://reserve-cdn.example.com или пусто" @input="updateStorageForm('reservePublicBaseUrl', $event)" /></label></section>
            <label v-if="selectedStorageTarget === 'primary'" class="admin-field"><span>TTL подписанной ссылки, сек.</span><input :value="storageForm.signedUrlTtlSeconds" class="text-input" min="60" max="86400" type="number" @input="updateStorageForm('signedUrlTtlSeconds', $event)" /><small>Сколько живёт приватная ссылка на файл. Обычно 3600 секунд достаточно.</small></label><p class="admin-storage-warning">При смене bucket или провайдера старые файлы останутся в прежнем облаке. Чтобы они открывались после смены, их нужно перенести в новый bucket с теми же object key.</p><button class="primary-button ui-button" type="submit" :disabled="saving">Сохранить S3</button>
          </form>
        </section>
      </TaskScreen>
    </article>
  </section>
</template>
