<script setup lang="ts">
import type { PaymentProduct, PaymentProvider, UserRecurrentSubscription } from "@club/shared";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-vue-next";
import {
  cancelRecurrentSubscription,
  createPaymentCheckout,
  createPaymentProduct,
  deletePaymentProduct,
  getPaymentPlans,
  getPaymentProvider,
  restoreRecurrentSubscription,
  saveProdamusProvider,
  updatePaymentProduct,
  updatePaymentProductStatus
} from "@/api/client";
import { paymentRedirectNotice } from "@/features/billing/paymentMessages";
import { startPaymentWatch } from "@/features/billing/paymentWatch";
import { findActiveRecurrentSubscription, findRestorableRecurrentSubscription } from "@/features/billing/recurrentSubscription";
import { useNotificationsStore } from "@/stores/notifications";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const notifications = useNotificationsStore();

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const provider = ref<PaymentProvider | null>(null);
const webhookUrl = ref("");
const products = ref<PaymentProduct[]>([]);
const recurrentSubscriptions = ref<UserRecurrentSubscription[]>([]);
const showProviderPicker = ref(false);
const showProviderForm = ref(false);
const showProductModal = ref(false);
const editingProduct = ref<PaymentProduct | null>(null);
const providerFormModal = ref<HTMLElement | null>(null);
const productFormModal = ref<HTMLElement | null>(null);
const providerFormBody = ref<HTMLElement | null>(null);
const productFormBody = ref<HTMLElement | null>(null);
const providerFormModalKey = ref(0);
const productFormModalKey = ref(0);
const checkoutProductId = ref<string | null>(null);

const providerForm = ref({
  formUrl: "",
  secretKey: "",
  isEnabled: true
});

const productForm = ref({
  kind: "one_time" as "one_time" | "recurrent",
  title: "",
  amountRub: 990,
  accessDays: 30,
  prodamusSubscriptionId: "",
  isPublished: true
});

type TelegramWebAppWithConfirm = {
  showConfirm?: (message: string, callback: (isConfirmed: boolean) => void) => void;
};

const isAdmin = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const isOwner = computed(() => session.user?.role === "owner");
const activeProducts = computed(() => products.value.filter((product) => product.isPublished && !product.archivedUntil));
const hiddenProducts = computed(() => products.value.filter((product) => !product.isPublished && !product.archivedUntil));
const archivedProducts = computed(() => products.value.filter((product) => product.archivedUntil));
const activeRecurrentSubscription = computed(() => findActiveRecurrentSubscription(recurrentSubscriptions.value));
const restorableRecurrentSubscription = computed(() =>
  findRestorableRecurrentSubscription(recurrentSubscriptions.value, {
    paymentType: session.user?.paymentType ?? null,
    recurrentPaymentStatus: session.user?.recurrentPaymentStatus ?? null,
    membershipExpiresAt: session.user?.membershipExpiresAt ?? null
  })
);
const primaryRecurrentSubscription = computed(() => activeRecurrentSubscription.value ?? restorableRecurrentSubscription.value);
const recurrentSubscriptionHistory = computed(() =>
  primaryRecurrentSubscription.value
    ? recurrentSubscriptions.value.filter((subscription) => subscription.id !== primaryRecurrentSubscription.value?.id)
    : recurrentSubscriptions.value
);

function showPaymentError(text: string) {
  error.value = text;
  notice.value = null;
  notifications.showError(text);
}

function showAlert(message: string, tone: "success" | "info" = "success") {
  notice.value = message;
  error.value = null;
  if (tone === "success") {
    notifications.showSuccess(message);
  } else {
    notifications.showInfo(message);
  }
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
  }
}

function confirmPaymentRedirect() {
  return new Promise<boolean>((resolve) => {
    const webApp = window.Telegram?.WebApp as TelegramWebAppWithConfirm | undefined;
    if (webApp?.showConfirm) {
      webApp.showConfirm(paymentRedirectNotice, resolve);
      return;
    }

    resolve(window.confirm(paymentRedirectNotice));
  });
}

async function loadPayments() {
  loading.value = true;
  error.value = null;
  try {
    const response = await getPaymentPlans();
    provider.value = response.provider;
    products.value = response.products;
    recurrentSubscriptions.value = response.recurrentSubscriptions;
    webhookUrl.value = response.provider?.webhookUrl ?? webhookUrl.value;
  } catch {
    showPaymentError("Не удалось загрузить оплату.");
  } finally {
    loading.value = false;
  }
}

async function loadProviderForAdmin() {
  if (!isAdmin.value) {
    return;
  }

  try {
    const response = await getPaymentProvider();
    provider.value = response.provider;
    webhookUrl.value = response.webhookUrl;
  } catch {
    showPaymentError("Не удалось загрузить настройки платежной системы.");
  }
}

function openProviderPicker() {
  if (!isOwner.value) {
    return;
  }
  showProviderPicker.value = true;
}

function closeProviderPicker() {
  showProviderPicker.value = false;
}

function resetModalScroll(element: HTMLElement | null) {
  if (!element) {
    return;
  }
  element.scrollTop = 0;
  element.scrollLeft = 0;
  element.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

async function resetModalScrollAfterRender(target: typeof providerFormModal | typeof productFormModal | typeof providerFormBody | typeof productFormBody) {
  await nextTick();
  resetModalScroll(target.value);
  requestAnimationFrame(() => resetModalScroll(target.value));
  requestAnimationFrame(() => requestAnimationFrame(() => resetModalScroll(target.value)));
  window.setTimeout(() => resetModalScroll(target.value), 80);
}

async function openProviderForm() {
  if (!isOwner.value) {
    return;
  }
  providerForm.value = {
    formUrl: provider.value?.formUrl ?? "",
    secretKey: "",
    isEnabled: provider.value?.isEnabled ?? true
  };
  showProviderPicker.value = false;
  showProviderForm.value = false;
  providerFormModalKey.value += 1;
  await nextTick();
  showProviderForm.value = true;
  await resetModalScrollAfterRender(providerFormModal);
  await resetModalScrollAfterRender(providerFormBody);
}

function closeProviderForm() {
  showProviderForm.value = false;
}

function resetProductForm() {
  editingProduct.value = null;
  productForm.value = {
    kind: "one_time",
    title: "",
    amountRub: 990,
    accessDays: 30,
    prodamusSubscriptionId: "",
    isPublished: true
  };
}

async function openProductModal(product?: PaymentProduct) {
  if (product) {
    editingProduct.value = product;
    productForm.value = {
      kind: product.kind,
      title: product.title,
      amountRub: product.amountRub,
      accessDays: product.accessDays,
      prodamusSubscriptionId: product.prodamusSubscriptionId ?? "",
      isPublished: product.isPublished
    };
  } else {
    resetProductForm();
  }
  showProductModal.value = false;
  productFormModalKey.value += 1;
  await nextTick();
  showProductModal.value = true;
  await resetModalScrollAfterRender(productFormModal);
  await resetModalScrollAfterRender(productFormBody);
}

function closeProductModal() {
  showProductModal.value = false;
  resetProductForm();
}

async function copyWebhookUrl() {
  if (!webhookUrl.value) {
    return;
  }
  await navigator.clipboard?.writeText(webhookUrl.value);
  showAlert("URL уведомлений скопирован.");
}

async function handleSaveProvider() {
  saving.value = true;
  error.value = null;
  try {
    const payload: { formUrl: string; secretKey?: string; sys?: string; isEnabled?: boolean } = {
      formUrl: providerForm.value.formUrl,
      sys: "",
      isEnabled: providerForm.value.isEnabled
    };
    const secretKey = providerForm.value.secretKey.trim();
    if (secretKey) {
      payload.secretKey = secretKey;
    }
    const response = await saveProdamusProvider(payload);
    provider.value = response.provider;
    webhookUrl.value = response.provider.webhookUrl;
    closeProviderForm();
    showAlert("Prodamus подключен.");
  } catch {
    showPaymentError("Не удалось сохранить Prodamus.");
  } finally {
    saving.value = false;
  }
}

async function handleSaveProduct() {
  saving.value = true;
  error.value = null;
  try {
    const payload = {
      ...productForm.value,
      description: null,
      prodamusSubscriptionId: productForm.value.kind === "recurrent" ? productForm.value.prodamusSubscriptionId.trim() : null
    };
    const response = editingProduct.value
      ? await updatePaymentProduct(editingProduct.value.id, payload)
      : await createPaymentProduct(payload);
    const index = products.value.findIndex((product) => product.id === response.product.id);
    if (index >= 0) {
      products.value[index] = response.product;
    } else {
      products.value = [response.product, ...products.value];
    }
    closeProductModal();
    showAlert(editingProduct.value ? "Тариф обновлен." : "Тариф добавлен.");
  } catch {
    showPaymentError("Не удалось сохранить тариф.");
  } finally {
    saving.value = false;
  }
}

async function handleToggleProduct(product: PaymentProduct) {
  const action = product.isPublished ? "скрыть" : "открыть";
  if (!window.confirm(`Точно ${action} тариф "${product.title}"?`)) {
    return;
  }

  saving.value = true;
  try {
    const response = await updatePaymentProductStatus(product.id, !product.isPublished);
    const index = products.value.findIndex((entry) => entry.id === product.id);
    if (index >= 0) {
      products.value[index] = response.product;
    }
    showAlert(product.isPublished ? "Тариф скрыт." : "Тариф открыт.");
  } catch {
    showPaymentError("Не удалось изменить тариф.");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteProduct(product: PaymentProduct) {
  if (!window.confirm(`Удалить тариф "${product.title}"? Он попадет в архив на 7 дней.`)) {
    return;
  }

  saving.value = true;
  try {
    await deletePaymentProduct(product.id);
    const archivedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    products.value = products.value.map((entry) =>
      entry.id === product.id ? { ...entry, isPublished: false, archivedUntil } : entry
    );
    showAlert("Тариф удален и помещен в архив.");
  } catch {
    showPaymentError("Не удалось удалить тариф.");
  } finally {
    saving.value = false;
  }
}

async function handleCheckout(product: PaymentProduct) {
  if (activeRecurrentSubscription.value) {
    showAlert("У вас уже есть активная автоподписка. Отмените её перед новой оплатой.", "info");
    return;
  }
  if (restorableRecurrentSubscription.value) {
    showAlert("Восстановите отменённую автоподписку или дождитесь окончания доступа перед новой оплатой.", "info");
    return;
  }

  if (!(await confirmPaymentRedirect())) {
    return;
  }

  checkoutProductId.value = product.id;
  saving.value = true;
  error.value = null;
  let navigating = false;
  try {
    const response = await createPaymentCheckout(product.id);
    if (response.checkoutUrl) {
      startPaymentWatch();
      navigating = true;
      window.location.href = response.checkoutUrl;
      return;
    }
    showAlert(response.message, "info");
  } catch {
    showPaymentError("Не удалось открыть оплату.");
  } finally {
    if (!navigating) {
      saving.value = false;
      checkoutProductId.value = null;
    }
  }
}

async function handleCancelSubscription(subscription: UserRecurrentSubscription) {
  if (!window.confirm(`Отменить подписку "${subscription.title}"?`)) {
    return;
  }

  saving.value = true;
  try {
    await cancelRecurrentSubscription(subscription.id);
    recurrentSubscriptions.value = recurrentSubscriptions.value.map((entry) =>
      entry.id === subscription.id ? { ...entry, status: "cancelled", cancelledAt: new Date().toISOString() } : entry
    );
    await session.load({ silent: true });
    showAlert("Подписка отменена.");
  } catch {
    showPaymentError("Не удалось отменить подписку.");
  } finally {
    saving.value = false;
  }
}

async function handleRestoreSubscription(subscription: UserRecurrentSubscription) {
  if (!window.confirm(`Восстановить подписку "${subscription.title}"?`)) {
    return;
  }

  saving.value = true;
  try {
    await restoreRecurrentSubscription(subscription.id);
    recurrentSubscriptions.value = recurrentSubscriptions.value.map((entry) =>
      entry.id === subscription.id ? { ...entry, status: "active", cancelledAt: null } : entry
    );
    await session.load({ silent: true });
    showAlert("Подписка восстановлена.");
  } catch {
    showPaymentError("Не удалось восстановить подписку.");
  } finally {
    saving.value = false;
  }
}

function formatMoney(amountRub: number) {
  return `${amountRub.toLocaleString("ru-RU")} ₽`;
}

function productPeriod(product: PaymentProduct) {
  return product.kind === "recurrent" ? `Автосписание каждые ${product.accessDays} дн.` : `Доступ на ${product.accessDays} дн.`;
}

onMounted(async () => {
  await Promise.all([loadPayments(), loadProviderForAdmin()]);
});

watch(showProviderForm, async (isOpen) => {
  if (!isOpen) {
    return;
  }
  await nextTick();
  await resetModalScrollAfterRender(providerFormModal);
  await resetModalScrollAfterRender(providerFormBody);
});

watch(showProductModal, async (isOpen) => {
  if (!isOpen) {
    return;
  }
  await nextTick();
  await resetModalScrollAfterRender(productFormModal);
  await resetModalScrollAfterRender(productFormBody);
});
</script>

<template>
  <section class="space-y-5">
    <div class="section-head">
      <div>
        <h2 class="section-title">Оплата</h2>
        <p class="section-subtitle">Тарифы, подписки и платежные системы.</p>
      </div>
      <button v-if="isOwner" class="icon-button" type="button" aria-label="Добавить платежную систему" @click="openProviderPicker">
        <Plus :size="20" />
      </button>
    </div>

    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-else-if="notice" class="text-sm text-[var(--muted-strong)]">{{ notice }}</p>

    <div v-if="isAdmin" class="surface-card space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold text-[var(--text)]">Платежная система</p>
          <div
            class="mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
            :class="
              provider?.isEnabled
                ? 'border-emerald-400/70 bg-emerald-500/10 text-emerald-300'
                : 'border-red-400/70 bg-red-500/10 text-red-300'
            "
          >
            {{ provider?.isEnabled ? "Prodamus подключен" : "Prodamus не подключен" }}
          </div>
        </div>
        <button v-if="isOwner" class="secondary-button w-auto px-4" type="button" @click="openProviderForm">
          {{ provider ? "Настроить" : "Подключить" }}
        </button>
      </div>
    </div>

    <div class="surface-card">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="font-semibold text-[var(--text)]">Тарифы</p>
          <p class="mt-1 text-sm text-[var(--muted)]">Обычные платежи и рекуррентные подписки.</p>
        </div>
        <button v-if="isOwner" class="icon-button" type="button" aria-label="Добавить тариф" :disabled="!provider" @click="openProductModal()">
          <Plus :size="20" />
        </button>
      </div>

      <div v-if="activeRecurrentSubscription && !isOwner" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ activeRecurrentSubscription.title }}</p>
        <p class="mt-1 text-sm text-[var(--muted)]">Автоподписка активна. Новые оплаты доступны после отмены подписки.</p>
        <button
          class="secondary-button mt-3"
          type="button"
          :disabled="saving"
          @click="handleCancelSubscription(activeRecurrentSubscription)"
        >
          Отменить подписку
        </button>
      </div>
      <div v-else-if="restorableRecurrentSubscription && !isOwner" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ restorableRecurrentSubscription.title }}</p>
        <p class="mt-1 text-sm text-[var(--muted)]">
          Автоподписка отменена, но доступ ещё действует. Можно восстановить подписку без новой оплаты.
        </p>
        <button
          class="secondary-button mt-3"
          type="button"
          :disabled="saving"
          @click="handleRestoreSubscription(restorableRecurrentSubscription)"
        >
          Восстановить подписку
        </button>
      </div>
      <p v-else-if="loading" class="text-sm text-[var(--muted)]">Загрузка оплаты...</p>
      <p v-else-if="!activeProducts.length" class="rounded-[18px] bg-[var(--field)] p-4 text-sm text-[var(--muted)]">
        Тарифы появятся после добавления админом.
      </p>

      <div v-else class="space-y-3">
        <article v-for="product in activeProducts" :key="product.id" class="soft-payment-card">
          <div class="payment-product-main">
            <p class="payment-product-title">{{ product.title }}</p>
            <p class="payment-product-meta">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
          </div>
          <div class="payment-product-actions">
            <button
              v-if="!primaryRecurrentSubscription"
              class="primary-button payment-product-pay"
              :class="{ 'payment-product-pay-loading': checkoutProductId === product.id }"
              type="button"
              :disabled="saving || !provider?.isEnabled"
              :aria-busy="checkoutProductId === product.id"
              @click="handleCheckout(product)"
            >
              <span>{{ checkoutProductId === product.id ? "Открываю..." : product.kind === "recurrent" ? "Оформить подписку" : "Оплатить" }}</span>
            </button>
            <div v-if="isOwner" class="payment-product-admin-actions">
              <button class="icon-button" type="button" aria-label="Редактировать тариф" @click="openProductModal(product)">
                <Pencil :size="16" />
              </button>
              <button class="icon-button" type="button" aria-label="Скрыть тариф" @click="handleToggleProduct(product)">
                <EyeOff :size="16" />
              </button>
              <button class="icon-button" type="button" aria-label="Удалить тариф" @click="handleDeleteProduct(product)">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div v-if="activeRecurrentSubscription && isOwner" class="surface-card space-y-3">
      <p class="font-semibold text-[var(--text)]">Активная автоподписка</p>
      <article class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ activeRecurrentSubscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">Новые оплаты заблокированы до отмены.</p>
          </div>
          <button
            class="secondary-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleCancelSubscription(activeRecurrentSubscription)"
          >
            Отменить
          </button>
        </div>
      </article>
    </div>

    <div v-if="restorableRecurrentSubscription && isOwner" class="surface-card space-y-3">
      <p class="font-semibold text-[var(--text)]">Отмененная автоподписка</p>
      <article class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ restorableRecurrentSubscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">Можно восстановить, пока доступ ещё активен.</p>
          </div>
          <button
            class="secondary-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleRestoreSubscription(restorableRecurrentSubscription)"
          >
            Восстановить
          </button>
        </div>
      </article>
    </div>

    <div v-if="recurrentSubscriptionHistory.length" class="surface-card space-y-3">
      <p class="font-semibold text-[var(--text)]">Ваши подписки</p>
      <article v-for="subscription in recurrentSubscriptionHistory" :key="subscription.id" class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ subscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">
              {{ subscription.status === "active" ? "Активна" : "Отменена" }}
            </p>
          </div>
          <button
            v-if="subscription.status === 'active'"
            class="secondary-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleCancelSubscription(subscription)"
          >
            Отменить
          </button>
        </div>
      </article>
    </div>

    <div v-if="isOwner && hiddenProducts.length" class="surface-card space-y-3">
      <p class="font-semibold text-[var(--text)]">Скрытые тарифы</p>
      <article v-for="product in hiddenProducts" :key="product.id" class="flex items-center justify-between gap-3 rounded-[18px] bg-[var(--field)] p-4">
        <div>
          <p class="font-semibold text-[var(--text)]">{{ product.title }}</p>
          <p class="text-sm text-[var(--muted)]">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
        </div>
        <div class="flex gap-2">
          <button class="icon-button" type="button" aria-label="Открыть тариф" @click="handleToggleProduct(product)">
            <Eye :size="18" />
          </button>
          <button class="icon-button" type="button" aria-label="Удалить тариф" @click="handleDeleteProduct(product)">
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </div>

    <div v-if="isOwner && archivedProducts.length" class="surface-card space-y-3 opacity-75">
      <p class="font-semibold text-[var(--text)]">Удаленные тарифы</p>
      <article v-for="product in archivedProducts" :key="product.id" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ product.title }}</p>
        <p class="text-sm text-[var(--muted)]">В архиве до {{ product.archivedUntil ? new Date(product.archivedUntil).toLocaleDateString("ru-RU") : "удаления" }}</p>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="showProviderPicker" class="admin-modal-backdrop payment-modal-backdrop" @click.self="closeProviderPicker">
        <aside class="admin-detail admin-client-modal payment-form-modal" role="dialog" aria-modal="true" aria-labelledby="provider-picker-title">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="provider-picker-title">Добавить платежную систему</h3>
              <p>Сейчас доступен Prodamus.</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProviderPicker">
              <X :size="18" />
            </button>
          </header>
          <div class="payment-form-body space-y-3">
            <button class="surface-card w-full text-left" type="button" @click="openProviderForm">
              <p class="font-semibold text-[var(--text)]">Prodamus</p>
              <p class="mt-1 text-sm text-[var(--muted)]">{{ provider ? "Подключена. Можно изменить настройки." : "Нажмите, чтобы подключить." }}</p>
            </button>
          </div>
        </aside>
      </div>

      <div v-if="showProviderForm" class="admin-modal-backdrop payment-modal-backdrop" @click.self="closeProviderForm">
        <aside
          :key="providerFormModalKey"
          ref="providerFormModal"
          class="admin-detail admin-client-modal payment-form-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="provider-form-title"
        >
          <header class="admin-client-modal-head">
            <div>
              <h3 id="provider-form-title">Prodamus</h3>
              <p>Данные платежной формы и URL уведомлений.</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProviderForm">
              <X :size="18" />
            </button>
          </header>

          <form ref="providerFormBody" class="payment-form-body space-y-3" @submit.prevent="handleSaveProvider">
            <label class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">URL платежной формы</span>
              <input v-model.trim="providerForm.formUrl" class="text-input mt-2" placeholder="https://xxx.payform.ru/" required />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">Секретный ключ</span>
              <div v-if="provider?.secretConfigured" class="mt-2 rounded-[18px] border border-[var(--line)] bg-[var(--field)] px-4 py-3">
                <span class="select-none text-sm font-semibold tracking-[0.24em] text-[var(--muted)] blur-[2px]">••••••••••••••••</span>
                <p class="mt-1 text-xs text-[var(--muted)]">Ключ сохранен. Заполните поле ниже только если нужно заменить его.</p>
              </div>
              <input
                v-model.trim="providerForm.secretKey"
                class="text-input mt-2"
                type="password"
                :placeholder="provider ? 'Новый секретный ключ, если меняете' : 'Секретный ключ Prodamus'"
                :required="!provider"
              />
            </label>
            <label class="flex items-center gap-3 rounded-[18px] bg-[var(--field)] p-4 text-sm font-semibold text-[var(--text)]">
              <input v-model="providerForm.isEnabled" type="checkbox" />
              Платежная система включена
            </label>
            <div class="rounded-[18px] border border-[var(--line)] bg-[var(--field)] p-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">URL уведомлений</p>
              <div class="mt-2 flex items-center gap-2">
                <input class="text-input" :value="webhookUrl" readonly />
                <button class="icon-button shrink-0" type="button" aria-label="Скопировать URL уведомлений" @click="copyWebhookUrl">
                  <Copy :size="18" />
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <button class="secondary-button" type="button" @click="closeProviderForm">Закрыть</button>
              <button class="primary-button" type="submit" :disabled="saving">
                {{ provider ? "Сохранить" : "Подключить" }}
              </button>
            </div>
          </form>
        </aside>
      </div>

      <div v-if="showProductModal" class="admin-modal-backdrop payment-modal-backdrop" @click.self="closeProductModal">
        <aside
          :key="productFormModalKey"
          ref="productFormModal"
          class="admin-detail admin-client-modal payment-form-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <header class="admin-client-modal-head">
            <div>
              <h3 id="product-modal-title">{{ editingProduct ? "Редактировать тариф" : "Новый тариф" }}</h3>
              <p>Обычный платеж или рекуррентная подписка.</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProductModal">
              <X :size="18" />
            </button>
          </header>

          <form ref="productFormBody" class="payment-form-body space-y-3" @submit.prevent="handleSaveProduct">
            <label class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">Тип</span>
              <select v-model="productForm.kind" class="text-input mt-2">
                <option value="one_time">Обычный платеж</option>
                <option value="recurrent">Рекуррентная подписка</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">Название</span>
              <input v-model.trim="productForm.title" class="text-input mt-2" required />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="text-sm font-semibold text-[var(--muted)]">Цена, ₽</span>
                <input v-model.number="productForm.amountRub" class="text-input mt-2" type="number" min="1" required />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-[var(--muted)]">Дней доступа</span>
                <input v-model.number="productForm.accessDays" class="text-input mt-2" type="number" min="1" required />
              </label>
            </div>
            <label v-if="productForm.kind === 'recurrent'" class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">ID подписки Prodamus</span>
              <input v-model.trim="productForm.prodamusSubscriptionId" class="text-input mt-2" required />
            </label>
            <label class="flex items-center gap-3 rounded-[18px] bg-[var(--field)] p-4 text-sm font-semibold text-[var(--text)]">
              <input v-model="productForm.isPublished" type="checkbox" />
              Показывать клиентам
            </label>
            <div class="grid grid-cols-2 gap-3">
              <button class="secondary-button" type="button" @click="closeProductModal">Закрыть</button>
              <button class="primary-button" type="submit" :disabled="saving">
                {{ editingProduct ? "Сохранить тариф" : "Добавить тариф" }}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </Teleport>
  </section>
</template>
