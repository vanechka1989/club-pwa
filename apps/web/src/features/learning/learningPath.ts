export type LessonProgressState = "not_started" | "in_progress" | "completed";

export type LearningPathLesson = { id: string; moduleId: string };
export type LearningPathModule = { id: string; lessons: LearningPathLesson[] };

export function getLessonProgressState(
  lessonId: string,
  startedIds: ReadonlySet<string>,
  completedIds: ReadonlySet<string>
): LessonProgressState {
  if (completedIds.has(lessonId)) return "completed";
  if (startedIds.has(lessonId)) return "in_progress";
  return "not_started";
}

export function getModuleProgress(lessonIds: string[], completedIds: ReadonlySet<string>) {
  const total = lessonIds.length;
  const completed = lessonIds.filter((id) => completedIds.has(id)).length;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function resolveLessonNeighbors(modules: LearningPathModule[], lessonId: string) {
  const lessons = modules.flatMap((module) => module.lessons);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  return {
    previous: lessons[index - 1] ?? null,
    next: lessons[index + 1] ?? null
  };
}
