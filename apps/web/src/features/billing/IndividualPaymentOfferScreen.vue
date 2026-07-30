<script setup lang="ts">
import type { IndividualPaymentOfferDetailResponse } from "@club/shared";
import { computed, onMounted, ref } from "vue";
import { CheckCircle2, Clock3, LockKeyhole } from "lucide-vue-next";
import { createIndividualPaymentOfferCheckout, getIndividualPaymentOffer } from "@/api/client";
import { openPaymentCheckoutUrl } from "./paymentRedirect";
import TaskScreen from "@/features/app/TaskScreen.vue";

const props = defineProps<{ token: string }>();
const emit = defineEmits<{ close: [] }>();
const loading = ref(true);
const paying = ref(false);
const error = ref("");
const data = ref<IndividualPaymentOfferDetailResponse | null>(null);
const offer = computed(() => data.value?.offer ?? null);
const amount = computed(() => offer.value ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: offer.value.currency, maximumFractionDigits: 2 }).format(offer.value.amountMinor / 100) : "");
const available = computed(() => offer.value?.status === "active" || offer.value?.status === "checkout_pending");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await getIndividualPaymentOffer(props.token);
  } catch {
    error.value = "Ссылка недоступна. Проверьте, что вы вошли в тот аккаунт, которому она была выдана.";
  } finally {
    loading.value = false;
  }
}

async function pay() {
  paying.value = true;
  error.value = "";
  try {
    const result = await createIndividualPaymentOfferCheckout(props.token);
    openPaymentCheckoutUrl(result.checkoutUrl);
  } catch {
    error.value = "Не удалось открыть оплату. Если платёжная страница уже открывалась, подождите немного и попробуйте снова.";
    await load();
  } finally {
    paying.value = false;
  }
}

onMounted(load);
</script>

<template>
  <TaskScreen title="Персональное предложение" subtitle="Подготовлено специально для вашего аккаунта" portal @back="emit('close')">
    <div class="offer-screen">
      <div v-if="loading" class="offer-state ui-card">Загружаем предложение…</div>
      <div v-else-if="error && !offer" class="offer-state offer-state-error ui-card"><LockKeyhole /><strong>Ссылка не открылась</strong><p>{{ error }}</p></div>
      <article v-else-if="offer" class="offer-card ui-card">
        <div class="offer-card-glow" aria-hidden="true"></div>
        <span class="offer-eyebrow">{{ offer.provider === 'lava' ? 'Lava.top' : 'Prodamus' }} · {{ offer.kind === 'recurrent' ? 'автоподписка' : 'разовая оплата' }}</span>
        <h2>{{ offer.title }}</h2>
        <strong class="offer-amount">{{ amount }}</strong>
        <div class="offer-benefit"><CheckCircle2 /><span>Доступ на {{ offer.accessDays }} дней после подтверждения оплаты</span></div>
        <div class="offer-benefit"><LockKeyhole /><span>Ссылка привязана к вашему аккаунту и оплачивается один раз</span></div>
        <div class="offer-benefit"><Clock3 /><span>Действует до {{ new Date(offer.expiresAt).toLocaleString('ru-RU') }}</span></div>
        <p v-if="offer.status === 'paid'" class="offer-terminal offer-success">Предложение оплачено. Доступ уже начислен.</p>
        <p v-else-if="offer.status === 'expired'" class="offer-terminal">Срок действия ссылки истёк.</p>
        <p v-else-if="offer.status === 'cancelled'" class="offer-terminal">Предложение отменено администратором.</p>
        <p v-if="error" class="offer-error">{{ error }}</p>
        <button v-if="available" class="primary-button ui-button offer-pay" type="button" :disabled="paying" @click="pay">{{ paying ? 'Открываем оплату…' : `Оплатить ${amount}` }}</button>
        <p v-if="available" class="offer-footnote">Доступ будет выдан только вашему текущему аккаунту.</p>
      </article>
    </div>
  </TaskScreen>
</template>

<style scoped>
.offer-screen{min-height:100%;display:grid;place-items:center;padding:18px}.offer-state,.offer-card{width:min(560px,100%);padding:24px;border-radius:26px}.offer-state{display:grid;justify-items:center;gap:10px;text-align:center}.offer-state svg{width:38px;height:38px;color:var(--muted)}.offer-state p{margin:0;color:var(--muted)}.offer-card{position:relative;overflow:hidden;isolation:isolate;background:linear-gradient(155deg,color-mix(in srgb,var(--surface) 96%,#8b5cf6),var(--surface))}.offer-card-glow{position:absolute;z-index:-1;right:-80px;top:-100px;width:260px;height:260px;border-radius:50%;background:rgba(139,92,246,.2);filter:blur(4px)}.offer-eyebrow{display:inline-flex;padding:6px 10px;border-radius:999px;background:color-mix(in srgb,#8b5cf6 13%,transparent);color:#8b5cf6;font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.offer-card h2{margin:18px 0 4px;font-size:clamp(1.45rem,6vw,2rem);line-height:1.08}.offer-amount{display:block;margin-bottom:24px;font-size:clamp(2rem,9vw,3rem);line-height:1}.offer-benefit{display:flex;align-items:flex-start;gap:10px;margin:12px 0;color:var(--muted-strong);font-size:.9rem}.offer-benefit svg{flex:0 0 19px;width:19px;color:#8b5cf6}.offer-pay{width:100%;min-height:52px;margin-top:18px;border-radius:16px;font-size:1rem}.offer-footnote{text-align:center;color:var(--muted);font-size:.76rem}.offer-terminal,.offer-error{margin-top:18px;padding:12px;border-radius:13px;background:var(--surface-soft);font-weight:700}.offer-success{color:#15803d}.offer-error{color:var(--danger-text)}
</style>
