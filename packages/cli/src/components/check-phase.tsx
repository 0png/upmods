import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { fitColumn } from '../utils/display.js';
import type { ModUpdate, Mod } from '@upmods/core';

export interface CheckPhaseProps {
  updates: ModUpdate[];
  upToDate: Mod[];
}

const MOD_WIDTH = 24;
const VERSION_WIDTH = 16;
const STATUS_WIDTH = 12;

export function CheckPhase({ updates, upToDate }: CheckPhaseProps) {
  const { t } = useLanguage();

  const hasUpdates = updates.length > 0;
  const totalChecked = updates.length + upToDate.length;
  const hotkeys: HotkeyItem[] = hasUpdates
    ? [
        { key: 'U', label: t.common.hotkeys.download, tone: 'warning' },
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ]
    : [
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ];

  const summary = hasUpdates
    ? t.check.updatesFound.replace('{count}', String(updates.length))
    : t.check.allUpToDate;
  const subtitle = `${t.check.subtitle} ${t.check.modsChecked.replace('{count}', String(totalChecked))}`;

  return (
    <ScreenFrame
      title={t.check.title}
      subtitle={subtitle}
      summary={summary}
      hotkeys={hotkeys}
    >
      <Box marginBottom={1}>
        <Text bold dimColor>{fitColumn(t.check.modName, MOD_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.installed, VERSION_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.available, VERSION_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.status, STATUS_WIDTH)}</Text>
      </Box>

      {updates.map((update) => (
        <Box key={update.mod.file.sha1}>
          <Text>{fitColumn(update.mod.displayName, MOD_WIDTH)}</Text>
          <Text>{fitColumn(update.mod.installedVersionNumber, VERSION_WIDTH)}</Text>
          <Text color="green">{fitColumn(update.latestVersionNumber, VERSION_WIDTH)}</Text>
          <Text color="yellow">{fitColumn(`${t.check.updateAvailable} ↑`, STATUS_WIDTH)}</Text>
        </Box>
      ))}

      {upToDate.map((mod) => (
        <Box key={mod.file.sha1}>
          <Text>{fitColumn(mod.displayName, MOD_WIDTH)}</Text>
          <Text>{fitColumn(mod.installedVersionNumber, VERSION_WIDTH)}</Text>
          <Text dimColor>{fitColumn('—', VERSION_WIDTH)}</Text>
          <Text color="green">{fitColumn(`${t.check.upToDate} ✓`, STATUS_WIDTH)}</Text>
        </Box>
      ))}
    </ScreenFrame>
  );
}
