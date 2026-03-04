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
}

function padCell(str: string, width: number): string {
  const truncated = str.length > width ? str.slice(0, Math.max(0, width - 1)) + '\u2026' : str;
  return truncated.padEnd(width);
}

export function ModTable({ mods, showSelection = false }: ModTableProps) {
  const { stdout } = useStdout();
  const termWidth = (stdout as { columns?: number } | undefined)?.columns ?? 80;

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
      <Text>{headerRow}</Text>
      <Text>{sepBorder}</Text>
      {mods.map((mod, i) => {
        const prefix = showSelection ? (mod.selected !== false ? '● ' : '○ ') : '';
        const nameCell = padCell(prefix + mod.name, nameWidth);
        const currentCell = padCell(mod.current, currentWidth);
        const targetCell = padCell(mod.target, targetWidth);
        const statusCell = padCell(mod.status, statusWidth);

        return (
          <Box key={i}>
            <Text>{`│ ${nameCell} │ ${currentCell} │ ${targetCell} │ `}</Text>
            <Text color={mod.statusColor as string | undefined}>{statusCell}</Text>
            <Text>{' │'}</Text>
          </Box>
        );
      })}
      <Text>{botBorder}</Text>
    </Box>
  );
}
