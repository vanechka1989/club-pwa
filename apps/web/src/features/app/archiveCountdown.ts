const dayMs = 24 * 60 * 60 * 1000;

export function formatArchiveDeletionLabel(value: string | null | undefined, now = new Date()) {
  if (!value) {
    return "Дата удаления не указана";
  }

  const deletionDate = new Date(value);
  if (Number.isNaN(deletionDate.getTime())) {
    return "Дата удаления не указана";
  }

  const dateLabel = deletionDate.toLocaleDateString("ru-RU");
  const remainingMs = deletionDate.getTime() - now.getTime();
  if (remainingMs <= dayMs) {
    return `Удалится сегодня · до ${dateLabel}`;
  }

  return `Будет удалено через ${Math.ceil(remainingMs / dayMs)} дн. · до ${dateLabel}`;
}
