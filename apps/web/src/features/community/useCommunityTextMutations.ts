import type { ClubMessage, CommunityMention } from "@club/shared";
import type { Ref } from "vue";
import { deleteCommunityMessage, editCommunityMessage } from "@/api/client";
import { saveDraft } from "./communityDrafts";
import {
  queueTextMessage,
  retryQueuedMessage,
  type QueuedTextMessage
} from "./communityOutbox";

type SendRoom = {
  topicId: string;
  isCurrent: () => boolean;
};

type TextMutationState = {
  messages: Ref<ClubMessage[]>;
  queuedMessages: Ref<QueuedTextMessage[]>;
  draft: Ref<string>;
  reply: Ref<ClubMessage | null>;
  editing: Ref<ClubMessage | null>;
  draftBeforeEdit: Ref<string>;
  activeActionId: Ref<string | null>;
  saving: Ref<boolean>;
  composerResetVersion: Ref<number>;
  selectedTopicId: () => string | null;
  captureSendRoom: () => SendRoom | null;
  confirmDelete: () => Promise<boolean>;
  clearError: () => void;
  showError: (message: string) => void;
  applyMute: (state: { mutedUntil?: string | null; mutedPermanently?: boolean }) => void;
};

export function useCommunityTextMutations(state: TextMutationState) {
  async function sendText(body: string, mentions: CommunityMention[]) {
    const room = state.captureSendRoom();
    if (!room || !body.trim()) return;
    state.saving.value = true;
    state.clearError();
    try {
      const result = await queueTextMessage<ClubMessage>({
        topicId: room.topicId,
        body,
        mentions,
        replyToMessageId: state.reply.value?.id ?? null
      });
      if (result.delivered || result.retryable) {
        saveDraft(room.topicId, "");
        if (room.isCurrent()) {
          state.draft.value = "";
          state.reply.value = null;
        }
      }
      if (!result.delivered && result.retryable) {
        if (room.isCurrent()) state.showError("Сообщение сохранено и будет отправлено при восстановлении связи.");
      } else if (!result.delivered) {
        saveDraft(room.topicId, body);
        if (!room.isCurrent()) return;
        state.draft.value = body;
        const data =
          typeof result.error === "object" && result.error && "data" in result.error
            ? (result.error.data as { mutedUntil?: string | null; mutedPermanently?: boolean } | undefined)
            : undefined;
        if (data?.mutedUntil || data?.mutedPermanently) state.applyMute(data);
        state.showError("Не удалось отправить сообщение.");
      }
    } catch {
      saveDraft(room.topicId, body);
      if (room.isCurrent()) {
        state.draft.value = body;
        state.showError("Не удалось подготовить сообщение к отправке.");
      }
    } finally {
      if (room.isCurrent()) state.saving.value = false;
    }
  }

  function changeDraft(text: string) {
    state.draft.value = text;
    const topicId = state.selectedTopicId();
    if (topicId && !state.editing.value) saveDraft(topicId, text);
  }

  function startEdit(message: ClubMessage) {
    if (!state.selectedTopicId()) return;
    state.draftBeforeEdit.value = state.draft.value;
    state.editing.value = message;
    state.reply.value = null;
    state.draft.value = message.body;
    state.activeActionId.value = null;
    state.composerResetVersion.value += 1;
  }

  function cancelEdit() {
    const previousDraft = state.draftBeforeEdit.value;
    state.editing.value = null;
    state.draftBeforeEdit.value = "";
    state.draft.value = previousDraft;
    const topicId = state.selectedTopicId();
    if (topicId) saveDraft(topicId, previousDraft);
    state.composerResetVersion.value += 1;
  }

  async function saveEdit(message: ClubMessage, body: string, mentions: CommunityMention[]) {
    if (state.editing.value?.id !== message.id || state.saving.value) return;
    state.saving.value = true;
    state.clearError();
    try {
      const response = await editCommunityMessage(message.id, { body, mentions });
      state.messages.value = state.messages.value.map((item) =>
        item.id === response.message.id ? response.message : item
      );
      cancelEdit();
    } catch {
      state.showError("Не удалось сохранить изменения. Текст оставлен в редакторе.");
    } finally {
      state.saving.value = false;
    }
  }

  async function deleteOwn(message: ClubMessage) {
    if (!await state.confirmDelete()) {
      state.activeActionId.value = null;
      return;
    }
    try {
      const response = await deleteCommunityMessage(message.id);
      state.messages.value = state.messages.value.map((item) =>
        item.id === response.message.id ? response.message : item
      );
      state.activeActionId.value = null;
      if (state.editing.value?.id === message.id) cancelEdit();
    } catch {
      state.showError("Не удалось удалить сообщение.");
    }
  }

  async function retry(message: ClubMessage) {
    const entry = state.queuedMessages.value.find((item) => item.deliveryKey === message.clientOperationId);
    if (!entry) return;
    state.clearError();
    try {
      const result = await retryQueuedMessage<ClubMessage>(entry.localId);
      if (!result.delivered && result.retryable) {
        state.showError("Сообщение пока не отправлено. Можно повторить позже.");
      } else if (!result.delivered) {
        state.showError("Не удалось отправить сообщение.");
      }
    } catch {
      state.showError("Не удалось повторить отправку.");
    }
  }

  return { sendText, changeDraft, startEdit, cancelEdit, saveEdit, deleteOwn, retry };
}
