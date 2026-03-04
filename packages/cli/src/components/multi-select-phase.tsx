import React from 'react';
import { Box, Text } from 'ink';
import type { ModUpdate, Mod } from '@upmods/core';
import { sanitizeVersionString } from '@upmods/core';
import { ModTable } from './mod-table.js';
import type { ModRow } from './mod-table.js';

interface MultiSelectPhaseProps {
  updates: ModUpdate[];
  upToDate: Mod[];
  incompatibleMods: Mod[];
  modSelections: Record<string, boolean>;
  selectedIndex: number;
}

export function MultiSelectPhase({
  updates,
  upToDate,
  incompatibleMods,
  modSelections,
  selectedIndex,
}: MultiSelectPhaseProps) {
  const selectableCount = updates.length + upToDate.length;

  const rows: ModRow[] = [
    ...updates.map((u, i) => {
      const isSelected = modSelections[u.mod.projectId] ?? true;
      const isFocused = i === selectedIndex;
      return {
        name: (isFocused ? '❯ ' : '  ') + u.mod.displayName,
        current: sanitizeVersionString(u.mod.installedVersionNumber),
        target: sanitizeVersionString(u.latestVersionNumber),
        status: 'pending',
        statusColor: 'yellow',
        selected: isSelected,
        showSelection: true,
      };
    }),
    ...upToDate.map((m, i) => {
      const absIdx = updates.length + i;
      const isSelected = modSelections[m.projectId] ?? true;
      const isFocused = absIdx === selectedIndex;
      return {
        name: (isFocused ? '❯ ' : '  ') + m.displayName,
        current: sanitizeVersionString(m.installedVersionNumber),
        target: '—',
        status: '[UP TO DATE]',
        statusColor: 'greenBright',
        selected: isSelected,
        showSelection: true,
      };
    }),
    ...incompatibleMods.map((m) => ({
      name: '  ' + m.displayName,
      current: sanitizeVersionString(m.installedVersionNumber),
      target: '—',
      status: '[INCOMPATIBLE]',
      statusColor: 'red',
      selected: false,
      showSelection: true,
    })),
  ];

  const allDeselected =
    selectableCount === 0 || Object.values(modSelections).every((v) => !v);

  const toDownload = updates.filter((u) => modSelections[u.mod.projectId] ?? true).length;
  const toMigrate = upToDate.filter((m) => modSelections[m.projectId] ?? true).length;

  return (
    <Box flexDirection="column">
      <Text dimColor>Select mods to update. Space=toggle, Enter=confirm, Q=quit</Text>
      <ModTable mods={rows} showSelection />
      {allDeselected ? (
        <Text color="yellow">Nothing selected. Press Space to select mods.</Text>
      ) : (
        <Text dimColor>
          {selectableCount} mods total · {toDownload} to download · {toMigrate} to migrate ·{' '}
          {incompatibleMods.length} incompatible
        </Text>
      )}
    </Box>
  );
}
