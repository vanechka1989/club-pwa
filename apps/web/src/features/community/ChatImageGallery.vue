<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, ref } from "vue";
import { X, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useImageViewerGestures } from "./useImageViewerGestures";
const props = defineProps<{ images: ClubMessage["images"] }>();
const activeIndex = ref<number | null>(null);
const visible = computed(() => props.images.filter((image) => image.url && !image.deletedAt));
const viewer = useImageViewerGestures();
function close() { activeIndex.value = null; viewer.reset(); }
function move(delta: number) {
  if (activeIndex.value !== null && visible.value.length) activeIndex.value = (activeIndex.value + delta + visible.value.length) % visible.value.length;
  viewer.reset();
}
</script>
<template>
  <p v-if="!visible.length" class="chat-media-expired">Изображения удалены по сроку хранения</p>
  <div v-else class="chat-image-gallery" :class="`chat-image-gallery-${Math.min(visible.length, 5)}`">
    <button v-for="(image, index) in visible.slice(0, 5)" :key="image.id" type="button" @click.stop="activeIndex = index">
      <img :src="image.url ?? ''" :alt="`Изображение ${index + 1} из ${visible.length}`" />
      <span v-if="index === 4 && visible.length > 5">+{{ visible.length - 5 }}</span>
    </button>
  </div>
  <Teleport to="body">
    <div v-if="activeIndex !== null" class="chat-image-viewer" @click.self="close">
      <button class="chat-viewer-close" type="button" aria-label="Закрыть" @click="close"><X /></button>
      <button v-if="visible.length > 1" type="button" aria-label="Предыдущее" @click="move(-1)"><ChevronLeft /></button>
      <div class="chat-viewer-stage">
        <img
          :src="visible[activeIndex]?.url ?? ''"
          :alt="`Изображение ${activeIndex + 1}`"
          :style="viewer.imageStyle.value"
          draggable="false"
          @pointerdown="viewer.onPointerDown"
          @pointermove="viewer.onPointerMove"
          @pointerup="viewer.onPointerUp"
          @pointercancel="viewer.onPointerUp"
          @dblclick="viewer.toggleZoom"
        />
      </div>
      <button v-if="visible.length > 1" type="button" aria-label="Следующее" @click="move(1)"><ChevronRight /></button>
    </div>
  </Teleport>
</template>
