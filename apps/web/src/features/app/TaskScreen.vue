<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from "vue";
import { activatePortalTaskLayer } from "@/features/app/taskLayerRegistry";
import { UiBottomActionBar, UiPageContainer, UiPageHeader } from "@/features/ui";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  title: string;
  subtitle?: string;
  backLabel?: string;
  portal?: boolean;
}>();

defineEmits<{ back: [] }>();

const routeLayer = ref<ComponentPublicInstance | null>(null);
let releasePortalTaskLayer: (() => void) | null = null;

onMounted(async () => {
  if (!props.portal) {
    return;
  }

  await nextTick();
  const layer = routeLayer.value?.$el instanceof HTMLElement ? routeLayer.value.$el : null;
  releasePortalTaskLayer = activatePortalTaskLayer(layer);
});

onBeforeUnmount(() => {
  releasePortalTaskLayer?.();
  releasePortalTaskLayer = null;
});
</script>

<template>
  <Teleport to="body" :disabled="!portal">
    <UiPageContainer ref="routeLayer" :class="[$attrs.class, { 'task-screen-route-layer': portal }]" task>
      <section class="task-screen ui-task-screen">
        <UiPageHeader class="task-screen-header" :title="title" :subtitle="subtitle" back :back-label="backLabel || 'Назад'" @back="$emit('back')">
          <template v-if="$slots.actions" #actions>
            <div class="task-screen-actions">
              <slot name="actions" />
            </div>
          </template>
        </UiPageHeader>

        <div class="task-screen-body ui-page-content">
          <slot />
        </div>

        <UiBottomActionBar v-if="$slots.footer" class="task-screen-footer">
          <slot name="footer" />
        </UiBottomActionBar>
      </section>
    </UiPageContainer>
  </Teleport>
</template>
