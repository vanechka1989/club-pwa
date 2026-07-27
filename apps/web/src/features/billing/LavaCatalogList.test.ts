import { fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/vue";
import LavaCatalogList from "./LavaCatalogList.vue";

afterEach(cleanup);

describe("LavaCatalogList", () => {
  it("shows every Lava price with cents and names a dynamic price by currency", () => {
    render(LavaCatalogList, {
      props: {
        items: [{
          id: "currencies",
          externalProductId: "product-1",
          externalOfferId: "offer-1",
          title: "Мультивалютный доступ",
          kind: "one_time",
          amountRub: 990,
          prices: [
            { currency: "RUB", amountMinor: 99050, periodicity: null },
            { currency: "USD", amountMinor: 1999, periodicity: null },
            { currency: "EUR", amountMinor: null, periodicity: null }
          ],
          isStale: false,
          isSelectable: true,
          syncedAt: "2026-07-27T10:00:00.000Z"
        }],
        busyId: null
      }
    });

    expect(screen.getByText(/990,50.*₽/)).toBeTruthy();
    expect(screen.getByText(/19,99.*\$/)).toBeTruthy();
    expect(screen.getByText(/EUR.*цена в Lava/i)).toBeTruthy();
  });

  it("shows synced Lava products and changes their availability for tariffs", async () => {
    const view = render(LavaCatalogList, {
      props: {
        items: [
          {
            id: "one-time",
            externalProductId: "product-1",
            externalOfferId: "offer-1",
            title: "Разовая оплата",
            kind: "one_time",
            amountRub: 500,
            isStale: false,
            isSelectable: true,
            syncedAt: "2026-07-25T10:00:00.000Z"
          },
          {
            id: "subscription",
            externalProductId: "product-2",
            externalOfferId: "offer-2",
            title: "Подписка",
            kind: "recurrent",
            amountRub: 990,
            isStale: false,
            isSelectable: false,
            syncedAt: "2026-07-25T10:00:00.000Z"
          }
        ],
        busyId: null
      }
    });

    expect(screen.getByText("Разовая оплата")).toBeTruthy();
    expect(screen.getByText("Подписка")).toBeTruthy();
    await fireEvent.click(screen.getByRole("checkbox", { name: "Показывать «Подписка» при создании тарифа" }));

    const changes = view.emitted("change") as unknown[][] | undefined;
    expect(changes?.at(-1)?.[0]).toEqual({
      id: "subscription",
      isSelectable: true
    });
  });

  it("groups recurrent prices by their labelled subscription period", () => {
    render(LavaCatalogList, {
      props: {
        items: [{
          id: "periods",
          externalProductId: "product-periods",
          externalOfferId: "offer-periods",
          title: "Доступ по периодам",
          kind: "recurrent",
          amountRub: 100,
          periodicity: "MONTHLY",
          prices: [
            { currency: "RUB", amountMinor: 10000, periodicity: "MONTHLY" },
            { currency: "USD", amountMinor: 500, periodicity: "MONTHLY" },
            { currency: "RUB", amountMinor: 60000, periodicity: "PERIOD_180_DAYS" },
            { currency: "USD", amountMinor: 3000, periodicity: "PERIOD_180_DAYS" }
          ],
          isStale: false,
          isSelectable: true,
          syncedAt: "2026-07-27T10:00:00.000Z"
        }],
        busyId: null
      }
    });

    expect(screen.getByText("1 месяц")).toBeTruthy();
    expect(screen.getByText("6 месяцев")).toBeTruthy();
    expect(screen.getByText(/100,00.*₽.*5,00.*\$/)).toBeTruthy();
    expect(screen.getByText(/600,00.*₽.*30,00.*\$/)).toBeTruthy();
  });
});
