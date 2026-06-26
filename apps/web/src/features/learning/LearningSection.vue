<script setup lang="ts">
import { ExternalLink } from "lucide-vue-next";

const moduleCards = [
  {
    id: "module-1",
    title: "Модуль 1",
    description: "Первый модуль клуба. Внутри будут экраны и материалы первого блока.",
    createdAt: "26.06.2026",
    images: [
      { title: "Вариант 1. Плеер и очередь", url: "/previews/learning-redesign-1.svg" },
      { title: "Вариант 2. Модули и уроки", url: "/previews/learning-redesign-2.svg" },
      { title: "Вариант 3. Библиотека", url: "/previews/learning-redesign-3.svg" },
      { title: "Вариант 4. Маршрут обучения", url: "/previews/learning-redesign-4.svg" }
    ]
  },
  {
    id: "module-2",
    title: "Модуль 2",
    description: "Второй модуль клуба. Внутри будут материалы следующего блока.",
    createdAt: "26.06.2026",
    images: [
      { title: "Верх экрана", url: "/previews/admin-stats-preview-1.png" },
      { title: "Оплаты и контент", url: "/previews/admin-stats-preview-2.png" },
      { title: "Общение", url: "/previews/admin-stats-preview-3.png" }
    ]
  }
] as const;
</script>

<template>
  <section class="admin-panel modules-panel">
    <div class="admin-panel-head">
      <div>
        <h3>Модули</h3>
        <p>Разделы клуба и материалы внутри них.</p>
      </div>
    </div>

    <div class="admin-mockup-list">
      <article v-for="module in moduleCards" :key="module.id" class="admin-mockup-card">
        <div class="admin-mockup-card-head">
          <div>
            <strong>{{ module.title }}</strong>
            <small>Добавлено {{ module.createdAt }}</small>
          </div>
          <span>{{ module.images.length }} экрана</span>
        </div>
        <p>{{ module.description }}</p>
        <div class="admin-mockup-grid">
          <a v-for="image in module.images" :key="image.url" class="admin-mockup-thumb" :href="image.url" target="_blank" rel="noreferrer">
            <img :src="image.url" :alt="image.title" loading="lazy" />
            <span>
              {{ image.title }}
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </a>
        </div>
      </article>
    </div>
  </section>
</template>
