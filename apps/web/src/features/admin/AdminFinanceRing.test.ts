import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import AdminFinanceRing from "./AdminFinanceRing.vue";

describe("AdminFinanceRing", () => {
  afterEach(cleanup);

  it("shows an exact accessible value and draws the requested proportion", () => {
    const { container } = render(AdminFinanceRing, {
      props: {
        percent: 64.9,
        value: "64,9%",
        label: "Активны сейчас",
        caption: "179 клиентов",
        tone: "success"
      }
    });

    expect(screen.getByRole("img", { name: "Активны сейчас: 64,9%. 179 клиентов" })).toBeTruthy();
    expect(screen.getByText("64,9%")).toBeTruthy();
    expect(screen.getByText("Активны сейчас")).toBeTruthy();
    expect(screen.getByText("179 клиентов")).toBeTruthy();
    expect(container.querySelector(".admin-finance-ring-progress")?.getAttribute("stroke-dashoffset")).toBe("35.1");
  });

  it("clamps invalid percentages to a valid circle", async () => {
    const { container, rerender } = render(AdminFinanceRing, {
      props: { percent: 140, value: "140%", label: "Тест" }
    });

    expect(container.querySelector(".admin-finance-ring-progress")?.getAttribute("stroke-dashoffset")).toBe("0");
    await rerender({ percent: -12, value: "−12%", label: "Тест" });
    expect(container.querySelector(".admin-finance-ring-progress")?.getAttribute("stroke-dashoffset")).toBe("100");
  });
});
