import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps the card bookmark away from the lesson title", () => {
    const styles = readFileSync(resolve(__dirname, "learningRoute.css"), "utf8");
    expect(styles).toMatch(/\.lesson-card-favorite\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*8px;/s);
  });
});
