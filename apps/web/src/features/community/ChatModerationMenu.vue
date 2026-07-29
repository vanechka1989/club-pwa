<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { Ban, MessageCircleReply, Pencil, Pin, PinOff, RotateCcw, Trash2, UserX, X } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  authorName,
  formatMuteLabel,
  reactionOptions,
  type VisibleMessageReaction
} from "./communityViewModel";

defineProps<{
  message: ClubMessage;
  isModerator: boolean;
  canEdit: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  close: [];
  reply: [message: ClubMessage];
  react: [message: ClubMessage, reaction: VisibleMessageReaction];
  edit: [message: ClubMessage];
  deleteSelf: [message: ClubMessage];
  togglePin: [message: ClubMessage];
  toggleStatus: [message: ClubMessage, status: "visible" | "hidden" | "deleted"];
  mute: [message: ClubMessage];
  revokeMute: [message: ClubMessage];
  deleteAuthorMessages: [message: ClubMessage];
}>();

const sheet = ref<HTMLElement | null>(null);

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  if (event.key !== "Tab" || !sheet.value) return;
  const controls = [...sheet.value.querySelectorAll<HTMLElement>("button:not([disabled])")];
  if (!controls.length) return;
  const first = controls[0]!;
  const last = controls.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  void nextTick(() => sheet.value?.querySelector<HTMLElement>("button")?.focus());
});
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="moderation-action-sheet-backdrop" @click.self="$emit('close')">
      <section
        ref="sheet"
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
          <div v-if="!message.deletedByUserAt" class="message-action-reactions" role="group" aria-label="Реакции">
            <button
              v-for="option in reactionOptions"
              :key="option.value"
              type="button"
              :aria-label="`Поставить реакцию ${option.label}`"
              :aria-pressed="message.myReaction === option.value"
              @click="$emit('react', message, option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <button v-if="!message.deletedByUserAt" class="moderation-action-row" type="button" @click="$emit('reply', message)">
            <MessageCircleReply class="h-5 w-5" aria-hidden="true" />
            <span>Ответить</span>
          </button>
          <button
            v-if="canEdit"
            class="moderation-action-row"
            type="button"
            aria-label="Редактировать сообщение"
            @click="$emit('edit', message)"
          >
            <Pencil class="h-5 w-5" aria-hidden="true" />
            <span>Редактировать</span>
          </button>
          <button
            v-if="canDelete"
            class="moderation-action-row moderation-action-danger"
            type="button"
            aria-label="Удалить своё сообщение"
            @click="$emit('deleteSelf', message)"
          >
            <Trash2 class="h-5 w-5" aria-hidden="true" />
            <span>Удалить сообщение</span>
          </button>
          <button
            v-if="isModerator"
            class="moderation-action-row"
            type="button"
            @click="$emit('togglePin', message)"
          >
            <PinOff v-if="message.pinnedAt" class="h-5 w-5" aria-hidden="true" />
            <Pin v-else class="h-5 w-5" aria-hidden="true" />
            <span>{{ message.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение" }}</span>
          </button>
          <button
            v-if="isModerator"
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
            v-if="isModerator && message.authorMute"
            class="moderation-action-row"
            type="button"
            @click="$emit('revokeMute', message)"
          >
            <RotateCcw class="h-5 w-5" aria-hidden="true" />
            <span>Снять ограничение</span>
          </button>
          <button v-else-if="isModerator" class="moderation-action-row" type="button" @click="$emit('mute', message)">
            <Ban class="h-5 w-5" aria-hidden="true" />
            <span>Ограничить до ручного снятия</span>
          </button>
          <button
            v-if="isModerator"
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
