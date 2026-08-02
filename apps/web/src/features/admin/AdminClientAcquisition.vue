<script setup lang="ts">
import type { AdminUserAcquisition } from "@club/shared";
import { computed, onMounted, ref, watch } from "vue";
import { getAdminUserAcquisition } from "@/api/client";

const props = defineProps<{ telegramId: string }>();
const data = ref<AdminUserAcquisition | null>(null);
const loading = ref(false);
const source = computed(() => data.value?.lastTouch ?? null);

async function load() {
  loading.value = true;
  try { data.value = await getAdminUserAcquisition(props.telegramId); }
  catch { data.value = null; }
  finally { loading.value = false; }
}

watch(() => props.telegramId, load);
onMounted(load);
</script>

<template>
  <section class="client-acquisition" aria-label="UTM-метки клиента">
    <div v-if="loading" class="client-acquisition-empty">Загружаю источник…</div>
    <div v-else-if="source" class="client-acquisition-body">
      <dl class="client-acquisition-utm" aria-label="UTM-метки клиента">
        <div v-if="source.source"><dt>utm_source</dt><dd>{{ source.source }}</dd></div>
        <div v-if="source.medium"><dt>utm_medium</dt><dd>{{ source.medium }}</dd></div>
        <div v-if="source.campaign"><dt>utm_campaign</dt><dd>{{ source.campaign }}</dd></div>
        <div v-if="source.content"><dt>utm_content</dt><dd>{{ source.content }}</dd></div>
      </dl>
    </div>
    <p v-else class="client-acquisition-empty">Источник клиента не был зафиксирован.</p>
  </section>
</template>

<style scoped>
.client-acquisition{display:grid;min-width:0}.client-acquisition-body{display:grid}.client-acquisition-utm{display:grid;margin:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--panel-soft)}.client-acquisition-utm>div{display:grid;grid-template-columns:minmax(92px,.7fr) minmax(0,1.3fr);gap:10px;align-items:start;min-height:44px;padding:11px 12px}.client-acquisition-utm>div+div{border-top:1px solid var(--border)}.client-acquisition-utm dt{font-size:10px;color:var(--muted)}.client-acquisition-utm dd{min-width:0;margin:0;font-size:11px;font-weight:800;text-align:right;overflow-wrap:anywhere}.client-acquisition-empty{margin:0;padding:14px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);font-size:11px}
@media(max-width:359px){.client-acquisition-utm>div{grid-template-columns:1fr;gap:3px}.client-acquisition-utm dd{text-align:left}}
</style>
