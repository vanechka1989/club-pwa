import { describe, expect, it } from "vitest";
import { resolveCheckoutProvider } from "./checkoutProvider";

const bindings = [
  { provider: "prodamus" as const, title: "Prodamus", enabled: true },
  { provider: "lava" as const, title: "Lava", enabled: true }
];

describe("checkout provider selection", () => {
  it("uses the only enabled provider directly", () => {
    expect(resolveCheckoutProvider([bindings[0]!], undefined)).toEqual({
      kind: "selected",
      provider: "prodamus"
    });
  });

  it("asks the client to choose when both providers are enabled", () => {
    expect(resolveCheckoutProvider(bindings, undefined)).toEqual({
      kind: "choice",
      options: [
        { provider: "prodamus", title: "Prodamus" },
        { provider: "lava", title: "Lava" }
      ]
    });
  });

  it("accepts an enabled explicit provider and rejects other values", () => {
    expect(resolveCheckoutProvider(bindings, "lava")).toEqual({ kind: "selected", provider: "lava" });
    expect(resolveCheckoutProvider([bindings[0]!], "lava")).toEqual({ kind: "unavailable" });
  });
});
