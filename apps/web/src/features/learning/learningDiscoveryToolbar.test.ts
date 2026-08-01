import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import LearningDiscoveryToolbar from "./LearningDiscoveryToolbar.vue";

afterEach(cleanup);

describe("LearningDiscoveryToolbar", () => {
  it("emits search and filter changes", async () => {
    const view = render(LearningDiscoveryToolbar, { props: { query: "", filter: "all" } });

    const input = screen.getByRole("searchbox", { name: "Найти модуль или урок" });
    await fireEvent.update(input, "дыхание");
    await fireEvent.click(screen.getByRole("button", { name: "Избранное" }));

    expect(view.emitted()["update:query"]?.[0]).toEqual(["дыхание"]);
    expect(view.emitted()["update:filter"]?.[0]).toEqual(["favorites"]);
  });

  it("marks the current filter accessibly and offers reset", async () => {
    const view = render(LearningDiscoveryToolbar, { props: { query: "сон", filter: "completed" } });
    expect(screen.getByRole("button", { name: "Пройдено" }).getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
    expect(view.emitted().reset).toHaveLength(1);
  });
});
