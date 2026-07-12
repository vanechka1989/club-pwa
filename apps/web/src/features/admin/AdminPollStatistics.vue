<script setup lang="ts">
import type { AdminStatsResponse } from "@club/shared";
defineProps<{ stats: AdminStatsResponse["pollStats"] }>();
</script>
<template>
  <section class="admin-stat-block admin-poll-statistics ui-card">
    <header><div><h4>Опросы</h4><p>Участие и распределение ответов.</p></div><strong>{{ stats.totalPolls }}</strong></header>
    <div class="admin-stat-mini-grid ui-responsive-grid">
      <article><span>Активные</span><strong>{{ stats.activePolls }}</strong></article>
      <article><span>Завершённые</span><strong>{{ stats.closedPolls }}</strong></article>
      <article><span>Участники</span><strong>{{ stats.uniqueParticipants }}</strong></article>
      <article><span>Участие</span><strong>{{ stats.participationPercent }}%</strong></article>
    </div>
    <div class="admin-poll-list">
      <article v-for="poll in stats.polls" :key="poll.id">
        <div><strong>{{ poll.question }}</strong><small>{{ poll.topicTitle }} · {{ poll.totalVoters }} участников · {{ poll.isAnonymous ? "Анонимно" : "Открыто" }}</small></div>
        <div v-for="option in poll.options" :key="option.id" class="admin-poll-option">
          <span>{{ option.text }}</span><strong>{{ option.votesCount }} · {{ option.percent }}%</strong><i><b :style="{ width: `${option.percent}%` }"></b></i>
        </div>
      </article>
      <p v-if="!stats.polls.length" class="admin-empty">Опросов пока нет.</p>
    </div>
  </section>
</template>
