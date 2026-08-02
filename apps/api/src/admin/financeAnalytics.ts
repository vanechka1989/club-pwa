import type {
  AdminFinanceAnalyticsResponse,
  MembershipStatus,
  PaymentCurrency,
  PaymentOrderStatus,
  PaymentProductKind,
  PaymentProviderCode
} from "@club/shared";

export type AdminFinanceOrder = {
  id: string;
  userId: string;
  provider: PaymentProviderCode;
  productId: string | null;
  productTitle: string;
  productKind: PaymentProductKind;
  status: PaymentOrderStatus;
  currency: PaymentCurrency;
  amountMinor: number;
  amountRub: number | null;
  paidAt: Date | null;
  createdAt: Date;
};

export type AdminFinanceMembership = {
  userId: string;
  status: MembershipStatus;
  expiresAt: Date | null;
};

type FinanceAnalyticsInput = {
  orders: AdminFinanceOrder[];
  memberships: AdminFinanceMembership[];
  from?: Date;
  to?: Date;
  now?: Date;
};

export function parseAdminFinanceRange(fromValue?: string, toValue?: string) {
  if (!fromValue && !toValue) return {};
  if (!fromValue || !toValue || !/^\d{4}-\d{2}-\d{2}$/.test(fromValue) || !/^\d{4}-\d{2}-\d{2}$/.test(toValue)) {
    throw new Error("Invalid finance analytics date range");
  }
  const from = new Date(`${fromValue}T00:00:00.000Z`);
  const to = new Date(`${toValue}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.toISOString().slice(0, 10) !== fromValue || to.toISOString().slice(0, 10) !== toValue || from > to) {
    throw new Error("Invalid finance analytics date range");
  }
  return { from, to };
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 1_000) / 10 : 0;
}

function orderDate(order: AdminFinanceOrder) {
  return order.paidAt ?? order.createdAt;
}

function inRange(order: AdminFinanceOrder, from?: Date, to?: Date) {
  const date = orderDate(order);
  return (!from || date >= from) && (!to || date <= to);
}

function rubAmount(order: AdminFinanceOrder) {
  if (order.currency === "RUB") return order.amountMinor / 100;
  return order.amountRub ?? 0;
}

function providerTitle(provider: PaymentProviderCode) {
  return provider === "lava" ? "Lava" : "Prodamus";
}

function groupRetention(
  clients: Array<{ active: boolean; latest: AdminFinanceOrder }>,
  keyOf: (client: { latest: AdminFinanceOrder }) => string,
  titleOf: (client: { latest: AdminFinanceOrder }) => string
): AdminFinanceAnalyticsResponse["retention"]["byProviders"] {
  const groups = new Map<string, { title: string; totalCustomers: number; activeCustomers: number }>();
  for (const client of clients) {
    const key = keyOf(client);
    const group = groups.get(key) ?? { title: titleOf(client), totalCustomers: 0, activeCustomers: 0 };
    group.totalCustomers += 1;
    if (client.active) group.activeCustomers += 1;
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => {
    const churnedCustomers = group.totalCustomers - group.activeCustomers;
    return {
      key,
      title: group.title,
      totalCustomers: group.totalCustomers,
      activeCustomers: group.activeCustomers,
      churnedCustomers,
      churnedPercent: percent(churnedCustomers, group.totalCustomers)
    };
  }).sort((left, right) => right.churnedPercent - left.churnedPercent || right.churnedCustomers - left.churnedCustomers || left.title.localeCompare(right.title, "ru"));
}

export function buildAdminFinanceAnalytics(input: FinanceAnalyticsInput): AdminFinanceAnalyticsResponse {
  const now = input.now ?? new Date();
  const periodOrders = input.orders.filter((order) => inRange(order, input.from, input.to));
  const paidPeriodOrders = periodOrders.filter((order) => order.status === "paid");
  const periodRevenue = paidPeriodOrders.reduce((sum, order) => sum + rubAmount(order), 0);
  const revenueRub = Math.round(periodRevenue);
  const paidCustomers = new Set(paidPeriodOrders.map((order) => order.userId));

  const providers = (["prodamus", "lava"] as const).flatMap((provider) => {
    const attempts = periodOrders.filter((order) => order.provider === provider);
    if (!attempts.length) return [];
    const paid = attempts.filter((order) => order.status === "paid");
    const providerRevenue = Math.round(paid.reduce((sum, order) => sum + rubAmount(order), 0));
    return [{
      provider,
      title: providerTitle(provider),
      attempts: attempts.length,
      paidOrders: paid.length,
      uniqueCustomers: new Set(paid.map((order) => order.userId)).size,
      revenueRub: providerRevenue,
      averagePaidOrderRub: paid.length ? Math.round(providerRevenue / paid.length) : 0,
      revenuePercent: percent(providerRevenue, revenueRub),
      successPercent: percent(paid.length, attempts.length)
    }];
  }).sort((left, right) => right.revenueRub - left.revenueRub || left.title.localeCompare(right.title, "ru"));

  const productGroups = new Map<string, {
    productId: string | null;
    title: string;
    kind: PaymentProductKind;
    orders: AdminFinanceOrder[];
  }>();
  for (const order of paidPeriodOrders) {
    const key = order.productId ?? `individual:${order.productKind}:${order.productTitle}`;
    const group = productGroups.get(key) ?? { productId: order.productId, title: order.productTitle, kind: order.productKind, orders: [] };
    group.orders.push(order);
    productGroups.set(key, group);
  }
  const products = Array.from(productGroups.values(), (group) => {
    const productRevenue = Math.round(group.orders.reduce((sum, order) => sum + rubAmount(order), 0));
    return {
      productId: group.productId,
      title: group.title,
      kind: group.kind,
      paidOrders: group.orders.length,
      uniqueCustomers: new Set(group.orders.map((order) => order.userId)).size,
      revenueRub: productRevenue,
      averagePaidOrderRub: group.orders.length ? Math.round(productRevenue / group.orders.length) : 0,
      revenuePercent: percent(productRevenue, revenueRub)
    };
  }).sort((left, right) => right.revenueRub - left.revenueRub || left.title.localeCompare(right.title, "ru"));

  const allPaidOrders = input.orders
    .filter((order) => order.status === "paid")
    .sort((left, right) => orderDate(left).getTime() - orderDate(right).getTime());
  const paidByUser = new Map<string, AdminFinanceOrder[]>();
  for (const order of allPaidOrders) {
    const rows = paidByUser.get(order.userId) ?? [];
    rows.push(order);
    paidByUser.set(order.userId, rows);
  }
  const activeUserIds = new Set(input.memberships
    .filter((membership) => membership.status === "active" && (!membership.expiresAt || membership.expiresAt > now))
    .map((membership) => membership.userId));
  const clients = Array.from(paidByUser, ([userId, orders]) => ({
    active: activeUserIds.has(userId),
    orders,
    latest: orders.at(-1)!
  }));
  const churned = clients.filter((client) => !client.active);
  const onePurchaseChurned = churned.filter((client) => client.orders.length === 1).length;
  const repeatedChurned = churned.filter((client) => client.orders.length > 1);
  const stageCounts = new Map<number, number>();
  for (const client of repeatedChurned) {
    const renewals = Math.min(4, client.orders.length - 1);
    stageCounts.set(renewals, (stageCounts.get(renewals) ?? 0) + 1);
  }
  const activeCustomers = clients.filter((client) => client.active).length;
  const churnedCustomers = churned.length;

  return {
    overview: {
      revenueRub,
      paidOrders: paidPeriodOrders.length,
      totalAttempts: periodOrders.length,
      uniqueCustomers: paidCustomers.size,
      averagePaidOrderRub: paidPeriodOrders.length ? Math.round(revenueRub / paidPeriodOrders.length) : 0,
      successPercent: percent(paidPeriodOrders.length, periodOrders.length)
    },
    providers,
    products,
    retention: {
      totalPayingCustomers: clients.length,
      activeCustomers,
      activePercent: percent(activeCustomers, clients.length),
      churnedCustomers,
      churnedPercent: percent(churnedCustomers, clients.length),
      onePurchaseChurned,
      onePurchaseChurnedPercent: percent(onePurchaseChurned, churnedCustomers),
      repeatPurchaseChurned: repeatedChurned.length,
      repeatPurchaseChurnedPercent: percent(repeatedChurned.length, churnedCustomers),
      exitStages: Array.from(stageCounts, ([renewals, customers]) => ({
        renewals,
        label: renewals >= 4 ? "После 4+ продлений" : `После ${renewals} ${renewals === 1 ? "продления" : "продлений"}`,
        customers,
        percentOfRepeatChurned: percent(customers, repeatedChurned.length)
      })).sort((left, right) => left.renewals - right.renewals),
      byProviders: groupRetention(clients, (client) => client.latest.provider, (client) => providerTitle(client.latest.provider)),
      byProducts: groupRetention(
        clients,
        (client) => client.latest.productId ?? `individual:${client.latest.productKind}:${client.latest.productTitle}`,
        (client) => client.latest.productTitle
      )
    }
  };
}
