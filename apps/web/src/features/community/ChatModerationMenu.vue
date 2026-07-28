<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { Ban, Pin, PinOff, RotateCcw, Trash2, UserX, X } from "lucide-vue-next";
import { onBeforeUnmount, onMounted } from "vue";
import { authorName, formatMuteLabel } from "./communityViewModel";

defineProps<{
  message: ClubMessage;
}>();

const emit = defineEmits<{
  close: [];
  togglePin: [message: ClubMessage];
  toggleStatus: [message: ClubMessage, status: "visible" | "hidden" | "deleted"];
  mute: [message: ClubMessage];
  revokeMute: [message: ClubMessage];
  deleteAuthorMessages: [message: ClubMessage];
}>();

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="moderation-action-sheet-backdrop" @click.self="$emit('close')">
      <section
        class="moderation-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderation-sheet-title"
      >
        <header class="moderation-action-sheet-header">
          <div>
            <p>Действия с сообщением</p>
            <h3 id="moderation-sheet-title">{{ authorName(message) }}</h3>
            <span v-if="message.authorMute">{{ formatMuteLabel(message) }}</span>
          </div>
          <button type="button" aria-label="Закрыть" @click="$emit('close')">
            <X class="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div class="moderation-action-list">
          <button class="moderation-action-row" type="button" @click="$emit('togglePin', message)">
            <PinOff v-if="message.pinnedAt" class="h-5 w-5" aria-hidden="true" />
            <Pin v-else class="h-5 w-5" aria-hidden="true" />
            <span>{{ message.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение" }}</span>
          </button>
          <button
            class="moderation-action-row"
            :class="{ 'moderation-action-danger': message.status === 'visible' }"
            type="button"
            @click="$emit('toggleStatus', message, message.status === 'visible' ? 'deleted' : 'visible')"
          >
            <Trash2 v-if="message.status === 'visible'" class="h-5 w-5" aria-hidden="true" />
            <RotateCcw v-else class="h-5 w-5" aria-hidden="true" />
            <span>{{ message.status === "visible" ? "Удалить сообщение" : "Вернуть сообщение" }}</span>
          </button>
          <button
            v-if="message.authorMute"
            class="moderation-action-row"
            type="button"
            @click="$emit('revokeMute', message)"
          >
            <RotateCcw class="h-5 w-5" aria-hidden="true" />
            <span>Снять ограничение</span>
          </button>
          <button v-else class="moderation-action-row" type="button" @click="$emit('mute', message)">
            <Ban class="h-5 w-5" aria-hidden="true" />
            <span>Ограничить до ручного снятия</span>
          </button>
          <button
            class="moderation-action-row moderation-action-danger"
            type="button"
            @click="$emit('deleteAuthorMessages', message)"
          >
            <UserX class="h-5 w-5" aria-hidden="true" />
            <span>Удалить все сообщения пользователя</span>
          </button>
        </div>

        <button class="moderation-action-cancel" type="button" @click="$emit('close')">Отмена</button>
      </section>
    </div>
  </Teleport>
</template>
