<script setup lang="ts">
import type { AdminIndividualPaymentOfferPayload, IndividualPaymentOffer, IndividualPaymentOfferOptionsResponse, PaymentCurrency } from "@club/shared";
import { computed, ref, watch } from "vue";
import { Copy, Gift, X } from "lucide-vue-next";
import {
  cancelAdminIndividualPaymentOffer,
  createAdminIndividualPaymentOffer,
  getAdminIndividualPaymentOfferOptions,
  getAdminIndividualPaymentOffers
} from "@/api/client";
import { lavaCatalogPeriodOptions, lavaCatalogPricesForTariff, lavaCatalogAccessDays } from "@/features/billing/paymentProductForm";

const props = defineProps<{ telegramId: string; clientName: string; disabled: boolean }>();
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const options = ref<IndividualPaymentOfferOptionsResponse | null>(null);
const offers = ref<IndividualPaymentOffer[]>([]);
const createdLink = ref("");
const provider = ref<"prodamus" | "lava">("prodamus");
const kind = ref<"one_time" | "recurrent">("one_time");
const title = ref("Индивидуальная подписка");
const amountRub = ref(990);
const accessDays = ref(30);
const externalProductId = ref("");
const catalogItemId = ref("");
const currency = ref<PaymentCurrency>("RUB");
const customAmount = ref<number | null>(null);
const feedback = ref<{ tone: "success" | "error"; text: string } | null>(null);

const selectedCatalogItem = computed(() => options.value?.lavaCatalog.find((item) => item.id === catalogItemId.value) ?? null);
const lavaPeriods = computed(() => selectedCatalogItem.value ? lavaCatalogPeriodOptions(selectedCatalogItem.value) : []);
const selectedCatalogPrices = computed(() => selectedCatalogItem.value ? lavaCatalogPricesForTariff(selectedCatalogItem.value, selectedCatalogItem.value.kind, accessDays.value) : []);
const selectedCatalogPrice = computed(() => selectedCatalogPrices.value.find((price) => price.currency === currency.value) ?? null);
const providerAvailable = computed(() => options.value?.providers.some((item) => item.provider === provider.value) ?? false);
const canSubmit = computed(() => providerAvailable.value && (provider.value === "prodamus"
  ? Boolean(title.value.trim() && amountRub.value > 0 && accessDays.value > 0 && (kind.value === "one_time" || externalProductId.value.trim()))
  : Boolean(catalogItemId.value && accessDays.value > 0 && selectedCatalogPrice.value && (selectedCatalogPrice.value.amountMinor !== null || (customAmount.value ?? 0) > 0))
));

function money(offer: Pick<IndividualPaymentOffer, "currency" | "amountMinor">) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: offer.currency, maximumFractionDigits: 2 }).format(offer.amountMinor / 100);
}

function statusLabel(status: IndividualPaymentOffer["status"]) {
  return ({ active: "Активна", checkout_pending: "Оплата открыта", paid: "Оплачена", expired: "Истекла", cancelled: "Отменена" })[status];
}

async function load() {
  loading.value = true;
  try {
    const [nextOptions, history] = await Promise.all([
      getAdminIndividualPaymentOfferOptions(props.telegramId),
      getAdminIndividualPaymentOffers(props.telegramId)
    ]);
    options.value = nextOptions;
    offers.value = history.offers;
    const available = nextOptions.providers.map((entry) => entry.provider);
    if (!available.includes(provider.value)) provider.value = available[0] ?? "prodamus";
    if (!catalogItemId.value) catalogItemId.value = nextOptions.lavaCatalog[0]?.id ?? "";
  } catch {
    feedback.value = { tone: "error", text: "Не удалось загрузить платёжные системы." };
  } finally {
    loading.value = false;
  }
}

async function show() {
  open.value = true;
  createdLink.value = "";
  feedback.value = null;
  await load();
}

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    let payload: AdminIndividualPaymentOfferPayload;
    if (provider.value === "prodamus") {
      payload = kind.value === "recurrent"
        ? { provider: "prodamus", kind: "recurrent", title: title.value.trim(), amountRub: amountRub.value, accessDays: accessDays.value, externalProductId: externalProductId.value.trim() }
        : { provider: "prodamus", kind: "one_time", title: title.value.trim(), amountRub: amountRub.value, accessDays: accessDays.value };
    } else {
      payload = {
        provider: "lava",
        catalogItemId: catalogItemId.value,
        currency: currency.value,
        accessDays: accessDays.value,
        ...(selectedCatalogPrice.value?.amountMinor === null && customAmount.value ? { customAmountMinor: Math.round(customAmount.value * 100) } : {})
      };
    }
    const result = await createAdminIndividualPaymentOffer(props.telegramId, payload);
    createdLink.value = result.link;
    offers.value = [result.offer, ...offers.value];
    feedback.value = { tone: "success", text: result.pushDelivered ? "Ссылка создана и отправлена клиенту." : "Ссылка создана. Push не доставлен, но уведомление есть в приложении." };
  } catch {
    feedback.value = { tone: "error", text: "Не удалось создать персональную ссылку." };
  } finally {
    saving.value = false;
  }
}

async function cancel(offer: IndividualPaymentOffer) {
  try {
    await cancelAdminIndividualPaymentOffer(props.telegramId, offer.id);
    offers.value = offers.value.map((item) => item.id === offer.id ? { ...item, status: "cancelled", cancelledAt: new Date().toISOString() } : item);
    feedback.value = { tone: "success", text: "Ссылка отменена." };
  } catch {
    feedback.value = { tone: "error", text: "Не удалось отменить ссылку." };
  }
}

async function copyLink() {
  await navigator.clipboard.writeText(createdLink.value);
  feedback.value = { tone: "success", text: "Ссылка скопирована." };
}

watch(selectedCatalogItem, (item) => {
  if (!item) return;
  accessDays.value = lavaCatalogPeriodOptions(item)[0]?.accessDays ?? lavaCatalogAccessDays(item.periodicity ?? null) ?? accessDays.value;
  currency.value = lavaCatalogPricesForTariff(item, item.kind, accessDays.value)[0]?.currency ?? "RUB";
});

watch(accessDays, () => {
  if (provider.value === "lava" && !selectedCatalogPrices.value.some((price) => price.currency === currency.value)) {
    currency.value = selectedCatalogPrices.value[0]?.currency ?? "RUB";
  }
});
</script>

<template>
  <div class="individual-offer-entry">
    <button class="individual-offer-button ui-button" type="button" :disabled="disabled" @click="show"><Gift aria-hidden="true" />Подписка</button>
    <Teleport to="body">
      <div v-if="open" class="individual-offer-backdrop" @click.self="open = false">
        <section class="individual-offer-modal ui-card" role="dialog" aria-modal="true" aria-labelledby="individual-offer-title">
          <header><div><small>Персональная оплата</small><h3 id="individual-offer-title">Подписка для {{ clientName }}</h3></div><button class="ui-icon-button" type="button" aria-label="Закрыть" @click="open = false"><X /></button></header>
          <p class="individual-offer-hint">Ссылка действует 24 часа, только для этого аккаунта и только для одной успешной оплаты.</p>
          <p v-if="feedback" class="individual-offer-feedback" :class="`individual-offer-feedback-${feedback.tone}`">{{ feedback.text }}</p>
          <p v-if="loading" class="admin-empty">Загружаем настройки…</p>
          <form v-else class="individual-offer-form" @submit.prevent="submit">
            <p v-if="!options?.providers.length" class="individual-offer-wide admin-warning-line">Сначала подключите и включите Prodamus или Lava.top в разделе оплаты.</p>
            <label><span>Платёжная система</span><select v-model="provider" class="text-input"><option v-for="item in options?.providers ?? []" :key="item.provider" :value="item.provider">{{ item.title }}</option></select></label>
            <template v-if="provider === 'prodamus'">
              <label><span>Тип оплаты</span><select v-model="kind" class="text-input"><option value="one_time">Разовая оплата</option><option value="recurrent">Автоподписка</option></select></label>
              <label class="individual-offer-wide"><span>Название</span><input v-model="title" class="text-input" maxlength="180" /></label>
              <label><span>Сумма, ₽</span><input v-model.number="amountRub" class="text-input" type="number" min="1" /></label>
              <label><span>Доступ, дней</span><input v-model.number="accessDays" class="text-input" type="number" min="1" max="3650" /></label>
              <label v-if="kind === 'recurrent'" class="individual-offer-wide"><span>ID подписки Prodamus</span><input v-model="externalProductId" class="text-input" maxlength="64" /></label>
            </template>
            <template v-else>
              <label class="individual-offer-wide"><span>Товар Lava</span><select v-model="catalogItemId" class="text-input"><option v-for="item in options?.lavaCatalog ?? []" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
              <label><span>Валюта</span><select v-model="currency" class="text-input"><option v-for="price in selectedCatalogPrices" :key="price.currency" :value="price.currency">{{ price.currency }}</option></select></label>
              <label v-if="lavaPeriods.length"><span>Период</span><select v-model.number="accessDays" class="text-input"><option v-for="period in lavaPeriods" :key="period.accessDays" :value="period.accessDays">{{ period.label }}</option></select></label>
              <label v-else><span>Доступ, дней</span><input v-model.number="accessDays" class="text-input" type="number" min="1" max="3650" /></label>
              <label v-if="selectedCatalogPrice?.amountMinor === null"><span>Сумма</span><input v-model.number="customAmount" class="text-input" type="number" min="1" /></label>
              <p v-else class="individual-offer-price">Цена Lava: <strong>{{ selectedCatalogPrice ? money({ currency, amountMinor: selectedCatalogPrice.amountMinor ?? 0 }) : '—' }}</strong></p>
            </template>
            <div v-if="createdLink" class="individual-offer-created"><span>Ссылка создана и записана в историю</span><button type="button" @click="copyLink"><Copy />Скопировать</button></div>
            <button class="primary-button ui-button individual-offer-submit" type="submit" :disabled="saving || !canSubmit">{{ saving ? 'Создаём…' : 'Создать и отправить' }}</button>
          </form>
          <details class="individual-offer-history"><summary>Созданные ссылки <span>{{ offers.length }}</span></summary><div><p v-if="!offers.length" class="admin-empty">Ссылок пока нет.</p><article v-for="offer in offers" :key="offer.id"><div><strong>{{ offer.title }}</strong><small>{{ money(offer) }} · {{ offer.accessDays }} дн. · {{ new Date(offer.createdAt).toLocaleString('ru-RU') }}</small></div><span :class="`offer-status-${offer.status}`">{{ statusLabel(offer.status) }}</span><button v-if="offer.status === 'active'" type="button" @click="cancel(offer)">Отменить</button></article></div></details>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.individual-offer-entry{min-width:0;width:100%}.individual-offer-button{width:100%;--individual-offer-color:#8b5cf6;display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:52px;padding:0 1rem;border:1px solid color-mix(in srgb,var(--individual-offer-color) 72%,var(--border));border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--individual-offer-color) 88%,#4c1d95),#a855f7);color:#fff;font-weight:800;box-shadow:0 8px 18px color-mix(in srgb,var(--individual-offer-color) 22%,transparent);transition:border-color 140ms ease,filter 140ms ease,transform 140ms ease}.individual-offer-button:hover:not(:disabled){border-color:color-mix(in srgb,var(--individual-offer-color) 90%,#fff);filter:brightness(1.07);transform:translateY(-1px)}.individual-offer-button:active:not(:disabled){transform:translateY(1px) scale(.99)}.individual-offer-button svg{width:18px}.individual-offer-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;background:rgba(10,12,22,.62);backdrop-filter:blur(8px)}.individual-offer-modal{width:min(680px,100%);max-height:min(90dvh,820px);overflow:auto;padding:20px;border-radius:24px}.individual-offer-modal header{display:flex;justify-content:space-between;gap:16px}.individual-offer-modal h3{margin:.2rem 0 0;font-size:1.3rem}.individual-offer-modal header small{color:var(--muted);font-weight:700}.individual-offer-hint{margin:12px 0 18px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,#8b5cf6 10%,transparent);color:var(--muted-strong);font-size:.86rem}.individual-offer-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.individual-offer-form label{display:grid;gap:6px}.individual-offer-form label span{font-size:.78rem;font-weight:800;color:var(--muted-strong)}.individual-offer-wide,.individual-offer-submit,.individual-offer-created,.individual-offer-price{grid-column:1/-1}.individual-offer-price{margin:0;padding:12px;border-radius:12px;background:var(--surface-soft)}.individual-offer-created{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:14px;background:color-mix(in srgb,#22c55e 12%,transparent)}.individual-offer-created button{display:flex;gap:6px;align-items:center;font-weight:800}.individual-offer-created svg{width:16px}.individual-offer-history{margin-top:18px;border-top:1px solid var(--border);padding-top:14px}.individual-offer-history summary{display:flex;justify-content:space-between;font-weight:800;cursor:pointer}.individual-offer-history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)}.individual-offer-history article div{display:grid;min-width:0}.individual-offer-history article small{color:var(--muted);font-size:.75rem}.individual-offer-history article>span{font-size:.72rem;font-weight:800}.offer-status-paid{color:#16a34a}.offer-status-cancelled,.offer-status-expired{color:var(--muted)}.individual-offer-history article button{color:var(--danger-text);font-weight:700}@media(max-width:560px){.individual-offer-backdrop{align-items:end;padding:0}.individual-offer-modal{border-radius:24px 24px 0 0;max-height:92dvh}.individual-offer-form{grid-template-columns:1fr}.individual-offer-wide,.individual-offer-submit,.individual-offer-created,.individual-offer-price{grid-column:auto}.individual-offer-history article{grid-template-columns:1fr auto}.individual-offer-history article button{grid-column:1/-1;justify-self:start}}
.individual-offer-feedback{margin:-8px 0 14px;padding:10px 12px;border-radius:12px;font-size:.84rem;font-weight:700}.individual-offer-feedback-success{color:#15803d;background:color-mix(in srgb,#22c55e 12%,transparent)}.individual-offer-feedback-error{color:var(--danger-text);background:color-mix(in srgb,#ef4444 10%,transparent)}
</style>
