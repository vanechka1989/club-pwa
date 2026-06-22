import { render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import App from "./App.vue";

describe("App", () => {
  it("renders the club shell", () => {
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("button", { name: "Клуб" })).toBeTruthy();
  });
});
