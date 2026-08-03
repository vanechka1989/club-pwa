import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import AdminFinanceDonut from "./AdminFinanceDonut.vue";

describe("AdminFinanceDonut", () => {
  afterEach(cleanup);

  it("draws one composition ring and omits zero-value segments", () => {
    const { container } = render(AdminFinanceDonut, {
      props: {
        value: "42 000 ₽",
        label: "Выручка",
        accessibleLabel: "Распределение выручки: Lava 71,4%, Prodamus 28,6%",
        segments: [
          { label: "Lava", percent: 71.4 },
          { label: "Другие", percent: 0 },
          { label: "Prodamus", percent: 28.6 }
        ]
      }
    });

    expect(screen.getByRole("img", { name: "Распределение выручки: Lava 71,4%, Prodamus 28,6%" })).toBeTruthy();
    expect(container.querySelectorAll(".admin-finance-donut-segment")).toHaveLength(2);
    expect(container.querySelectorAll(".admin-finance-donut-segment")[0]?.getAttribute("stroke-dasharray")).toBe("71.4 28.6");
    expect(container.querySelectorAll(".admin-finance-donut-segment")[1]?.getAttribute("stroke-dashoffset")).toBe("-71.4");
    expect(container.querySelectorAll(".admin-finance-donut-segment")[1]?.classList.contains("is-segment-2")).toBe(true);
  });
});
