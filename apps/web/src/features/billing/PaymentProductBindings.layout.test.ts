import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "PaymentProductBindings.vue"), "utf8");

describe("payment binding currency layout", () => {
  it("stacks each currency price control on narrow phones without a fixed width", () => {
    expect(source).toContain(".product-binding__currency-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(5.5rem,auto)");
    expect(source).toContain("@media(max-width:340px){.product-binding__currency-row{grid-template-columns:1fr}");
    expect(source).toContain(".product-binding input:not([type=radio]),.product-binding select{width:100%;min-width:0");
  });
});
