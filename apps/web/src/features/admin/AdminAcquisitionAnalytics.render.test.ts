import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import AdminAcquisitionAnalytics from "./AdminAcquisitionAnalytics.vue";

describe("AdminAcquisitionAnalytics demo sources", () => {
  afterEach(cleanup);

  it("shows a color-matched donut and four to eight generated channels", async () => {
    render(AdminAcquisitionAnalytics, {
      props: { demoSeed: 12_345, from: "2026-07-05", to: "2026-08-03" }
    });

    expect(await screen.findByRole("img", { name: /Распределение клиентов по рекламным каналам/ })).toBeTruthy();
    const rows = document.querySelectorAll(".acquisition-source-row");
    const segments = document.querySelectorAll(".acquisition-source-chart .admin-finance-donut-segment");
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(segments).toHaveLength(rows.length);
    rows.forEach((row, index) => {
      expect(row.querySelector(`.is-segment-${index}`)).toBeTruthy();
    });

    await fireEvent.click(screen.getByRole("button", { name: /Метки и ссылки/ }));
    expect(await screen.findAllByText(/Демо-канал:/)).toHaveLength(rows.length);
  });
});
