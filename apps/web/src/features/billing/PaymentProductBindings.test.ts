import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import PaymentProductBindings from "./PaymentProductBindings.vue";

describe("PaymentProductBindings", () => {
  it("allows Prodamus and Lava to be enabled together", async () => {
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
            syncedAt: "2026-07-25T10:00:00.000Z"
          }
        ]
      }
    });

    await fireEvent.click(screen.getByRole("checkbox", { name: /Lava/i }));
    const updates = view.emitted("update:modelValue") as unknown[][] | undefined;
    expect(updates?.at(-1)?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "lava", enabled: true })])
    );
  });
});
