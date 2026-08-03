import { cleanup, fireEvent, render, screen, within } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminFinanceAnalyticsResponse } from "@club/shared";
import AdminFinanceAnalytics from "./AdminFinanceAnalytics.vue";

const data: AdminFinanceAnalyticsResponse = {
  overview: { revenueRub: 42_000, paidOrders: 12, totalAttempts: 15, uniqueCustomers: 8, averagePaidOrderRub: 3_500, successPercent: 80 },
  providers: [
    { provider: "lava", title: "Lava", attempts: 10, paidOrders: 8, uniqueCustomers: 6, revenueRub: 30_000, averagePaidOrderRub: 3_750, revenuePercent: 71.4, successPercent: 80 },
    { provider: "prodamus", title: "Prodamus", attempts: 5, paidOrders: 4, uniqueCustomers: 2, revenueRub: 12_000, averagePaidOrderRub: 3_000, revenuePercent: 28.6, successPercent: 80 }
  ],
  products: [
    { productId: "pro", title: "Клуб Pro", kind: "recurrent", paidOrders: 8, uniqueCustomers: 6, revenueRub: 30_000, averagePaidOrderRub: 3_750, revenuePercent: 71.4 }
  ],
  retention: {
    totalPayingCustomers: 276, activeCustomers: 179, activePercent: 64.9,
    churnedCustomers: 97, churnedPercent: 35.1,
    onePurchaseChurned: 76, onePurchaseChurnedPercent: 78.4,
    repeatPurchaseChurned: 21, repeatPurchaseChurnedPercent: 21.6,
    exitStages: [
      { renewals: 1, label: "После 1 продления", customers: 17, percentOfRepeatChurned: 81 },
      { renewals: 2, label: "После 2 продлений", customers: 3, percentOfRepeatChurned: 14.3 },
      { renewals: 3, label: "После 3 продлений", customers: 1, percentOfRepeatChurned: 4.8 }
    ],
    byProviders: [{ key: "lava", title: "Lava", totalCustomers: 100, activeCustomers: 70, churnedCustomers: 30, churnedPercent: 30 }],
    byProducts: [{ key: "pro", title: "Клуб Pro", totalCustomers: 100, activeCustomers: 70, churnedCustomers: 30, churnedPercent: 30 }]
  }
};

describe("AdminFinanceAnalytics", () => {
  afterEach(cleanup);

  it("shows payment systems, products and lifetime retention in one dashboard", () => {
    render(AdminFinanceAnalytics, { props: { data, loading: false, error: false } });

    expect(screen.getByRole("heading", { name: "Финансовый пульс" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Успешные оплаты: 80%. 12 из 15 попыток" })).toBeTruthy();
    expect(screen.getAllByText("Активны сейчас").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Не продлили").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ушли после продлений").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Платёжные системы" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Продукты и тарифы" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Удержание клиентов" })).toBeTruthy();
    expect(screen.getByText("За всё время")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Удержание: 64,9%. 179 активны из 276" })).toBeTruthy();
    expect(document.querySelectorAll(".admin-finance-ring")).toHaveLength(2);
    expect(document.querySelectorAll(".admin-finance-donut")).toHaveLength(2);
    expect(screen.getByRole("img", { name: /Распределение выручки по платёжным системам, общая выручка 42\s000 ₽: Lava 71,4%, Prodamus 28,6%/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Распределение выручки по продуктам, общая выручка 42\s000 ₽: Клуб Pro 71,4%/ })).toBeTruthy();
    expect(document.querySelectorAll(".admin-finance-share-bar")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "Структура оттока: купили один раз — 76 клиентов, 78,4%; продлевали, но ушли — 21 клиент, 21,6%" })).toBeTruthy();
    expect(document.querySelectorAll(".admin-finance-churn-composition")).toHaveLength(1);
    expect(document.querySelectorAll(".admin-finance-breakdown-chart")).toHaveLength(2);
    expect(document.querySelectorAll(".admin-finance-breakdown-row")).toHaveLength(2);
    expect(document.querySelectorAll(".admin-finance-churn-row")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-finance-stage-bar")).toHaveLength(3);

    const retention = screen.getByLabelText("Удержание платящих клиентов");
    expect(within(retention).getByText("276")).toBeTruthy();
    expect(within(retention).getByText("179")).toBeTruthy();
    expect(within(retention).getAllByText("64,9%", { exact: true }).length).toBeGreaterThan(0);
    expect(within(retention).getByText("97")).toBeTruthy();
    expect(within(retention).getAllByText("35,1%", { exact: true }).length).toBeGreaterThan(0);
    expect(within(retention).getAllByText("76").length).toBeGreaterThan(0);
    expect(within(retention).getAllByText("21").length).toBeGreaterThan(0);
    expect(within(retention).getByText("После 1 продления")).toBeTruthy();
    expect(screen.getAllByText("Lava").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Клуб Pro").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Отток Клуб Pro: 30%. 30 из 100 клиентов не продлили" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Отток Lava: 30%. 30 из 100 клиентов не продлили" })).toBeTruthy();
  });

  it("keeps every product row by id without repeating payment type badges", () => {
    render(AdminFinanceAnalytics, {
      props: {
        data: {
          ...data,
          products: [
            { productId: "club-one", title: "Клуб", kind: "one_time", paidOrders: 4, uniqueCustomers: 4, revenueRub: 14_000, averagePaidOrderRub: 3_500, revenuePercent: 33.3 },
            { productId: "club-rec", title: "Клуб", kind: "recurrent", paidOrders: 8, uniqueCustomers: 6, revenueRub: 28_000, averagePaidOrderRub: 3_500, revenuePercent: 66.7 }
          ]
        },
        loading: false,
        error: false
      }
    });

    const products = screen.getByRole("region", { name: "Продукты и тарифы" });
    expect(within(products).getAllByText("Клуб", { exact: true })).toHaveLength(2);
    expect(products.querySelectorAll(".admin-finance-share-row")).toHaveLength(2);
    expect(within(products).queryByText("Разовая оплата", { exact: true })).toBeNull();
    expect(within(products).queryByText("Автоподписка", { exact: true })).toBeNull();
  });

  it("shortens million-scale donut totals while keeping exact row amounts", () => {
    render(AdminFinanceAnalytics, {
      props: {
        data: {
          ...data,
          overview: { ...data.overview, revenueRub: 1_250_000 },
          providers: [{ ...data.providers[0]!, revenueRub: 1_250_000 }],
          products: [{ ...data.products[0]!, revenueRub: 1_250_000 }]
        },
        loading: false,
        error: false
      }
    });

    expect(screen.getAllByText("1,25 млн ₽")).toHaveLength(2);
    expect(screen.getAllByText("1 250 000 ₽")).toHaveLength(2);
  });

  it("keeps zero churn compact instead of rendering empty charts", () => {
    render(AdminFinanceAnalytics, {
      props: {
        data: {
          ...data,
          retention: {
            ...data.retention,
            activeCustomers: 276,
            activePercent: 100,
            churnedCustomers: 0,
            churnedPercent: 0,
            onePurchaseChurned: 0,
            onePurchaseChurnedPercent: 0,
            repeatPurchaseChurned: 0,
            repeatPurchaseChurnedPercent: 0
          }
        },
        loading: false,
        error: false
      }
    });

    expect(screen.getByText("Оттока пока нет")).toBeTruthy();
    expect(screen.queryByText("Отток по последнему продукту")).toBeNull();
    expect(screen.queryByText("Отток по платёжной системе")).toBeNull();
    expect(document.querySelectorAll(".admin-finance-ring")).toHaveLength(2);
  });

  it("renders loading and a useful empty state", async () => {
    const view = render(AdminFinanceAnalytics, { props: { data: null, loading: true, error: false } });
    expect(screen.getByText("Собираю финансовую аналитику…")).toBeTruthy();

    await view.rerender({ data: { ...data, providers: [], products: [], retention: { ...data.retention, totalPayingCustomers: 0, activeCustomers: 0, activePercent: 0, churnedCustomers: 0, churnedPercent: 0, onePurchaseChurned: 0, onePurchaseChurnedPercent: 0, repeatPurchaseChurned: 0, repeatPurchaseChurnedPercent: 0, exitStages: [], byProviders: [], byProducts: [] } }, loading: false, error: false });
    expect(screen.getByText("Оплат через подключённые системы за период не было.")).toBeTruthy();
    expect(screen.getByText("Платящих клиентов пока нет.")).toBeTruthy();
  });

  it("offers a retry without hiding the rest of finance", async () => {
    const { emitted } = render(AdminFinanceAnalytics, { props: { data: null, loading: false, error: true } });
    await fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку финансовой аналитики" }));
    expect(emitted().retry).toEqual([[]]);
  });
});
