<script setup lang="ts">
import type { AdminStatsResponse } from "@club/shared";
import { ChevronDown } from "lucide-vue-next";

defineProps<{ stats: AdminStatsResponse["pollStats"] }>();

function formatPollDate(value: string | null) {
  if (!value) return "Не задано";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function pollAuthorLabel(author: AdminStatsResponse["pollStats"]["polls"][number]["author"]) {
  return author.firstName || (author.username ? `@${author.username}` : `ID ${author.telegramId}`);
}
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
      <details v-for="poll in stats.polls" :key="poll.id" class="admin-poll-disclosure">
        <summary>
          <span><strong>{{ poll.question }}</strong><small>{{ poll.closed ? "Завершён" : "Активен" }} · {{ poll.totalVoters }} участников</small></span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div class="admin-poll-meta">
          <span><small>Автор</small><strong>{{ pollAuthorLabel(poll.author) }}</strong></span>
          <span><small>Начало</small><strong>{{ formatPollDate(poll.startedAt) }}</strong></span>
          <span><small>Завершение</small><strong>{{ formatPollDate(poll.endedAt) }}</strong></span>
          <span><small>Формат</small><strong>{{ poll.isAnonymous ? "Анонимный" : "Открытый" }}</strong></span>
        </div>
        <div class="admin-poll-options">
          <div v-for="option in poll.options" :key="option.id" class="admin-poll-option">
            <span>{{ option.text }}</span><strong>{{ option.votesCount }} · {{ option.percent }}%</strong><i><b :style="{ width: `${option.percent}%` }"></b></i>
          </div>
        </div>
      </details>
      <p v-if="!stats.polls.length" class="admin-empty">Опросов пока нет.</p>
    </div>
  </section>
</template>
