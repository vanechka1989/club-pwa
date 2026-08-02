const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function parseUtcDateKey(value: string) {
  if (!dateKeyPattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function utcDateKeys(from: string, to: string) {
  const start = parseUtcDateKey(from);
  const end = parseUtcDateKey(to);
  if (!start || !end || start > end) return [];

  const dates: string[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 24 * 60 * 60 * 1000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}
