import { describe, expect, it } from "vitest";
import { normalizePollDraft, validatePollSelection } from "./polls";

describe("community polls", () => {
  it("requires a question and two to ten unique options", () => {
    expect(normalizePollDraft({ question: " Выбор? ", options: [" Да ", "Нет"], allowsMultiple: false, isAnonymous: true, closesAt: null }).options).toEqual(["Да", "Нет"]);
    expect(() => normalizePollDraft({ question: "?", options: ["Да", "Да"], allowsMultiple: false, isAnonymous: true, closesAt: null })).toThrow();
    expect(() => normalizePollDraft({ question: "?", options: ["Да"], allowsMultiple: false, isAnonymous: true, closesAt: null })).toThrow();
  });

  it("validates single and multiple selections", () => {
    expect(validatePollSelection(["a"], ["a", "b"], false)).toEqual(["a"]);
    expect(validatePollSelection(["a", "b"], ["a", "b"], true)).toEqual(["a", "b"]);
    expect(() => validatePollSelection(["a", "b"], ["a", "b"], false)).toThrow();
    expect(() => validatePollSelection(["x"], ["a", "b"], true)).toThrow();
  });
});
