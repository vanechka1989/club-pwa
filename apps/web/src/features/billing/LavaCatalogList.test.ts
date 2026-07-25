import { fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/vue";
import LavaCatalogList from "./LavaCatalogList.vue";

afterEach(cleanup);

describe("LavaCatalogList", () => {
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
});
