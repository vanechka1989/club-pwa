<script setup lang="ts">
import { ChevronDown, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { useI18n } from "@/features/app/i18n";
import { getLocalizedReleaseNotes } from "@/features/app/releaseNotes";
import { appVersion } from "@/features/app/version";

const emit = defineEmits<{ back: [] }>();
const { currentLocale } = useI18n();
const localizedReleaseNotes = computed(() => getLocalizedReleaseNotes(currentLocale.value));
const expandedReleaseVersion = ref(appVersion);

function toggleReleaseNote(version: string) {
  expandedReleaseVersion.value = expandedReleaseVersion.value === version ? "" : version;
}
</script>

<template>
  <TaskScreen class="admin-task-screen" title="Обновления" subtitle="История изменений приложения по версиям." portal @back="emit('back')">
    <section class="admin-detail ui-card admin-client-modal release-notes-modal">
      <header class="admin-client-modal-head">
        <div>
          <h3 id="release-notes-title">Обновления</h3>
          <p>История изменений приложения по версиям.</p>
        </div>
        <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть список обновлений" @click="emit('back')">
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div class="release-notes-list">
        <article v-for="note in localizedReleaseNotes" :key="note.version" class="release-note-card">
          <button class="release-note-head" type="button" @click="toggleReleaseNote(note.version)">
            <span>
              <strong>v{{ note.version }}</strong>
              <small>{{ note.updatedAt }}</small>
            </span>
            <span class="release-note-title">{{ note.title }}</span>
            <ChevronDown class="h-4 w-4" :class="{ 'admin-accordion-icon-open': expandedReleaseVersion === note.version }" aria-hidden="true" />
          </button>
          <ul v-if="expandedReleaseVersion === note.version" class="release-note-items">
            <li v-for="item in note.items" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>
    </section>
  </TaskScreen>
</template>
