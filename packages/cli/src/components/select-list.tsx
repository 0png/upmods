import React from 'react';
import { Box } from 'ink';

interface SelectListProps<T> {
  items: T[];
  selectedIndex: number;
  visibleCount?: number;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
}

export function SelectList<T>({
  items,
  selectedIndex,
  visibleCount = 10,
  renderItem,
}: SelectListProps<T>) {
  const total = items.length;
  const half = Math.floor(visibleCount / 2);
  const scrollOffset = Math.max(
    0,
    Math.min(selectedIndex - half, total - visibleCount),
  );
  const visibleItems = items.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, idx) => {
        const globalIdx = scrollOffset + idx;
        return (
          <Box key={globalIdx}>{renderItem(item, globalIdx === selectedIndex)}</Box>
        );
      })}
    </Box>
  );
}
