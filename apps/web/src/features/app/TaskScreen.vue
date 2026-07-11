<script setup lang="ts">
import { UiBottomActionBar, UiPageContainer, UiPageHeader } from "@/features/ui";

defineOptions({ inheritAttrs: false });

defineProps<{
  title: string;
  subtitle?: string;
  backLabel?: string;
  portal?: boolean;
}>();

defineEmits<{ back: [] }>();
</script>

<template>
  <Teleport to="body" :disabled="!portal">
  <div :class="[$attrs.class, { 'task-screen-route-layer': portal }]">
  <UiPageContainer task>
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
  </div>
  </Teleport>
</template>
