<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { X } from "lucide-vue-next";
import { useImageViewerGestures } from "@/features/community/useImageViewerGestures";

defineProps<{ url: string; alt: string }>();

const emit = defineEmits<{ close: [] }>();
const viewer = useImageViewerGestures();
let isClosing = false;

function finishClose() {
  if (isClosing) return;
  isClosing = true;
  emit("close");
}

function close() {
  if (window.history.state?.lessonImageViewer) {
    window.history.back();
    return;
  }
  finishClose();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

onMounted(() => {
  document.body.classList.add("club-lesson-image-viewer-open");
  window.history.pushState({ ...window.history.state, lessonImageViewer: true }, "", window.location.href);
  window.addEventListener("popstate", finishClose);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.body.classList.remove("club-lesson-image-viewer-open");
  window.removeEventListener("popstate", finishClose);
  window.removeEventListener("keydown", handleKeydown);
  viewer.reset();
});
</script>

<template>
  <Teleport to="body">
    <div class="lesson-image-viewer" role="dialog" aria-modal="true" aria-label="Просмотр изображения">
      <div class="lesson-image-viewer-stage">
        <img
          :src="url"
          :alt="alt"
          :style="viewer.imageStyle.value"
          draggable="false"
          @pointerdown="viewer.onPointerDown"
          @pointermove="viewer.onPointerMove"
          @pointerup="viewer.onPointerUp"
          @pointercancel="viewer.onPointerUp"
          @dblclick="viewer.toggleZoom"
        />
      </div>
      <button class="lesson-image-viewer-close" type="button" aria-label="Закрыть изображение" @click="close">
        <X aria-hidden="true" />
      </button>
    </div>
  </Teleport>
</template>
