<script setup lang="ts">
import type { PaymentProduct, PaymentProvider, UserRecurrentSubscription } from "@club/shared";
import { computed, onMounted, ref } from "vue";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-vue-next";
import {
  cancelRecurrentSubscription,
  createPaymentCheckout,
  createPaymentProduct,
  deletePaymentProduct,
  getPaymentPlans,
  getPaymentProvider,
  saveProdamusProvider,
  updatePaymentProduct,
  updatePaymentProductStatus
} from "@/api/client";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();

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

const providerForm = ref({
  formUrl: "",
  secretKey: "",
  isEnabled: true
});

const productForm = ref({
  kind: "one_time" as "one_time" | "recurrent",
  title: "",
  description: "",
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

function showAlert(message: string) {
  notice.value = message;
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
  }
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
    error.value = "Не удалось загрузить оплату.";
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
    error.value = "Не удалось загрузить настройки платежной системы.";
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

function openProviderForm() {
  if (!isOwner.value) {
    return;
  }
  providerForm.value = {
    formUrl: provider.value?.formUrl ?? "",
    secretKey: "",
    isEnabled: provider.value?.isEnabled ?? true
  };
  showProviderPicker.value = false;
  showProviderForm.value = true;
}

function closeProviderForm() {
  showProviderForm.value = false;
}

function resetProductForm() {
  editingProduct.value = null;
  productForm.value = {
    kind: "one_time",
    title: "",
    description: "",
    amountRub: 990,
    accessDays: 30,
    prodamusSubscriptionId: "",
    isPublished: true
  };
}

function openProductModal(product?: PaymentProduct) {
  if (product) {
    editingProduct.value = product;
    productForm.value = {
      kind: product.kind,
      title: product.title,
      description: product.description ?? "",
      amountRub: product.amountRub,
      accessDays: product.accessDays,
      prodamusSubscriptionId: product.prodamusSubscriptionId ?? "",
      isPublished: product.isPublished
    };
  } else {
    resetProductForm();
  }
  showProductModal.value = true;
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
    const payload: { formUrl: string; secretKey?: string; sys: string; isEnabled?: boolean } = {
      formUrl: providerForm.value.formUrl,
      sys: "clubcrm",
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
    error.value = "Не удалось сохранить Prodamus.";
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
      description: productForm.value.description.trim() || null,
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
    error.value = "Не удалось сохранить тариф.";
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
    error.value = "Не удалось изменить тариф.";
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
    error.value = "Не удалось удалить тариф.";
  } finally {
    saving.value = false;
  }
}

async function handleCheckout(product: PaymentProduct) {
  saving.value = true;
  error.value = null;
  try {
    const response = await createPaymentCheckout(product.id);
    if (response.checkoutUrl) {
      window.location.href = response.checkoutUrl;
      return;
    }
    showAlert(response.message);
  } catch {
    error.value = "Не удалось открыть оплату.";
  } finally {
    saving.value = false;
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
    showAlert("Подписка отменена.");
  } catch {
    error.value = "Не удалось отменить подписку.";
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

      <p v-if="loading" class="text-sm text-[var(--muted)]">Загрузка оплаты...</p>
      <p v-else-if="!activeProducts.length" class="rounded-[18px] bg-[var(--field)] p-4 text-sm text-[var(--muted)]">
        Тарифы появятся после добавления админом.
      </p>

      <div class="space-y-3">
        <article v-for="product in activeProducts" :key="product.id" class="soft-payment-card">
          <div class="min-w-0">
            <p class="font-semibold text-[var(--text)]">{{ product.title }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">{{ product.description || productPeriod(product) }}</p>
            <p class="mt-2 text-sm font-semibold text-[var(--accent)]">{{ formatMoney(product.amountRub) }} · {{ productPeriod(product) }}</p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="primary-button flex-1" type="button" :disabled="saving || !provider?.isEnabled" @click="handleCheckout(product)">
              {{ product.kind === "recurrent" ? "Оформить подписку" : "Оплатить" }}
            </button>
            <template v-if="isOwner">
              <button class="icon-button" type="button" aria-label="Редактировать тариф" @click="openProductModal(product)">
                <Pencil :size="18" />
              </button>
              <button class="icon-button" type="button" aria-label="Скрыть тариф" @click="handleToggleProduct(product)">
                <EyeOff :size="18" />
              </button>
              <button class="icon-button" type="button" aria-label="Удалить тариф" @click="handleDeleteProduct(product)">
                <Trash2 :size="18" />
              </button>
            </template>
          </div>
        </article>
      </div>
    </div>

    <div v-if="recurrentSubscriptions.length" class="surface-card space-y-3">
      <p class="font-semibold text-[var(--text)]">Ваши подписки</p>
      <article v-for="subscription in recurrentSubscriptions" :key="subscription.id" class="rounded-[18px] bg-[var(--field)] p-4">
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

    <div v-if="showProviderPicker" class="admin-modal-backdrop" @click.self="closeProviderPicker">
      <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="provider-picker-title">
        <header class="admin-client-modal-head">
          <div>
            <h3 id="provider-picker-title">Добавить платежную систему</h3>
            <p>Сейчас доступен Prodamus.</p>
          </div>
          <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProviderPicker">
            <X :size="18" />
          </button>
        </header>
        <button class="surface-card w-full text-left" type="button" @click="openProviderForm">
          <p class="font-semibold text-[var(--text)]">Prodamus</p>
          <p class="mt-1 text-sm text-[var(--muted)]">{{ provider ? "Подключена. Можно изменить настройки." : "Нажмите, чтобы подключить." }}</p>
        </button>
      </aside>
    </div>

    <div v-if="showProviderForm" class="admin-modal-backdrop" @click.self="closeProviderForm">
      <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="provider-form-title">
        <header class="admin-client-modal-head">
          <div>
            <h3 id="provider-form-title">Prodamus</h3>
            <p>Данные платежной формы и URL уведомлений.</p>
          </div>
          <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProviderForm">
            <X :size="18" />
          </button>
        </header>

        <form class="space-y-3" @submit.prevent="handleSaveProvider">
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

    <div v-if="showProductModal" class="admin-modal-backdrop" @click.self="closeProductModal">
      <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <header class="admin-client-modal-head">
          <div>
            <h3 id="product-modal-title">{{ editingProduct ? "Редактировать тариф" : "Новый тариф" }}</h3>
            <p>Обычный платеж или рекуррентная подписка.</p>
          </div>
          <button class="icon-button" type="button" aria-label="Закрыть" @click="closeProductModal">
            <X :size="18" />
          </button>
        </header>

        <form class="space-y-3" @submit.prevent="handleSaveProduct">
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
            <span class="text-sm font-semibold text-[var(--muted)]">Описание</span>
            <textarea v-model.trim="productForm.description" class="text-input mt-2 min-h-24" />
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
          <button class="primary-button" type="submit" :disabled="saving">
            {{ editingProduct ? "Сохранить тариф" : "Добавить тариф" }}
          </button>
        </form>
      </aside>
    </div>
  </section>
</template>
