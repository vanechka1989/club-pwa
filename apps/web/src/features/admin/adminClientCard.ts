type AdminSubscriptionLike = {
  status: "active" | "inactive" | "expired";
  provider: string;
  providerPaymentId?: string | null;
  changedBy?: string | null;
};

function getManualActorId(providerPaymentId?: string | null) {
  const match = providerPaymentId?.match(/^admin:([^:]+):/);
  return match?.[1] ?? null;
}

export function getAdminSubscriptionTitle(subscription: AdminSubscriptionLike) {
  if (subscription.provider === "manual") {
    if (subscription.status === "active") {
      return "Доступ выдан вручную";
    }

    if (subscription.status === "inactive") {
      return "Доступ забран вручную";
    }

    return "Ручной доступ истёк";
  }

  if (subscription.provider === "prodamus_recurrent") {
    return "Оплачена автоподписка";
  }

  if (subscription.provider === "prodamus") {
    return "Оплачен разовый доступ";
  }

  return "Изменение доступа";
}

export function getAdminSubscriptionSourceLabel(subscription: AdminSubscriptionLike) {
  if (subscription.provider === "manual") {
    return "Ручное управление доступом";
  }

  if (subscription.provider === "prodamus_recurrent") {
    return "Автоподписка Prodamus";
  }

  if (subscription.provider === "prodamus") {
    return "Разовая оплата Prodamus";
  }

  return subscription.provider || "Источник не указан";
}

export function getAdminSubscriptionActorLabel(subscription: AdminSubscriptionLike) {
  if (subscription.provider !== "manual") {
    return null;
  }

  if (subscription.changedBy) {
    return `Кто изменил: ${subscription.changedBy}`;
  }

  const actorId = getManualActorId(subscription.providerPaymentId);
  return actorId ? `Кто изменил: ID ${actorId}` : "Кто изменил: не сохранено";
}

export function getAccessSaveButtonText(isSaved: boolean) {
  return isSaved ? "Сохранено" : "Сохранить";
}

export function getAdminTariffLabel(tariff: string | null | undefined) {
  if (!tariff || tariff === "future") {
    return "Без тарифа";
  }

  if (tariff === "manual") {
    return "Ручной доступ";
  }

  if (tariff === "prodamus") {
    return "Разовый платёж";
  }

  if (tariff === "prodamus_recurrent") {
    return "Автоподписка";
  }

  return tariff;
}
