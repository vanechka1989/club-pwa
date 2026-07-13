type AdminSubscriptionLike = {
  status: "active" | "inactive" | "expired";
  provider: string;
  providerPaymentId?: string | null;
  changedBy?: string | null;
};

type TelegramBotStatus = "unknown" | "active" | "blocked";

type AdminClientName = {
  displayName?: string | null | undefined;
  firstName?: string | null | undefined;
  username?: string | null | undefined;
  telegramId?: string | null | undefined;
};

type AdminClientAccess = {
  membershipStatus: "active" | "inactive" | "expired";
  hasRestrictions: boolean;
};

export function getAdminClientDisplayName(user: AdminClientName) {
  return user.displayName || user.firstName || user.username || (user.telegramId ? `ID ${user.telegramId}` : "Пользователь");
}

export function getAdminClientAccessState(user: AdminClientAccess) {
  if (user.hasRestrictions) return { label: "Доступ ограничен", tone: "restricted" } as const;
  if (user.membershipStatus === "active") return { label: "Доступ открыт", tone: "open" } as const;
  return { label: "Доступ закрыт", tone: "closed" } as const;
}

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

export function getTelegramBotStatusLabel(status: TelegramBotStatus) {
  if (status === "active") {
    return "активен";
  }

  if (status === "blocked") {
    return "заблокирован";
  }

  return "неизвестно";
}

export function getTelegramBotStatusTitle(status: TelegramBotStatus) {
  if (status === "active") {
    return "Связь через бота доступна";
  }

  if (status === "blocked") {
    return "Клиент заблокировал бота";
  }

  return "Статус бота неизвестен";
}

export function getTelegramBotStatusHint(status: TelegramBotStatus) {
  if (status === "active") {
    return "Сообщения из админки дойдут клиенту.";
  }

  if (status === "blocked") {
    return "Сообщения из админки не дойдут, пока клиент не запустит бота снова.";
  }

  return "Статус появится после /start или события Telegram.";
}
