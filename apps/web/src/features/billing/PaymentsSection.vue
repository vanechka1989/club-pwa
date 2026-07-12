<script setup lang="ts">
import type { PaymentProduct, PaymentProvider, UserRecurrentSubscription } from "@club/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-vue-next";
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
import { openPaymentCheckoutUrl } from "@/features/billing/paymentRedirect";
import { startPaymentWatch } from "@/features/billing/paymentWatch";
import { findActiveRecurrentSubscription, findRestorableRecurrentSubscription } from "@/features/billing/recurrentSubscription";
import { formatArchiveDeletionLabel } from "@/features/app/archiveCountdown";
import BottomSheet from "@/features/app/BottomSheet.vue";
import ConfirmDialog from "@/features/app/ConfirmDialog.vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { useI18n } from "@/features/app/i18n";
import { useOperationIndicator } from "@/features/app/useOperationIndicator";
import { useNotificationsStore } from "@/stores/notifications";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const notifications = useNotificationsStore();
const route = useRoute();
const router = useRouter();
const { currentLocale, t } = useI18n();

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
const checkoutProductId = ref<string | null>(null);
const showCheckoutConfirm = ref(false);
const checkoutConfirmProduct = ref<PaymentProduct | null>(null);
let checkoutConfirmResolve: ((confirmed: boolean) => void) | null = null;

const providerForm = ref({
  formUrl: "",
  secretKey: "",
  isEnabled: true
});

const productForm = ref({
  kind: "one_time" as "one_time" | "recurrent",
  title: "",
  badgeLabel: "",
  amountRub: 990,
  accessDays: 30,
  prodamusSubscriptionId: "",
  isPublished: true
});

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
const paymentOperation = computed(() => {
  if (!saving.value) {
    return null;
  }

  if (checkoutProductId.value) {
    return {
      title: "Открываем оплату...",
      detail: "Готовим платёжную страницу"
    };
  }

  if (showProviderForm.value) {
    return {
      title: "Сохраняем платежную систему...",
      detail: "Обновляем настройки Prodamus"
    };
  }

  if (showProductModal.value) {
    return {
      title: "Сохраняем тариф...",
      detail: "Обновляем настройки доступа"
    };
  }

  return {
    title: "Обновляем оплату...",
    detail: "Выполняем действие"
  };
});

useOperationIndicator(paymentOperation);

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
}

function confirmPaymentRedirect(product: PaymentProduct) {
  if (showCheckoutConfirm.value) {
    return Promise.resolve(false);
  }

  checkoutConfirmProduct.value = product;
  showCheckoutConfirm.value = true;
  return new Promise<boolean>((resolve) => {
    checkoutConfirmResolve = resolve;
  });
}

function resolveCheckoutConfirm(confirmed: boolean) {
  const resolve = checkoutConfirmResolve;
  checkoutConfirmResolve = null;
  showCheckoutConfirm.value = false;
  checkoutConfirmProduct.value = null;
  resolve?.(confirmed);
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

function openPaymentTask(path: string) {
  if (route.path !== path) {
    void router.push(path);
  }
}

function closePaymentTask() {
  if (route.path !== "/payments") {
    void router.push("/payments");
  }
}

function setProviderForm() {
  providerForm.value = {
    formUrl: provider.value?.formUrl ?? "",
    secretKey: "",
    isEnabled: provider.value?.isEnabled ?? true
  };
}

function openProviderForm() {
  if (!isOwner.value) {
    return;
  }
  setProviderForm();
  showProviderPicker.value = false;
  showProviderForm.value = true;
  openPaymentTask("/payments/provider");
}

function closeProviderForm() {
  showProviderForm.value = false;
  closePaymentTask();
}

function resetProductForm() {
  editingProduct.value = null;
  productForm.value = {
    kind: "one_time",
    title: "",
    badgeLabel: "",
    amountRub: 990,
    accessDays: 30,
    prodamusSubscriptionId: "",
    isPublished: true
  };
}

function setProductForm(product?: PaymentProduct) {
  if (product) {
    editingProduct.value = product;
    productForm.value = {
      kind: product.kind,
      title: product.title,
      badgeLabel: product.badgeLabel ?? "",
      amountRub: product.amountRub,
      accessDays: product.accessDays,
      prodamusSubscriptionId: product.prodamusSubscriptionId ?? "",
      isPublished: product.isPublished
    };
  } else {
    resetProductForm();
  }
}

function openProductModal(product?: PaymentProduct) {
  setProductForm(product);
  showProductModal.value = true;
  if (product) {
    openPaymentTask(`/payments/plans/${product.id}/edit`);
  } else {
    openPaymentTask("/payments/plans/new");
  }
}

function closeProductModal() {
  showProductModal.value = false;
  resetProductForm();
  closePaymentTask();
}

function syncPaymentTaskRoute() {
  if (route.path === "/payments/provider") {
    if (isOwner.value) {
      setProviderForm();
      showProviderForm.value = true;
    }
    return;
  }

  if (route.path === "/payments/plans/new") {
    resetProductForm();
    showProductModal.value = true;
    return;
  }

  const editMatch = route.path.match(/^\/payments\/plans\/([^/]+)\/edit$/);
  if (editMatch) {
    const product = products.value.find((entry) => entry.id === editMatch[1]);
    if (product) {
      setProductForm(product);
      showProductModal.value = true;
    }
    return;
  }

  showProviderForm.value = false;
  showProductModal.value = false;
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
      badgeLabel: productForm.value.badgeLabel.trim() || null,
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

  if (!(await confirmPaymentRedirect(product))) {
    return;
  }

  checkoutProductId.value = product.id;
  saving.value = true;
  error.value = null;
  try {
    const response = await createPaymentCheckout(product.id);
    if (response.checkoutUrl) {
      startPaymentWatch();
      openPaymentCheckoutUrl(response.checkoutUrl);
      return;
    }
    showAlert(response.message, "info");
  } catch {
    showPaymentError("Не удалось открыть оплату.");
  } finally {
    saving.value = false;
    checkoutProductId.value = null;
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
  return `${amountRub.toLocaleString(currentLocale.value === "en" ? "en-US" : "ru-RU")} ₽`;
}

function productPeriod(product: PaymentProduct) {
  return product.kind === "recurrent"
    ? `${t("paymentsRecurringPeriod")} ${product.accessDays} ${t("paymentsDaysShort")}`
    : `${t("paymentsOneTimePeriod")} ${product.accessDays} ${t("paymentsDaysShort")}`;
}

onMounted(async () => {
  await Promise.all([loadPayments(), loadProviderForAdmin()]);
  syncPaymentTaskRoute();
});

watch(() => route.path, syncPaymentTaskRoute);
</script>

<template>
  <section class="ui-page-section space-y-5">
    <div class="section-head ui-page-header">
      <div>
        <h2 class="section-title">{{ t("paymentsTitle") }}</h2>
        <p class="section-subtitle">{{ t("paymentsSubtitle") }}</p>
      </div>
      <button v-if="isOwner" class="icon-button ui-icon-button" type="button" aria-label="Добавить платежную систему" @click="openProviderPicker">
        <Plus :size="20" />
      </button>
    </div>

    <p v-if="error" class="text-sm text-[var(--danger-text)]">{{ error }}</p>
    <p v-else-if="notice" class="text-sm text-[var(--muted-strong)]">{{ notice }}</p>

    <div v-if="isAdmin" class="surface-card ui-card space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold text-[var(--text)]">{{ t("paymentsProvider") }}</p>
          <div class="payment-provider-status" :class="provider?.isEnabled ? 'payment-provider-status-enabled' : 'payment-provider-status-disabled'">
            {{ provider?.isEnabled ? t("paymentsProviderEnabled") : t("paymentsProviderDisabled") }}
          </div>
        </div>
        <button v-if="isOwner" class="secondary-button ui-button w-auto px-4" type="button" @click="openProviderForm">
          {{ provider ? t("paymentsSetup") : t("paymentsConnect") }}
        </button>
      </div>
    </div>

    <div class="surface-card ui-card payment-plans-card">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="font-semibold text-[var(--text)]">{{ t("paymentsPlans") }}</p>
          <p class="mt-1 text-sm text-[var(--muted)]">{{ t("paymentsPlansText") }}</p>
        </div>
        <button v-if="isOwner" class="icon-button ui-icon-button" type="button" aria-label="Добавить тариф" :disabled="!provider" @click="openProductModal()">
          <Plus :size="20" />
        </button>
      </div>

      <div v-if="activeRecurrentSubscription && !isOwner" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ activeRecurrentSubscription.title }}</p>
        <p class="mt-1 text-sm text-[var(--muted)]">{{ t("paymentsRecurringActive") }}</p>
        <button
          class="secondary-button ui-button mt-3"
          type="button"
          :disabled="saving"
          @click="handleCancelSubscription(activeRecurrentSubscription)"
        >
          {{ t("paymentsCancelSubscription") }}
        </button>
      </div>
      <div v-else-if="restorableRecurrentSubscription && !isOwner" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ restorableRecurrentSubscription.title }}</p>
        <p class="mt-1 text-sm text-[var(--muted)]">
          {{ t("paymentsRecurringCancelledHint") }}
        </p>
        <button
          class="secondary-button ui-button mt-3"
          type="button"
          :disabled="saving"
          @click="handleRestoreSubscription(restorableRecurrentSubscription)"
        >
          {{ t("paymentsRestoreSubscription") }}
        </button>
      </div>
      <p v-else-if="loading" class="text-sm text-[var(--muted)]">{{ t("paymentsLoading") }}</p>
      <p v-else-if="!activeProducts.length" class="rounded-[18px] bg-[var(--field)] p-4 text-sm text-[var(--muted)]">
        {{ t("paymentsEmpty") }}
      </p>

      <div v-else class="payment-product-list">
        <article v-for="product in activeProducts" :key="product.id" class="soft-payment-card payment-product-row">
          <div class="payment-product-main">
            <div class="payment-product-heading">
              <p class="payment-product-title">{{ product.title }}</p>
              <span v-if="product.badgeLabel" class="payment-product-badge">{{ product.badgeLabel }}</span>
            </div>
            <p class="payment-product-meta">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
          </div>
          <div class="payment-product-actions ui-button-group">
            <button
              v-if="!primaryRecurrentSubscription"
              class="primary-button ui-button payment-product-pay"
              :class="{ 'payment-product-pay-loading': checkoutProductId === product.id }"
              type="button"
              :disabled="saving || !provider?.isEnabled"
              :aria-busy="checkoutProductId === product.id"
              @click="handleCheckout(product)"
            >
              <span>{{ checkoutProductId === product.id ? t("paymentsOpening") : product.kind === "recurrent" ? t("paymentsSubscribe") : t("paymentsPay") }}</span>
            </button>
            <div v-if="isOwner" class="payment-product-admin-actions">
              <button class="icon-button ui-icon-button" type="button" aria-label="Редактировать тариф" @click="openProductModal(product)">
                <Pencil :size="16" />
              </button>
              <button class="icon-button ui-icon-button" type="button" aria-label="Скрыть тариф" @click="handleToggleProduct(product)">
                <EyeOff :size="16" />
              </button>
              <button class="icon-button ui-icon-button" type="button" aria-label="Удалить тариф" @click="handleDeleteProduct(product)">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div v-if="activeRecurrentSubscription && isOwner" class="surface-card ui-card space-y-3">
      <p class="font-semibold text-[var(--text)]">{{ t("profileRecurrentPayment") }}</p>
      <article class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ activeRecurrentSubscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">{{ t("paymentsRecurringActive") }}</p>
          </div>
          <button
            class="secondary-button ui-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleCancelSubscription(activeRecurrentSubscription)"
          >
            {{ t("supportCancel") }}
          </button>
        </div>
      </article>
    </div>

    <div v-if="restorableRecurrentSubscription && isOwner" class="surface-card ui-card space-y-3">
      <p class="font-semibold text-[var(--text)]">{{ t("profileRecurrentCancelled") }}</p>
      <article class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ restorableRecurrentSubscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">{{ t("paymentsRecurringCancelledHint") }}</p>
          </div>
          <button
            class="secondary-button ui-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleRestoreSubscription(restorableRecurrentSubscription)"
          >
            {{ t("paymentsRestoreSubscription") }}
          </button>
        </div>
      </article>
    </div>

    <div v-if="recurrentSubscriptionHistory.length" class="surface-card ui-card space-y-3">
      <p class="font-semibold text-[var(--text)]">{{ t("paymentsSubscriptions") }}</p>
      <article v-for="subscription in recurrentSubscriptionHistory" :key="subscription.id" class="rounded-[18px] bg-[var(--field)] p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--text)]">{{ subscription.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">
              {{ subscription.status === "active" ? t("paymentsActive") : t("paymentsCancelled") }}
            </p>
          </div>
          <button
            v-if="subscription.status === 'active'"
            class="secondary-button ui-button w-auto px-4"
            type="button"
            :disabled="saving"
            @click="handleCancelSubscription(subscription)"
          >
            {{ t("supportCancel") }}
          </button>
        </div>
      </article>
    </div>

    <div v-if="isOwner && hiddenProducts.length" class="surface-card ui-card space-y-3">
      <p class="font-semibold text-[var(--text)]">{{ t("paymentsHiddenPlans") }}</p>
      <article v-for="product in hiddenProducts" :key="product.id" class="flex items-center justify-between gap-3 rounded-[18px] bg-[var(--field)] p-4">
        <div>
          <p class="font-semibold text-[var(--text)]">{{ product.title }}</p>
          <p class="text-sm text-[var(--muted)]">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
        </div>
        <div class="flex gap-2">
          <button class="icon-button ui-icon-button" type="button" aria-label="Открыть тариф" @click="handleToggleProduct(product)">
            <Eye :size="18" />
          </button>
          <button class="icon-button ui-icon-button" type="button" aria-label="Удалить тариф" @click="handleDeleteProduct(product)">
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </div>

    <div v-if="isOwner && archivedProducts.length" class="surface-card ui-card space-y-3 opacity-75">
      <p class="font-semibold text-[var(--text)]">{{ t("paymentsArchivedPlans") }}</p>
      <article v-for="product in archivedProducts" :key="product.id" class="rounded-[18px] bg-[var(--field)] p-4">
        <p class="font-semibold text-[var(--text)]">{{ product.title }}</p>
        <p class="text-sm text-[var(--muted)]">{{ formatArchiveDeletionLabel(product.archivedUntil) }}</p>
      </article>
    </div>

    <ConfirmDialog
      :open="showCheckoutConfirm"
      title="Подтвердите оплату"
      :description="checkoutConfirmProduct ? `${checkoutConfirmProduct.title}. ${paymentRedirectNotice}` : paymentRedirectNotice"
      confirm-label="Продолжить"
      cancel-label="Отмена"
      @cancel="resolveCheckoutConfirm(false)"
      @confirm="resolveCheckoutConfirm(true)"
    />

    <BottomSheet :open="showProviderPicker" title="Добавить платежную систему" @close="closeProviderPicker">
      <button class="bottom-sheet-option" type="button" @click="openProviderForm">
        <span class="bottom-sheet-option-title">Prodamus</span>
        <span class="bottom-sheet-option-text">{{ provider ? "Подключена. Можно изменить настройки." : "Нажмите, чтобы подключить." }}</span>
      </button>
    </BottomSheet>

    <TaskScreen
      v-if="showProviderForm"
      class="payment-task-screen"
      title="Prodamus"
      subtitle="Данные платежной формы и URL уведомлений."
      portal
      @back="closeProviderForm"
    >
          <form class="payment-form-body space-y-3" @submit.prevent="handleSaveProvider">
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
                <button class="icon-button ui-icon-button shrink-0" type="button" aria-label="Скопировать URL уведомлений" @click="copyWebhookUrl">
                  <Copy :size="18" />
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <button class="secondary-button ui-button" type="button" @click="closeProviderForm">Закрыть</button>
              <button class="primary-button ui-button" type="submit" :disabled="saving">
                {{ provider ? "Сохранить" : "Подключить" }}
              </button>
            </div>
          </form>
    </TaskScreen>

    <TaskScreen
      v-if="showProductModal"
      class="payment-task-screen"
      :title="editingProduct ? 'Редактировать тариф' : 'Новый тариф'"
      subtitle="Обычный платеж или рекуррентная подписка."
      portal
      @back="closeProductModal"
    >
          <form class="payment-form-body space-y-3" @submit.prevent="handleSaveProduct">
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
            <label class="block">
              <span class="text-sm font-semibold text-[var(--muted)]">Метка (необязательно)</span>
              <input v-model="productForm.badgeLabel" class="text-input mt-2" maxlength="32" placeholder="Например: Выгодно" />
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
              <button class="secondary-button ui-button" type="button" @click="closeProductModal">Закрыть</button>
              <button class="primary-button ui-button" type="submit" :disabled="saving">
                {{ editingProduct ? "Сохранить тариф" : "Добавить тариф" }}
              </button>
            </div>
          </form>
    </TaskScreen>
  </section>
</template>
