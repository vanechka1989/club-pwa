import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "PaymentProductBindings.vue"), "utf8");

describe("payment binding currency layout", () => {
  it("keeps compact checkboxes and unbroken currency codes on narrow phones", () => {
    expect(source).toContain("input:not([type=radio]):not([type=checkbox])");
    expect(source).toContain(".product-binding__currency-toggle input{width:20px;height:20px;min-height:20px");
    expect(source).toContain(".product-binding__currency-code{white-space:nowrap");
    expect(source).not.toContain("@media(max-width:340px){.product-binding__currency-row{grid-template-columns:1fr}");
  });
});
