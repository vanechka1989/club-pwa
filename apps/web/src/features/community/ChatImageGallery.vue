<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, ref } from "vue";
import { X, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useImageViewerGestures } from "./useImageViewerGestures";
import { useReactiveRetention } from "./useReactiveRetention";
const props = defineProps<{ images: ClubMessage["images"] }>();
const activeIndex = ref<number | null>(null);
const retention = useReactiveRetention(() => props.images.map((image) => image.expiresAt));
function removed(image: ClubMessage["images"][number]) {
  return Boolean(image.deletedAt || image.scanStatus === "deleted" || retention.isExpired(image.expiresAt));
}
const visible = computed(() => props.images.filter((image) => image.scanStatus === "ready" && image.url && !removed(image)));
const pendingCount = computed(() => props.images.filter((image) => !removed(image) && (image.scanStatus === "pending" || image.scanStatus === "scanning")).length);
const failedCount = computed(() => props.images.filter((image) => !removed(image) && image.scanStatus === "failed").length);
const rejectedCount = computed(() => props.images.filter((image) => !removed(image) && image.scanStatus === "rejected").length);
const allRemoved = computed(() => props.images.length > 0 && props.images.every(removed));
const viewer = useImageViewerGestures();
function close() { activeIndex.value = null; viewer.reset(); }
function move(delta: number) {
  if (activeIndex.value !== null && visible.value.length) activeIndex.value = (activeIndex.value + delta + visible.value.length) % visible.value.length;
  viewer.reset();
}
</script>
<template>
  <p v-if="pendingCount" class="chat-media-state chat-media-pending" role="status">{{ pendingCount === 1 ? "Изображение обрабатывается" : `Изображения обрабатываются: ${pendingCount}` }}</p>
  <p v-if="failedCount" class="chat-media-state chat-media-failed" role="status">{{ failedCount === 1 ? "Не удалось обработать изображение" : `Не удалось обработать изображения: ${failedCount}` }}</p>
  <p v-if="rejectedCount" class="chat-media-state chat-media-rejected" role="status">{{ rejectedCount === 1 ? "Изображение заблокировано" : `Изображения заблокированы: ${rejectedCount}` }}</p>
  <p v-if="allRemoved" class="chat-media-expired">Изображения удалены по сроку хранения</p>
  <div v-if="visible.length" class="chat-image-gallery" :class="`chat-image-gallery-${Math.min(visible.length, 5)}`">
    <button v-for="(image, index) in visible.slice(0, 5)" :key="image.id" type="button" @click.stop="activeIndex = index">
      <img :src="image.url ?? ''" :alt="`Изображение ${index + 1} из ${visible.length}`" />
      <span v-if="index === 4 && visible.length > 5">+{{ visible.length - 5 }}</span>
    </button>
  </div>
  <Teleport to="body">
    <div v-if="activeIndex !== null" class="chat-image-viewer" @click.self="close">
      <button class="chat-viewer-close" type="button" aria-label="Закрыть" @click="close"><X /></button>
      <button v-if="visible.length > 1" class="chat-viewer-previous" type="button" aria-label="Предыдущее" @click="move(-1)"><ChevronLeft /></button>
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
      <button v-if="visible.length > 1" class="chat-viewer-next" type="button" aria-label="Следующее" @click="move(1)"><ChevronRight /></button>
    </div>
  </Teleport>
</template>
