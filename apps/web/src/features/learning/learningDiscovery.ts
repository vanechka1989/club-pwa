export type LearningDiscoveryFilter = "all" | "favorites" | "in_progress" | "completed";

export type LearningDiscoveryLesson = {
  id: string;
  title: string;
  description: string;
};

export type LearningDiscoveryModule<TLesson extends LearningDiscoveryLesson = LearningDiscoveryLesson> = {
  id: string;
  title: string;
  description: string;
  images: TLesson[];
};

export function normalizeLearningQuery(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function containsQuery(values: string[], query: string) {
  return values.some((value) => normalizeLearningQuery(value).includes(query));
}

function matchesFilter(
  lessonId: string,
  filter: LearningDiscoveryFilter,
  startedIds: ReadonlySet<string>,
  completedIds: ReadonlySet<string>,
  favoriteIds: ReadonlySet<string>
) {
  if (filter === "favorites") return favoriteIds.has(lessonId);
  if (filter === "in_progress") return startedIds.has(lessonId) && !completedIds.has(lessonId);
  if (filter === "completed") return completedIds.has(lessonId);
  return true;
}

export function filterLearningModules<
  TLesson extends LearningDiscoveryLesson,
  TModule extends LearningDiscoveryModule<TLesson>
>(
  modules: TModule[],
  options: {
    query: string;
    filter: LearningDiscoveryFilter;
    startedIds: ReadonlySet<string>;
    completedIds: ReadonlySet<string>;
    favoriteIds: ReadonlySet<string>;
  }
) {
  const query = normalizeLearningQuery(options.query);
  return modules.flatMap((module) => {
    const moduleMatches = Boolean(query) && containsQuery([module.title, module.description], query);
    const images = module.images.filter((lesson) => {
      if (!matchesFilter(lesson.id, options.filter, options.startedIds, options.completedIds, options.favoriteIds)) return false;
      return !query || moduleMatches || containsQuery([lesson.title, lesson.description], query);
    });
    return images.length ? [{ ...module, images }] : [];
  });
}
