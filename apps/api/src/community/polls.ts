export type PollDraft = {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  isAnonymous: boolean;
  closesAt: string | null;
};

export function normalizePollDraft(draft: PollDraft) {
  const question = draft.question.trim();
  const options = draft.options.map((option) => option.trim()).filter(Boolean);
  if (!question || question.length > 500) throw new Error("Введите вопрос опроса.");
  if (options.length < 2 || options.length > 10) throw new Error("Добавьте от 2 до 10 вариантов.");
  if (new Set(options.map((option) => option.toLocaleLowerCase("ru-RU"))).size !== options.length) throw new Error("Варианты не должны повторяться.");
  const closesAt = draft.closesAt ? new Date(draft.closesAt) : null;
  if (closesAt && (Number.isNaN(closesAt.getTime()) || closesAt <= new Date())) throw new Error("Дата завершения должна быть в будущем.");
  return { ...draft, question, options, closesAt };
}

export function validatePollSelection(selected: string[], available: string[], allowsMultiple: boolean) {
  const unique = Array.from(new Set(selected));
  if (unique.length < 1 || (!allowsMultiple && unique.length !== 1)) throw new Error("Выберите допустимое количество вариантов.");
  if (unique.some((id) => !available.includes(id))) throw new Error("Выбран неизвестный вариант.");
  return unique;
}
