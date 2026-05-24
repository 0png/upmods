export interface VisibleWindow {
  start: number;
  end: number;
}

export interface VisibleItem<T> {
  item: T;
  index: number;
}

export interface ViewportState<T> {
  visibleItems: VisibleItem<T>[];
  currentPosition: number;
  totalCount: number;
  hiddenAbove: number;
  hiddenBelow: number;
}

export function getVisibleWindow(
  total: number,
  selectedIndex: number,
  visibleCount: number,
): VisibleWindow {
  if (total <= 0 || visibleCount <= 0) {
    return { start: 0, end: 0 };
  }

  const clampedVisibleCount = Math.min(visibleCount, total);
  const clampedIndex = Math.max(0, Math.min(selectedIndex, total - 1));
  const half = Math.floor(clampedVisibleCount / 2);
  const start = Math.max(
    0,
    Math.min(clampedIndex - half, total - clampedVisibleCount),
  );

  return {
    start,
    end: start + clampedVisibleCount,
  };
}

export function getVisibleItems<T>(
  items: T[],
  selectedIndex: number,
  visibleCount: number,
): VisibleItem<T>[] {
  const { start, end } = getVisibleWindow(items.length, selectedIndex, visibleCount);

  return items.slice(start, end).map((item, offset) => ({
    item,
    index: start + offset,
  }));
}

export function getViewportState<T>(
  items: T[],
  selectedIndex: number,
  visibleCount: number,
): ViewportState<T> {
  const visibleItems = getVisibleItems(items, selectedIndex, visibleCount);
  const totalCount = items.length;
  const currentPosition = totalCount === 0
    ? 0
    : Math.max(0, Math.min(selectedIndex, totalCount - 1)) + 1;
  const hiddenAbove = visibleItems.length > 0 ? visibleItems[0].index : 0;
  const hiddenBelow = visibleItems.length > 0
    ? totalCount - visibleItems[visibleItems.length - 1].index - 1
    : 0;

  return {
    visibleItems,
    currentPosition,
    totalCount,
    hiddenAbove,
    hiddenBelow,
  };
}

export function formatListNumber(index: number, totalCount: number): string {
  const width = Math.max(2, String(Math.max(totalCount, 0)).length);
  return `${String(index + 1).padStart(width, '0')}.`;
}
