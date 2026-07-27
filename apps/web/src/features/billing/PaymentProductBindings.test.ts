import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import PaymentProductBindings from "./PaymentProductBindings.vue";

afterEach(cleanup);

describe("PaymentProductBindings", () => {
  it("defaults a selected fixed Lava offer to all of its fixed currencies", async () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] },
          { provider: "lava", enabled: true, externalProductId: null, externalOfferId: null, prices: [] }
        ],
        lavaCatalog: [{
          id: "catalog-1", externalProductId: "product-1", externalOfferId: "offer-1", title: "Доступ", kind: "one_time", amountRub: 990,
          prices: [
            { currency: "RUB", amountMinor: 99050, periodicity: null },
            { currency: "USD", amountMinor: 1999, periodicity: null },
            { currency: "EUR", amountMinor: null, periodicity: null }
          ],
          isStale: false, isSelectable: true, syncedAt: "2026-07-27T10:00:00.000Z"
        }]
      }
    });

    await fireEvent.update(screen.getByRole("combobox", { name: "Предложение Lava" }), "catalog-1");
    const binding = (view.emitted("update:modelValue") as unknown[][]).at(-1)?.[0] as Array<{ provider: string; prices: unknown[] }>;
    expect(binding.find((entry) => entry.provider === "lava")?.prices).toEqual([
      { currency: "RUB", amountMinor: 99050, isEnabled: true },
      { currency: "USD", amountMinor: 1999, isEnabled: true }
    ]);
  });

  it("renders fixed amounts read-only and requires an amount before a dynamic currency can be selected", () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] },
          { provider: "lava", enabled: true, externalProductId: "product", externalOfferId: "offer", prices: [{ currency: "RUB", amountMinor: 99050, isEnabled: true }] }
        ],
        lavaCatalog: [{
          id: "catalog-1", externalProductId: "product", externalOfferId: "offer", title: "Доступ", kind: "one_time", amountRub: 990,
          prices: [{ currency: "RUB", amountMinor: 99050, periodicity: null }, { currency: "USD", amountMinor: null, periodicity: null }],
          isStale: false, isSelectable: true, syncedAt: "2026-07-27T10:00:00.000Z"
        }]
      }
    });

    expect(screen.getByRole("checkbox", { name: /RUB/ })).toBeTruthy();
    expect(view.container.querySelector("output")?.textContent).toMatch(/990,50.*₽/);
    expect(screen.getByRole("checkbox", { name: /USD/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("spinbutton", { name: /USD/i })).toBeTruthy();
  });

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

  it("shows only prices matching the tariff billing period", () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "recurrent",
        accessDays: 180,
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] },
          { provider: "lava", enabled: true, externalProductId: "product", externalOfferId: "offer", prices: [
            { currency: "RUB", amountMinor: 900000, isEnabled: true },
            { currency: "USD", amountMinor: 12000, isEnabled: true }
          ] }
        ],
        lavaCatalog: [{
          id: "catalog-periods", externalProductId: "product", externalOfferId: "offer", title: "Доступ", kind: "recurrent", amountRub: 1500,
          periodicity: "MONTHLY",
          prices: [
            { currency: "RUB", amountMinor: 150000, periodicity: "MONTHLY" },
            { currency: "USD", amountMinor: 2000, periodicity: "MONTHLY" },
            { currency: "RUB", amountMinor: 900000, periodicity: "PERIOD_180_DAYS" },
            { currency: "USD", amountMinor: 12000, periodicity: "PERIOD_180_DAYS" }
          ],
          isStale: false, isSelectable: true, syncedAt: "2026-07-27T10:00:00.000Z"
        }]
      }
    });

    const amounts = Array.from(view.container.querySelectorAll("output"), (output) => output.textContent);
    expect(amounts).toEqual(expect.arrayContaining([
      expect.stringMatching(/9\s?000,00.*₽/),
      expect.stringMatching(/120,00.*\$/)
    ]));
    expect(amounts).not.toEqual(expect.arrayContaining([expect.stringMatching(/1\s?500,00.*₽/)]));
  });

  it("refreshes fixed amounts while preserving enabled currencies", async () => {
    const modelValue = [
      { provider: "prodamus" as const, enabled: false, externalProductId: null, externalOfferId: null, prices: [] },
      { provider: "lava" as const, enabled: true, externalProductId: "product", externalOfferId: "offer", prices: [
        { currency: "RUB" as const, amountMinor: 150000, isEnabled: true },
        { currency: "USD" as const, amountMinor: 2000, isEnabled: false }
      ] }
    ];
    const catalogItem = {
      id: "catalog", externalProductId: "product", externalOfferId: "offer", title: "Доступ", kind: "recurrent" as const, amountRub: 1500,
      periodicity: "MONTHLY",
      prices: [
        { currency: "RUB" as const, amountMinor: 150000, periodicity: "MONTHLY" },
        { currency: "USD" as const, amountMinor: 2000, periodicity: "MONTHLY" }
      ],
      isStale: false, isSelectable: true, syncedAt: "2026-07-27T10:00:00.000Z"
    };
    const view = render(PaymentProductBindings, {
      props: { kind: "recurrent", accessDays: 30, modelValue, lavaCatalog: [catalogItem] }
    });

    await view.rerender({
      kind: "recurrent",
      accessDays: 30,
      modelValue,
      lavaCatalog: [{
        ...catalogItem,
        syncedAt: "2026-07-27T11:00:00.000Z",
        prices: [
          { currency: "RUB", amountMinor: 160000, periodicity: "MONTHLY" },
          { currency: "USD", amountMinor: 2100, periodicity: "MONTHLY" }
        ]
      }]
    });

    const updates = view.emitted("update:modelValue") as unknown[][];
    const bindings = updates.at(-1)?.[0] as Array<{ provider: string; prices: unknown[] }>;
    expect(bindings.find((entry) => entry.provider === "lava")?.prices).toEqual([
      { currency: "RUB", amountMinor: 160000, isEnabled: true },
      { currency: "USD", amountMinor: 2100, isEnabled: false }
    ]);
  });

  it("does not allow the last enabled Lava currency to be switched off", async () => {
    const view = render(PaymentProductBindings, {
      props: {
        kind: "one_time",
        accessDays: 30,
        modelValue: [
          { provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] },
          { provider: "lava", enabled: true, externalProductId: "product", externalOfferId: "offer", prices: [
            { currency: "RUB", amountMinor: 99000, isEnabled: true }
          ] }
        ],
        lavaCatalog: [{
          id: "catalog", externalProductId: "product", externalOfferId: "offer", title: "Доступ", kind: "one_time", amountRub: 990,
          prices: [{ currency: "RUB", amountMinor: 99000, periodicity: "ONE_TIME" }],
          isStale: false, isSelectable: true, syncedAt: "2026-07-27T10:00:00.000Z"
        }]
      }
    });

    const before = view.emitted("update:modelValue")?.length ?? 0;
    await fireEvent.click(screen.getByRole("checkbox", { name: /RUB/ }));
    expect(view.emitted("update:modelValue")?.length ?? 0).toBe(before);
  });
});
