import React from 'react';
import { Box, Text, useStdout } from 'ink';

export interface ModRow {
  name: string;
  current: string;
  target: string;
  status: string;
  statusColor?: string;
  selected?: boolean;
  showSelection?: boolean;
}

interface ModTableProps {
  mods: ModRow[];
  showSelection?: boolean;
  cursorIndex?: number;
  maxVisibleRows?: number;
}

function padCell(str: string, width: number): string {
  const truncated = str.length > width ? str.slice(0, Math.max(0, width - 1)) + '\u2026' : str;
  return truncated.padEnd(width);
}

export function ModTable({ mods, showSelection = false, cursorIndex, maxVisibleRows }: ModTableProps) {
  const { stdout } = useStdout();
  const termWidth = (stdout as { columns?: number; rows?: number } | undefined)?.columns ?? 80;
  const termRows = (stdout as { columns?: number; rows?: number } | undefined)?.rows ?? 24;

  // Virtual scrolling: calculate visible slice
  const OVERHEAD = 12; // Banner(5) + Footer(3) + Table borders/header(4)
  const availableRows = termRows - OVERHEAD;
  const visibleCount = maxVisibleRows ?? Math.max(5, availableRows);

  // Centered cursor scroll (from SelectList pattern)
  const total = mods.length;
  const half = Math.floor(visibleCount / 2);
  const scrollOffset = cursorIndex !== undefined
    ? Math.max(0, Math.min(cursorIndex - half, total - visibleCount))
    : 0;

  // Render only visible slice
  const visibleMods = mods.slice(scrollOffset, scrollOffset + visibleCount);

  const statusWidth = 14;
  const reserved = 16;
  const remainder = termWidth - reserved - statusWidth;
  const nameWidth = Math.max(12, Math.floor(remainder * 0.4));
  const versionWidth = Math.floor((remainder - nameWidth) / 2);
  const currentWidth = versionWidth;
  const targetWidth = remainder - nameWidth - versionWidth;

  if (termWidth - reserved < nameWidth + statusWidth + 2) {
    return (
      <Text color="red">
        Terminal too narrow (need ≥80 cols). Please resize and restart.
      </Text>
    );
  }

  const topBorder =
    '┌' + '─'.repeat(nameWidth + 2) +
    '┬' + '─'.repeat(currentWidth + 2) +
    '┬' + '─'.repeat(targetWidth + 2) +
    '┬' + '─'.repeat(statusWidth + 2) + '┐';

  const sepBorder =
    '├' + '─'.repeat(nameWidth + 2) +
    '┼' + '─'.repeat(currentWidth + 2) +
    '┼' + '─'.repeat(targetWidth + 2) +
    '┼' + '─'.repeat(statusWidth + 2) + '┤';

  const botBorder =
    '└' + '─'.repeat(nameWidth + 2) +
    '┴' + '─'.repeat(currentWidth + 2) +
    '┴' + '─'.repeat(targetWidth + 2) +
    '┴' + '─'.repeat(statusWidth + 2) + '┘';

  const headerRow =
    '│ ' + padCell('Name', nameWidth) +
    ' │ ' + padCell('Current', currentWidth) +
    ' │ ' + padCell('Target', targetWidth) +
    ' │ ' + padCell('Status', statusWidth) + ' │';

  return (
    <Box flexDirection="column">
      <Text>{topBorder}</Text>
      <Text bold>{headerRow}</Text>
      <Text>{sepBorder}</Text>
      {visibleMods.map((mod, i) => {
        const globalIdx = scrollOffset + i;
        const isCursorRow = cursorIndex !== undefined && globalIdx === cursorIndex;
        const isEvenRow = globalIdx % 2 === 0;

        const prefix = showSelection ? (mod.selected !== false ? '● ' : '○ ') : '';
        const nameCell = padCell(prefix + mod.name, nameWidth);
        const currentCell = padCell(mod.current, currentWidth);
        const targetCell = padCell(mod.target, targetWidth);
        const statusCell = padCell(mod.status, statusWidth);

        // Status color mapping
        let statusColor = mod.statusColor;
        if (mod.status === 'IDENTIFIED') statusColor = 'blue';
        if (mod.status === 'pending') statusColor = 'yellow';

        return (
          <Box key={globalIdx}>
            <Text
              backgroundColor={isCursorRow ? 'cyan' : undefined}
              color={isCursorRow ? 'black' : (isEvenRow ? 'white' : 'gray')}
            >
              {`│ ${nameCell} │ ${currentCell} │ ${targetCell} │ `}
            </Text>
            <Text
              backgroundColor={isCursorRow ? 'cyan' : undefined}
              color={isCursorRow ? 'black' : statusColor as string | undefined}
            >
              {statusCell}
            </Text>
            <Text
              backgroundColor={isCursorRow ? 'cyan' : undefined}
              color={isCursorRow ? 'black' : (isEvenRow ? 'white' : 'gray')}
            >
              {' │'}
            </Text>
          </Box>
        );
      })}
      <Text>{botBorder}</Text>
    </Box>
  );
}
