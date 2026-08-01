import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import LearningFavoriteButton from "./LearningFavoriteButton.vue";

afterEach(cleanup);

describe("LearningFavoriteButton", () => {
  it("announces state and emits toggle", async () => {
    const view = render(LearningFavoriteButton, { props: { active: true, pending: false } });
    const button = screen.getByRole("button", { name: "Убрать из избранного" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("В избранном")).toBeTruthy();
    await fireEvent.click(button);
    expect(view.emitted().toggle).toHaveLength(1);
  });

  it("renders an icon-only compact pending control", () => {
    render(LearningFavoriteButton, { props: { active: false, pending: true, compact: true } });
    const button = screen.getByRole("button", { name: "Добавить в избранное" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("В избранное")).toBeNull();
  });
});
