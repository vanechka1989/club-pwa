import { describe, expect, it } from "vitest";
import { filterLearningModules, normalizeLearningQuery, type LearningDiscoveryModule } from "./learningDiscovery";

const modules: LearningDiscoveryModule[] = [
  {
    id: "module-body",
    title: "Здоровое тело",
    description: "Практики на каждый день",
    images: [
      { id: "lesson-back", title: "Йога для спины", description: "Мягкая тренировка" },
      { id: "lesson-breath", title: "Дыхание", description: "Снятие напряжения" }
    ]
  },
  {
    id: "module-mind",
    title: "Спокойный ум",
    description: "Медитации",
    images: [{ id: "lesson-sleep", title: "Крепкий сон", description: "Вечерняя практика" }]
  }
];

const emptySets = { startedIds: new Set<string>(), completedIds: new Set<string>(), favoriteIds: new Set<string>() };

describe("learning discovery", () => {
  it("normalizes case and repeated whitespace", () => {
    expect(normalizeLearningQuery("  ЙОГА   ДЛЯ Спины ")).toBe("йога для спины");
  });

  it("keeps only matching lessons when lesson text matches", () => {
    const result = filterLearningModules(modules, { query: "спины", filter: "all", ...emptySets });
    expect(result).toHaveLength(1);
    expect(result[0]?.images.map((item) => item.id)).toEqual(["lesson-back"]);
  });

  it("keeps all lessons when module text matches", () => {
    const result = filterLearningModules(modules, { query: "медитации", filter: "all", ...emptySets });
    expect(result[0]?.images.map((item) => item.id)).toEqual(["lesson-sleep"]);
  });

  it("filters favorites, in-progress and completed lessons", () => {
    expect(filterLearningModules(modules, { query: "", filter: "favorites", ...emptySets, favoriteIds: new Set(["lesson-sleep"]) }).flatMap((module) => module.images).map((item) => item.id)).toEqual(["lesson-sleep"]);
    expect(filterLearningModules(modules, { query: "", filter: "in_progress", ...emptySets, startedIds: new Set(["lesson-back", "lesson-breath"]), completedIds: new Set(["lesson-breath"]) }).flatMap((module) => module.images).map((item) => item.id)).toEqual(["lesson-back"]);
    expect(filterLearningModules(modules, { query: "", filter: "completed", ...emptySets, completedIds: new Set(["lesson-breath"]) }).flatMap((module) => module.images).map((item) => item.id)).toEqual(["lesson-breath"]);
  });
});
