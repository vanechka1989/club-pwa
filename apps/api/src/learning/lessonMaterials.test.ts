import { describe, expect, it } from "vitest";
import { getInternalLessonMaterialTitle } from "./lessonMaterials";

describe("getInternalLessonMaterialTitle", () => {
  it("keeps an existing internal title for compatibility", () => {
    expect(getInternalLessonMaterialTitle("photo", "Старая подпись", 0)).toBe("Старая подпись");
  });

  it("generates a stable internal title when the editor omits it", () => {
    expect(getInternalLessonMaterialTitle("photo", "", 0)).toBe("Фото 1");
    expect(getInternalLessonMaterialTitle("audio", undefined, 2)).toBe("Аудио 3");
  });
});
