import React from 'react';
import { Box } from 'ink';
import { getVisibleItems } from '../utils/viewport.js';

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
  const visibleItems = getVisibleItems(items, selectedIndex, visibleCount);

  return (
    <Box flexDirection="column">
      {visibleItems.map(({ item, index }) => {
        return (
          <Box key={index}>{renderItem(item, index === selectedIndex)}</Box>
        );
      })}
    </Box>
  );
}
