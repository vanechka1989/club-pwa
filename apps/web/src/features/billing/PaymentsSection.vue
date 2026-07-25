<script setup lang="ts">
import type {
  PaymentCheckoutOption,
  PaymentProduct,
  PaymentProductProviderBinding,
  PaymentProvider,
  PaymentProviderCode,
  PaymentProviderCatalogItem,
  UserRecurrentSubscription
} from "@club/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-vue-next";
import {
  cancelRecurrentSubscription,
  createPaymentCheckout,
  createPaymentProduct,
  checkLavaProvider,
  deletePaymentProduct,
  getLavaCatalog,
  getPaymentPlans,
  getPaymentProvider,
  getPaymentProviders,
  restoreRecurrentSubscription,
  saveLavaProvider,
  saveProdamusProvider,
  syncLavaCatalog,
  updateLavaCatalogItemSelection,
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
import { UiPageHeader } from "@/features/ui";
import { useI18n } from "@/features/app/i18n";
import { useOperationIndicator } from "@/features/app/useOperationIndicator";
import { useNotificationsStore } from "@/stores/notifications";
import { useAppDialogsStore } from "@/stores/appDialogs";
import { useSessionStore } from "@/stores/session";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";
import PaymentProductBindings from "./PaymentProductBindings.vue";
import PaymentProviderChooser from "./PaymentProviderChooser.vue";
import PaymentProviderSettings from "./PaymentProviderSettings.vue";
import LavaProviderTabs from "./LavaProviderTabs.vue";
import LavaCatalogList from "./LavaCatalogList.vue";

const session = useSessionStore();
const notifications = useNotificationsStore();
const appDialogs = useAppDialogsStore();
const route = useRoute();
const router = useRouter();
const { currentLocale, t } = useI18n();

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const provider = ref<PaymentProvider | null>(null);
const providers = ref<PaymentProvider[]>([]);
const webhookUrl = ref("");
const lavaCatalog = ref<PaymentProviderCatalogItem[]>([]);
const products = ref<PaymentProduct[]>([]);
const recurrentSubscriptions = ref<UserRecurrentSubscription[]>([]);
const showProviderPicker = ref(false);
const showProviderForm = ref(false);
const providerFormKind = ref<PaymentProviderCode>("prodamus");
const showProductModal = ref(false);
const editingProduct = ref<PaymentProduct | null>(null);
const isEditingPayments = ref(false);
const checkoutProductId = ref<string | null>(null);
const showCheckoutConfirm = ref(false);
const showCheckoutProviderPicker = ref(false);
const checkoutOptions = ref<PaymentCheckoutOption[]>([]);
const checkoutChoiceProduct = ref<PaymentProduct | null>(null);
const checkoutConfirmProduct = ref<PaymentProduct | null>(null);
let checkoutConfirmResolve: ((confirmed: boolean) => void) | null = null;

const providerForm = ref({
  formUrl: "",
  secretKey: "",
  isEnabled: true
});
const lavaProviderForm = ref({ apiKey: "", webhookSecret: "", isEnabled: true });
const lavaProviderTab = ref<"connection" | "catalog">("connection");
const lavaWebhookUrls = ref<{ payment: string; subscription: string } | null>(null);
const catalogItemSavingId = ref<string | null>(null);

const productForm = ref({
  kind: "one_time" as "one_time" | "recurrent",
  title: "",
  badgeLabel: "",
  amountRub: 990,
  accessDays: 30,
  prodamusSubscriptionId: "",
  bindings: [
    { provider: "prodamus", enabled: true, externalProductId: null, externalOfferId: null },
    { provider: "lava", enabled: false, externalProductId: null, externalOfferId: null }
  ] as PaymentProductProviderBinding[],
  isPublished: true
});

const isAdmin = computed(() =>
  hasAdminCapability(session.user?.role, session.user?.adminPermissions, "payments")
);
const isOwner = computed(() => session.user?.role === "owner");
const lavaProvider = computed(() => providers.value.find((entry) => entry.provider === "lava") ?? null);
const lavaProviderConnected = computed(() =>
  Boolean(lavaProvider.value?.secretConfigured && lavaProvider.value?.webhookSecretConfigured)
);
const connectedProviders = computed(() =>
  providers.value.filter(
    (entry) =>
      entry.isEnabled &&
      entry.secretConfigured &&
      (entry.provider !== "lava" || entry.webhookSecretConfigured)
  )
);
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
const primaryRecurrentSubscription = computed(() =>
  activeRecurrentSubscription.value ??
  (restorableRecurrentSubscription.value?.provider === "prodamus" ? restorableRecurrentSubscription.value : null)
);
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
      detail: `Обновляем настройки ${providerFormKind.value === "lava" ? "Lava" : "Prodamus"}`
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
    if (response.provider && !providers.value.some((entry) => entry.id === response.provider?.id)) {
      providers.value = [response.provider, ...providers.value];
    }
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
    const [legacy, allProviders, catalog] = await Promise.all([
      getPaymentProvider(),
      getPaymentProviders(),
      getLavaCatalog()
    ]);
    provider.value = legacy.provider;
    webhookUrl.value = legacy.webhookUrl;
    providers.value = allProviders.providers;
    lavaWebhookUrls.value = allProviders.lavaWebhookUrls;
    lavaCatalog.value = catalog.items;
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

function openProviderForm(kind: PaymentProviderCode = "prodamus") {
  if (!isOwner.value) {
    return;
  }
  setProviderForm();
  providerFormKind.value = kind;
  lavaProviderForm.value = {
    apiKey: "",
    webhookSecret: lavaProvider.value ? "" : generateWebhookSecret(),
    isEnabled: lavaProvider.value?.isEnabled ?? true
  };
  lavaProviderTab.value = "connection";
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
  const defaultProvider = connectedProviders.value[0]?.provider ?? "prodamus";
  productForm.value = {
    kind: "one_time",
    title: "",
    badgeLabel: "",
    amountRub: 990,
    accessDays: 30,
    prodamusSubscriptionId: "",
    bindings: [
      { provider: "prodamus", enabled: defaultProvider === "prodamus", externalProductId: null, externalOfferId: null },
      { provider: "lava", enabled: defaultProvider === "lava", externalProductId: null, externalOfferId: null }
    ],
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
      bindings: product.bindings.length ? product.bindings.map((binding) => ({ ...binding })) : [
        {
          provider: "prodamus",
          enabled: true,
          externalProductId: product.prodamusSubscriptionId,
          externalOfferId: null
        },
        { provider: "lava", enabled: false, externalProductId: null, externalOfferId: null }
      ],
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
  const isPaymentPlanTask =
    route.path === "/payments/plans/new" || /^\/payments\/plans\/[^/]+\/edit$/.test(route.path);

  if ((route.path === "/payments/provider" && !isOwner.value) || (isPaymentPlanTask && !isAdmin.value)) {
    showProviderForm.value = false;
    showProductModal.value = false;
    resetProductForm();
    void router.replace("/payments");
    return;
  }

  if (route.path === "/payments/provider") {
    if (isOwner.value) {
      isEditingPayments.value = true;
      setProviderForm();
      showProviderForm.value = true;
    }
    return;
  }

  if (route.path === "/payments/plans/new") {
    isEditingPayments.value = true;
    resetProductForm();
    showProductModal.value = true;
    return;
  }

  const editMatch = route.path.match(/^\/payments\/plans\/([^/]+)\/edit$/);
  if (editMatch) {
    const product = products.value.find((entry) => entry.id === editMatch[1]);
    if (product) {
      isEditingPayments.value = true;
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
    webhookUrl.value = response.provider.webhookUrl ?? webhookUrl.value;
    closeProviderForm();
    showAlert("Prodamus подключен.");
  } catch {
    showPaymentError("Не удалось сохранить Prodamus.");
  } finally {
    saving.value = false;
  }
}

async function handleSaveLavaProvider() {
  saving.value = true;
  error.value = null;
  try {
    const payload: { apiKey?: string; webhookSecret?: string; isEnabled?: boolean } = {
      isEnabled: lavaProviderForm.value.isEnabled
    };
    if (lavaProviderForm.value.apiKey.trim()) payload.apiKey = lavaProviderForm.value.apiKey.trim();
    if (lavaProviderForm.value.webhookSecret.trim()) payload.webhookSecret = lavaProviderForm.value.webhookSecret.trim();
    const response = await saveLavaProvider(payload);
    providers.value = [
      ...providers.value.filter((entry) => entry.provider !== "lava"),
      response.provider
    ];
    lavaWebhookUrls.value = response.provider.webhookUrls ?? lavaWebhookUrls.value;
    lavaProviderTab.value = "catalog";
    showAlert("Lava подключена.");
  } catch {
    showPaymentError("Не удалось сохранить Lava.");
  } finally {
    saving.value = false;
  }
}

async function handleCheckLava() {
  saving.value = true;
  try {
    const response = await checkLavaProvider();
    providers.value = [...providers.value.filter((entry) => entry.provider !== "lava"), response.provider];
    showAlert("Соединение с Lava проверено.");
  } catch {
    showPaymentError("Не удалось проверить Lava.");
  } finally {
    saving.value = false;
  }
}

async function handleSyncLava() {
  saving.value = true;
  try {
    const result = await syncLavaCatalog();
    lavaCatalog.value = (await getLavaCatalog()).items;
    showAlert(`Товары Lava обновлены: ${result.count}.`);
  } catch {
    showPaymentError("Не удалось обновить товары Lava.");
  } finally {
    saving.value = false;
  }
}

async function handleLavaCatalogSelection(payload: { id: string; isSelectable: boolean }) {
  catalogItemSavingId.value = payload.id;
  try {
    await updateLavaCatalogItemSelection(payload.id, payload.isSelectable);
    lavaCatalog.value = lavaCatalog.value.map((item) =>
      item.id === payload.id ? { ...item, isSelectable: payload.isSelectable } : item
    );
    showAlert(payload.isSelectable ? "Товар доступен в тарифах." : "Товар скрыт из новых тарифов.");
  } catch {
    showPaymentError("Не удалось изменить доступность товара Lava.");
  } finally {
    catalogItemSavingId.value = null;
  }
}

async function copyValue(value: string) {
  await navigator.clipboard?.writeText(value);
  showAlert("Адрес скопирован.");
}

function generateWebhookSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function handleSaveProduct() {
  saving.value = true;
  error.value = null;
  try {
    const prodamusBinding = productForm.value.bindings.find((binding) => binding.provider === "prodamus");
    const payload = {
      ...productForm.value,
      description: null,
      badgeLabel: productForm.value.badgeLabel.trim() || null,
      prodamusSubscriptionId: productForm.value.kind === "recurrent"
        ? prodamusBinding?.externalProductId?.trim() || null
        : null,
      bindings: productForm.value.bindings
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
  const confirmed = await appDialogs.confirm({
    title: `${product.isPublished ? "Скрыть" : "Открыть"} тариф «${product.title}»?`,
    description: product.isPublished
      ? "Клиенты больше не увидят этот тариф в разделе оплаты."
      : "Тариф снова станет доступен клиентам.",
    confirmLabel: product.isPublished ? "Скрыть тариф" : "Открыть тариф"
  });
  if (!confirmed) {
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
  const confirmed = await appDialogs.confirm({
    title: `Удалить тариф «${product.title}»?`,
    description: "Тариф будет скрыт и останется в архиве 7 дней.",
    confirmLabel: "Удалить тариф",
    tone: "danger"
  });
  if (!confirmed) {
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

async function startCheckout(product: PaymentProduct, selectedProvider?: PaymentProviderCode) {
  checkoutProductId.value = product.id;
  saving.value = true;
  error.value = null;
  try {
    const response = await createPaymentCheckout(product.id, selectedProvider);
    if (response.options?.length) {
      checkoutOptions.value = response.options;
      checkoutChoiceProduct.value = product;
      showCheckoutProviderPicker.value = true;
      return;
    }
    if (response.checkoutUrl) {
      showCheckoutProviderPicker.value = false;
      checkoutChoiceProduct.value = null;
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

async function handleCheckout(product: PaymentProduct) {
  if (activeRecurrentSubscription.value) {
    showAlert("У вас уже есть активная автоподписка. Отмените её перед новой оплатой.", "info");
    return;
  }
  if (restorableRecurrentSubscription.value?.provider === "prodamus") {
    showAlert("Восстановите отменённую автоподписку или дождитесь окончания доступа перед новой оплатой.", "info");
    return;
  }

  if (!(await confirmPaymentRedirect(product))) {
    return;
  }

  await startCheckout(product);
}

async function chooseCheckoutProvider(selectedProvider: PaymentProviderCode) {
  if (!checkoutChoiceProduct.value) return;
  await startCheckout(checkoutChoiceProduct.value, selectedProvider);
}

async function handleCancelSubscription(subscription: UserRecurrentSubscription) {
  const confirmed = await appDialogs.confirm({
    title: `Отменить подписку «${subscription.title}»?`,
    description: "Автоматическое продление будет отключено. Доступ сохранится до конца оплаченного периода.",
    confirmLabel: "Отменить подписку",
    tone: "danger"
  });
  if (!confirmed) {
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
  if (subscription.provider === "lava") {
    showAlert("Выберите тариф ниже и оформите подписку Lava снова.", "info");
    return;
  }
  const confirmed = await appDialogs.confirm({
    title: `Восстановить подписку «${subscription.title}»?`,
    description: "Автоматическое продление снова будет включено.",
    confirmLabel: "Восстановить"
  });
  if (!confirmed) {
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

watch([() => route.path, isAdmin, isOwner], syncPaymentTaskRoute);
</script>

<template>
  <section class="ui-page-section space-y-5">
    <UiPageHeader :title="t('paymentsTitle')" :subtitle="t('paymentsSubtitle')">
      <template v-if="isOwner" #actions>
        <div class="payment-header-actions">
          <button
            class="icon-button ui-icon-button"
            :class="{ 'payment-edit-toggle-active': isEditingPayments }"
            type="button"
            aria-label="Редактировать оплату"
            :aria-pressed="isEditingPayments"
            @click="isEditingPayments = !isEditingPayments"
          >
            <Pencil :size="19" />
          </button>
          <button
            class="icon-button ui-icon-button"
            type="button"
            aria-label="Добавить тариф"
            :disabled="!connectedProviders.length"
            @click="openProductModal()"
          >
            <Plus :size="20" />
          </button>
        </div>
      </template>
    </UiPageHeader>

    <p v-if="error" class="text-sm text-[var(--danger-text)]">{{ error }}</p>
    <p v-else-if="notice" class="text-sm text-[var(--muted-strong)]">{{ notice }}</p>

    <div v-if="isAdmin && isEditingPayments" class="surface-card ui-card space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold text-[var(--text)]">Платёжные системы</p>
          <p class="mt-1 text-sm text-[var(--muted)]">
            Подключено: {{ connectedProviders.length }} из 2
          </p>
        </div>
        <button v-if="isOwner" class="secondary-button ui-button w-auto px-4" type="button" @click="openProviderPicker">
          Настроить
        </button>
      </div>
      <div class="payment-provider-mini-list">
        <button type="button" @click="openProviderForm('prodamus')">
          <span>Prodamus</span>
          <small class="payment-provider-status" :class="provider?.isEnabled ? 'payment-provider-status-enabled' : 'payment-provider-status-disabled'">
            {{ provider?.secretConfigured ? "Подключено" : "Не подключено" }}
          </small>
        </button>
        <button type="button" @click="openProviderForm('lava')">
          <span>Lava</span>
          <small class="payment-provider-status" :class="lavaProvider?.isEnabled ? 'payment-provider-status-enabled' : 'payment-provider-status-disabled'">
            {{ lavaProvider?.secretConfigured ? "Подключено" : "Не подключено" }}
          </small>
        </button>
      </div>
    </div>

    <div class="surface-card ui-card payment-plans-card">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="font-semibold text-[var(--text)]">{{ t("paymentsPlans") }}</p>
          <p class="mt-1 text-sm text-[var(--muted)]">{{ t("paymentsPlansText") }}</p>
        </div>
        <button v-if="isOwner && isEditingPayments" class="icon-button ui-icon-button" type="button" aria-label="Добавить тариф" :disabled="!connectedProviders.length" @click="openProductModal()">
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
          {{ restorableRecurrentSubscription.provider === "lava" ? "Оформить снова" : t("paymentsRestoreSubscription") }}
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
            </div>
            <div class="payment-product-details">
              <p class="payment-product-meta">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
              <span v-if="product.badgeLabel" class="payment-product-badge">{{ product.badgeLabel }}</span>
            </div>
          </div>
          <div class="payment-product-actions ui-button-group">
            <button
              v-if="!primaryRecurrentSubscription"
              class="primary-button ui-button payment-product-pay"
              :class="{ 'payment-product-pay-loading': checkoutProductId === product.id }"
              type="button"
              :disabled="saving || !product.bindings.some((binding) => binding.enabled)"
              :aria-busy="checkoutProductId === product.id"
              @click="handleCheckout(product)"
            >
              <span>{{ checkoutProductId === product.id ? t("paymentsOpening") : product.kind === "recurrent" ? t("paymentsSubscribe") : t("paymentsPay") }}</span>
            </button>
            <div v-if="isOwner && isEditingPayments" class="payment-product-admin-actions">
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

    <div v-if="activeRecurrentSubscription && isOwner && isEditingPayments" class="surface-card ui-card space-y-3">
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

    <div v-if="restorableRecurrentSubscription && isOwner && isEditingPayments" class="surface-card ui-card space-y-3">
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
          {{ restorableRecurrentSubscription.provider === "lava" ? "Оформить снова" : t("paymentsRestoreSubscription") }}
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

    <div v-if="isOwner && isEditingPayments && hiddenProducts.length" class="surface-card ui-card space-y-3">
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

    <div v-if="isOwner && isEditingPayments && archivedProducts.length" class="surface-card ui-card space-y-3 opacity-75">
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
      <button class="bottom-sheet-option" type="button" @click="openProviderForm('prodamus')">
        <span class="bottom-sheet-option-title">Prodamus</span>
        <span class="bottom-sheet-option-text">{{ provider ? "Подключена. Можно изменить настройки." : "Нажмите, чтобы подключить." }}</span>
      </button>
      <button class="bottom-sheet-option" type="button" @click="openProviderForm('lava')">
        <span class="bottom-sheet-option-title">Lava</span>
        <span class="bottom-sheet-option-text">{{ lavaProvider ? "Подключена. Можно изменить настройки." : "Нажмите, чтобы подключить." }}</span>
      </button>
    </BottomSheet>

    <BottomSheet :open="showCheckoutProviderPicker" title="Выберите способ оплаты" @close="showCheckoutProviderPicker = false">
      <PaymentProviderChooser
        :options="checkoutOptions"
        @select="chooseCheckoutProvider"
        @close="showCheckoutProviderPicker = false"
      />
    </BottomSheet>

    <TaskScreen
      v-if="showProviderForm"
      class="payment-task-screen"
      :title="providerFormKind === 'lava' ? 'Lava' : 'Prodamus'"
      :subtitle="providerFormKind === 'lava' ? 'Подключение, webhook, проверка и товары.' : 'Данные платежной формы и URL уведомлений.'"
      portal
      @back="closeProviderForm"
    >
          <form v-if="providerFormKind === 'prodamus'" class="payment-form-body space-y-3" @submit.prevent="handleSaveProvider">
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
            <label class="payment-product-publish-toggle">
              <span class="payment-product-publish-copy">
                <strong>Платёжная система включена</strong>
                <small>{{ providerForm.isEnabled ? "Prodamus доступен для оплаты" : "Prodamus временно отключён" }}</small>
              </span>
              <span class="payment-product-publish-control">
                <input
                  v-model="providerForm.isEnabled"
                  class="payment-product-publish-input"
                  type="checkbox"
                  aria-label="Платёжная система включена"
                />
                <span class="payment-product-publish-switch" aria-hidden="true"></span>
              </span>
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
          <form v-else class="payment-form-body space-y-3" @submit.prevent="handleSaveLavaProvider">
            <LavaProviderTabs
              v-model="lavaProviderTab"
              :catalog-enabled="lavaProviderConnected"
            />
            <PaymentProviderSettings
              :provider="lavaProvider"
              :section="lavaProviderTab"
              v-bind="lavaWebhookUrls ? { webhookUrls: lavaWebhookUrls } : {}"
              :busy="saving"
              @check="handleCheckLava"
              @sync="handleSyncLava"
              @copy="copyValue"
            />
            <template v-if="lavaProviderTab === 'connection'">
              <label class="block">
                <span class="text-sm font-semibold text-[var(--muted)]">API-ключ Lava</span>
                <div v-if="lavaProvider?.secretConfigured" class="mt-2 rounded-[18px] border border-[var(--line)] bg-[var(--field)] px-4 py-3">
                  <span class="select-none text-sm font-semibold tracking-[0.24em] text-[var(--muted)] blur-[2px]">••••••••••••••••</span>
                  <p class="mt-1 text-xs text-[var(--muted)]">Ключ сохранён. Заполните поле только для замены.</p>
                </div>
                <input
                  v-model.trim="lavaProviderForm.apiKey"
                  class="text-input mt-2"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="lavaProvider ? 'Новый API-ключ, если меняете' : 'API-ключ Lava'"
                  :required="!lavaProvider"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-[var(--muted)]">Ключ для webhook</span>
                <p class="mt-1 text-xs text-[var(--muted)]">
                  Укажите этот же ключ в Lava для обоих webhook. Способ авторизации — API Key.
                </p>
                <div v-if="lavaProvider?.webhookSecretConfigured" class="mt-2 rounded-[18px] border border-[var(--line)] bg-[var(--field)] px-4 py-3">
                  <p class="text-xs text-[var(--muted)]">Ключ сохранён. Новый нужен только для замены.</p>
                </div>
                <div class="mt-2 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                  <input
                    v-model.trim="lavaProviderForm.webhookSecret"
                    class="text-input min-w-0"
                    type="text"
                    autocomplete="off"
                    :placeholder="lavaProvider ? 'Новый ключ, если меняете' : 'Ключ для webhook'"
                    :required="!lavaProvider"
                  />
                  <button
                    class="icon-button ui-icon-button"
                    type="button"
                    aria-label="Скопировать ключ webhook"
                    :disabled="!lavaProviderForm.webhookSecret"
                    @click="copyValue(lavaProviderForm.webhookSecret)"
                  >
                    <Copy :size="18" />
                  </button>
                </div>
              </label>
              <label class="payment-product-publish-toggle">
                <span class="payment-product-publish-copy">
                  <strong>Платёжная система включена</strong>
                  <small>{{ lavaProviderForm.isEnabled ? "Lava доступна для оплаты" : "Lava временно отключена" }}</small>
                </span>
                <span class="payment-product-publish-control">
                  <input
                    v-model="lavaProviderForm.isEnabled"
                    class="payment-product-publish-input"
                    type="checkbox"
                    aria-label="Платёжная система включена"
                  />
                  <span class="payment-product-publish-switch" aria-hidden="true"></span>
                </span>
              </label>
              <div class="grid grid-cols-2 gap-3">
                <button class="secondary-button ui-button" type="button" @click="closeProviderForm">Закрыть</button>
                <button class="primary-button ui-button" type="submit" :disabled="saving">
                  {{ lavaProvider ? "Сохранить" : "Подключить" }}
                </button>
              </div>
            </template>
            <template v-else>
              <LavaCatalogList
                :items="lavaCatalog"
                :busy-id="catalogItemSavingId"
                @change="handleLavaCatalogSelection"
              />
              <button class="secondary-button ui-button w-full" type="button" @click="closeProviderForm">Закрыть</button>
            </template>
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
            <PaymentProductBindings
              v-model="productForm.bindings"
              :kind="productForm.kind"
              :lava-catalog="lavaCatalog"
            />
            <label class="payment-product-publish-toggle">
              <span class="payment-product-publish-copy">
                <strong>Показывать клиентам</strong>
                <small>{{ productForm.isPublished ? "Тариф виден в разделе оплаты" : "Тариф скрыт от клиентов" }}</small>
              </span>
              <span class="payment-product-publish-control">
                <input
                  v-model="productForm.isPublished"
                  class="payment-product-publish-input"
                  type="checkbox"
                  aria-label="Показывать клиентам"
                />
                <span class="payment-product-publish-switch" aria-hidden="true"></span>
              </span>
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

<style scoped>
.payment-provider-mini-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.payment-provider-mini-list button{display:grid;gap:3px;min-width:0;min-height:54px;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--field);color:var(--text);text-align:left}
.payment-provider-mini-list span,.payment-provider-mini-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.payment-provider-mini-list span{font-weight:750}.payment-provider-mini-list small{color:var(--muted)}
@media(max-width:340px){.payment-provider-mini-list{grid-template-columns:1fr}}
</style>
