import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import LavaProviderTabs from "./LavaProviderTabs.vue";

describe("LavaProviderTabs", () => {
  afterEach(cleanup);

  it("locks verification and catalog tools until Lava is connected", async () => {
    const { emitted } = render(LavaProviderTabs, {
      props: { modelValue: "connection", catalogEnabled: false }
    });

    const catalogTab = screen.getByRole("tab", { name: "Проверка и товары" });
    expect(catalogTab.hasAttribute("disabled")).toBe(true);
    await fireEvent.click(catalogTab);
    expect(emitted()["update:modelValue"]).toBeUndefined();
  });

  it("allows opening catalog tools after Lava is connected", async () => {
    const { emitted } = render(LavaProviderTabs, {
      props: { modelValue: "connection", catalogEnabled: true }
    });

    await fireEvent.click(screen.getByRole("tab", { name: "Проверка и товары" }));
    expect(emitted()["update:modelValue"]).toEqual([["catalog"]]);
  });
});
