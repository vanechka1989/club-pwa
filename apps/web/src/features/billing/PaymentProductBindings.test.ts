import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import PaymentProductBindings from "./PaymentProductBindings.vue";

describe("PaymentProductBindings", () => {
  it("selects exactly one payment provider", async () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "recurrent",
        modelValue: [
          { provider: "prodamus", enabled: true, externalProductId: "subscription-1", externalOfferId: null },
          { provider: "lava", enabled: false, externalProductId: null, externalOfferId: null }
        ],
        lavaCatalog: [
          {
            id: "item-1",
            externalProductId: "product-1",
            externalOfferId: "offer-1",
            title: "Lava 30 дней",
            kind: "recurrent",
            amountRub: 990,
            isStale: false,
            isSelectable: true,
            syncedAt: "2026-07-25T10:00:00.000Z"
          }
        ]
      }
    });

    await fireEvent.click(screen.getByRole("radio", { name: /Lava/i }));
    const updates = view.emitted("update:modelValue") as unknown[][] | undefined;
    expect(updates?.at(-1)?.[0]).toEqual([
      {
        provider: "prodamus",
        enabled: false,
        externalProductId: "subscription-1",
        externalOfferId: null
      },
      {
        provider: "lava",
        enabled: true,
        externalProductId: null,
        externalOfferId: null
      }
    ]);
  });

  it("shows only Lava items allowed for new tariffs", async () => {
    render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null },
          { provider: "lava", enabled: true, externalProductId: null, externalOfferId: null }
        ],
        lavaCatalog: [
          {
            id: "visible-item",
            externalProductId: "visible-product",
            externalOfferId: "visible-offer",
            title: "Доступный товар",
            kind: "one_time",
            amountRub: 500,
            isStale: false,
            isSelectable: true,
            syncedAt: "2026-07-25T10:00:00.000Z"
          },
          {
            id: "hidden-item",
            externalProductId: "hidden-product",
            externalOfferId: "hidden-offer",
            title: "Скрытый товар",
            kind: "one_time",
            amountRub: 700,
            isStale: false,
            isSelectable: false,
            syncedAt: "2026-07-25T10:00:00.000Z"
          }
        ]
      }
    });

    expect(screen.getByRole("option", { name: /Доступный товар/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Скрытый товар/ })).toBeNull();
  });

  it("normalizes old tariffs that had two providers enabled", () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        modelValue: [
          { provider: "prodamus", enabled: true, externalProductId: null, externalOfferId: null },
          { provider: "lava", enabled: true, externalProductId: "product", externalOfferId: "offer" }
        ],
        lavaCatalog: []
      }
    });

    const updates = view.emitted("update:modelValue") as unknown[][] | undefined;
    expect(updates?.at(-1)?.[0]).toEqual([
      { provider: "prodamus", enabled: true, externalProductId: null, externalOfferId: null },
      { provider: "lava", enabled: false, externalProductId: "product", externalOfferId: "offer" }
    ]);
  });

  it("reports the selected Lava catalog item to the tariff form", async () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null },
          { provider: "lava", enabled: true, externalProductId: null, externalOfferId: null }
        ],
        lavaCatalog: [{
          id: "catalog-1",
          externalProductId: "product-1",
          externalOfferId: "offer-1",
          title: "Доступ в PWA CLUB",
          kind: "one_time",
          amountRub: 100,
          periodicity: null,
          isStale: false,
          isSelectable: true,
          syncedAt: "2026-07-26T00:00:00.000Z"
        }]
      }
    });

    const catalogSelect = view.container.querySelector('select[aria-label="Предложение Lava"]');
    expect(catalogSelect).toBeTruthy();
    await fireEvent.update(catalogSelect!, "catalog-1");

    const selectedEvents = view.emitted("lava-item-selected") as unknown[][] | undefined;
    expect(selectedEvents?.[0]?.[0]).toEqual(
      expect.objectContaining({ id: "catalog-1", title: "Доступ в PWA CLUB", amountRub: 100 })
    );
  });
});
