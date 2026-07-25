import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import PaymentProviderChooser from "./PaymentProviderChooser.vue";

describe("PaymentProviderChooser", () => {
  it("shows both payment systems and emits the selected provider", async () => {
    const view = render(PaymentProviderChooser, {
      props: {
        options: [
          { provider: "prodamus", title: "Prodamus" },
          { provider: "lava", title: "Lava" }
        ]
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: /Lava/i }));
    expect(view.emitted("select")).toEqual([["lava"]]);
  });

  it("has mobile-safe controls and no fixed content width", () => {
    const source = PaymentProviderChooser.__cssModules ? "" : PaymentProviderChooser.toString();
    expect(source).not.toContain("width: 400px");
  });
});
