<script setup lang="ts">
import type { PaymentProviderCatalogItem } from "@club/shared";
import { computed } from "vue";

const props = defineProps<{
  items: PaymentProviderCatalogItem[];
  busyId: string | null;
}>();
const emit = defineEmits<{
  change: [payload: { id: string; isSelectable: boolean }];
}>();

const currentItems = computed(() => props.items.filter((item) => !item.isStale));

function formatAmount(amountRub: number | null) {
  return amountRub === null ? "Цена в Lava" : `${amountRub.toLocaleString("ru-RU")} ₽`;
}
</script>

<template>
  <section class="lava-catalog" aria-labelledby="lava-catalog-title">
    <div class="lava-catalog__head">
      <div>
        <h3 id="lava-catalog-title">Товары Lava</h3>
        <p>Выберите товары, которые можно добавлять в тарифы клуба.</p>
      </div>
      <span>{{ currentItems.length }}</span>
    </div>

    <p v-if="!currentItems.length" class="lava-catalog__empty">
      Нажмите «Обновить товары», чтобы загрузить каталог Lava.
    </p>
    <div v-else class="lava-catalog__list">
      <label v-for="item in currentItems" :key="item.id" class="lava-catalog__item">
        <span class="lava-catalog__copy">
          <strong>{{ item.title }}</strong>
          <small>
            {{ item.kind === "recurrent" ? "Рекуррентная подписка" : "Обычная оплата" }}
            · {{ formatAmount(item.amountRub) }}
          </small>
        </span>
        <span class="lava-catalog__control">
          <input
            type="checkbox"
            :checked="item.isSelectable"
            :disabled="busyId === item.id"
            :aria-label="`Показывать «${item.title}» при создании тарифа`"
            @change="emit('change', {
              id: item.id,
              isSelectable: ($event.target as HTMLInputElement).checked
            })"
          />
          <span aria-hidden="true"></span>
        </span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.lava-catalog{display:grid;gap:12px;min-width:0}.lava-catalog__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.lava-catalog__head>div{display:grid;gap:4px;min-width:0}.lava-catalog__head h3,.lava-catalog__head p{margin:0}.lava-catalog__head h3{font-size:1rem}.lava-catalog__head p{color:var(--muted);font-size:.82rem;line-height:1.4}.lava-catalog__head>span{min-width:32px;padding:5px 8px;border-radius:999px;background:var(--field);color:var(--accent);font-size:.78rem;font-weight:800;text-align:center}.lava-catalog__empty{margin:0;padding:14px;border-radius:14px;background:var(--field);color:var(--muted);font-size:.85rem;line-height:1.45}.lava-catalog__list{display:grid;gap:8px}.lava-catalog__item{display:flex!important;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--field)}.lava-catalog__copy{display:grid;gap:4px;min-width:0}.lava-catalog__copy strong,.lava-catalog__copy small{overflow-wrap:anywhere}.lava-catalog__copy strong{color:var(--text);font-size:.9rem}.lava-catalog__copy small{color:var(--muted);font-size:.75rem;line-height:1.35}.lava-catalog__control{position:relative;width:46px;height:28px;flex:none}.lava-catalog__control input{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.lava-catalog__control>span{position:absolute;inset:0;border:1px solid var(--line);border-radius:999px;background:var(--surface);transition:background .16s,border-color .16s}.lava-catalog__control>span::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--muted);transition:transform .16s,background .16s}.lava-catalog__control input:checked+span{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 24%,var(--surface))}.lava-catalog__control input:checked+span::after{transform:translateX(18px);background:var(--accent)}.lava-catalog__control input:focus-visible+span{outline:2px solid var(--accent);outline-offset:3px}.lava-catalog__control input:disabled+span{opacity:.5}
</style>
