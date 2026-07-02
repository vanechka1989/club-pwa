export type SortableItem = {
  id: string;
};

export type SortDirection = "up" | "down";

export function moveItemByDirection<T extends SortableItem>(items: T[], id: string, direction: SortDirection) {
  const currentIndex = items.findIndex((item) => item.id === id);
  if (currentIndex < 0) {
    return items;
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  return moveItemToIndex(items, id, nextIndex);
}

export function moveItemToIndex<T extends SortableItem>(items: T[], id: string, targetIndex: number) {
  const currentIndex = items.findIndex((item) => item.id === id);
  if (currentIndex < 0) {
    return items;
  }

  const boundedTargetIndex = Math.min(Math.max(targetIndex, 0), items.length - 1);
  if (currentIndex === boundedTargetIndex) {
    return items;
  }

  const nextItems = items.slice();
  const [item] = nextItems.splice(currentIndex, 1);
  if (!item) {
    return items;
  }

  nextItems.splice(boundedTargetIndex, 0, item);
  return nextItems;
}
