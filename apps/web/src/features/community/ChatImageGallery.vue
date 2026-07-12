<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, ref } from "vue";
import { X, ChevronLeft, ChevronRight } from "lucide-vue-next";
const props = defineProps<{ images: ClubMessage["images"] }>();
const activeIndex = ref<number | null>(null);
const visible = computed(() => props.images.filter((image) => image.url && !image.deletedAt));
function move(delta: number) { if (activeIndex.value !== null && visible.value.length) activeIndex.value = (activeIndex.value + delta + visible.value.length) % visible.value.length; }
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
    <div v-if="activeIndex !== null" class="chat-image-viewer" @click.self="activeIndex = null">
      <button class="chat-viewer-close" type="button" aria-label="Закрыть" @click="activeIndex = null"><X /></button>
      <button v-if="visible.length > 1" type="button" aria-label="Предыдущее" @click="move(-1)"><ChevronLeft /></button>
      <img :src="visible[activeIndex]?.url ?? ''" :alt="`Изображение ${activeIndex + 1}`" />
      <button v-if="visible.length > 1" type="button" aria-label="Следующее" @click="move(1)"><ChevronRight /></button>
    </div>
  </Teleport>
</template>
