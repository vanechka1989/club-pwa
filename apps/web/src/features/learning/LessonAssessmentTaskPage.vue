<script setup lang="ts">
import type { LessonAssessmentConfig } from "@club/shared";
import LessonAssessmentPlayer from "./LessonAssessmentPlayer.vue";

defineProps<{ lessonId: string; assessment: LessonAssessmentConfig }>();
const emit = defineEmits<{ completed: [] }>();
</script>

<template>
  <div class="assessment-task-page">
    <LessonAssessmentPlayer :lesson-id="lessonId" :assessment="assessment" @completed="emit('completed')" />
  </div>
</template>

<style scoped>
.assessment-task-page{width:min(100%,680px);margin:0 auto;padding:4px 0 28px}.assessment-task-page :deep(.assessment-player){margin-top:0}
</style>
