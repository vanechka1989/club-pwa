<script setup lang="ts">
import type { AdminUserDetailResponse } from "@club/shared";
import TaskScreen from "@/features/app/TaskScreen.vue";
import AdminClientLearningSection from "./AdminClientLearningSection.vue";

type Engagement = AdminUserDetailResponse["learningEngagement"][number];
type Assessment = AdminUserDetailResponse["learningAssessments"][number];

defineProps<{
  clientName: string;
  engagement: readonly Engagement[];
  assessments: readonly Assessment[];
  canManage: boolean;
  formatDuration: (seconds: number) => string;
  formatDate: (value: string) => string;
}>();

const emit = defineEmits<{
  back: [];
  "open-result": [value: { mode: "quiz" | "homework"; recordId: string }];
}>();
</script>

<template>
  <TaskScreen class="admin-task-screen admin-client-learning-task" title="Обучение" :subtitle="clientName" portal @back="emit('back')">
    <AdminClientLearningSection
      :engagement="engagement"
      :assessments="assessments"
      :can-manage="canManage"
      :format-duration="formatDuration"
      :format-date="formatDate"
      @open-result="emit('open-result', $event)"
    />
  </TaskScreen>
</template>

<style scoped>
.admin-client-learning-task :deep(.task-screen-body) {
  padding-bottom: 24px;
}
</style>
