import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { MigrationResult } from '@upmods/core';
import { sanitizeVersionString } from '@upmods/core';
import { ModTable } from './mod-table.js';
import type { ModRow } from './mod-table.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

interface MigrationPhaseProps {
  migrationResults: MigrationResult[];
  totalMigrations: number;
}

export function MigrationPhase({ migrationResults, totalMigrations }: MigrationPhaseProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const pending = totalMigrations - migrationResults.length;

  const completedRows: ModRow[] = migrationResults.map((r) => ({
    name: r.mod.displayName,
    current: sanitizeVersionString(r.mod.installedVersionNumber),
    target: '—',
    status: r.success ? '[MIGRATED]' : `✘ ERROR: ${r.errorReason ?? 'failed'}`,
    statusColor: r.success ? 'greenBright' : 'red',
  }));

  const pendingRows: ModRow[] = Array.from({ length: Math.max(0, pending) }, (_, i) => ({
    name: `... (${migrationResults.length + i + 1}/${totalMigrations})`,
    current: '—',
    target: '—',
    status: `${FRAMES[frame] ?? FRAMES[0]} MIGRATING`,
    statusColor: 'blue',
  }));

  const rows: ModRow[] = [...completedRows, ...pendingRows];

  return (
    <Box flexDirection="column">
      <Text>
        Migrating {migrationResults.length} / {totalMigrations} files...
      </Text>
      {rows.length > 0 ? (
        <ModTable mods={rows} />
      ) : (
        <Text dimColor>Starting migration…</Text>
      )}
    </Box>
  );
}
