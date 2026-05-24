import React from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './select-list.js';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { fitColumn } from '../utils/display.js';
import type { MCVersion } from '@upmods/core';

export interface VersionSelectPhaseProps {
  versions: MCVersion[];
  selectedIndex: number;
}

export function VersionSelectPhase({ versions, selectedIndex }: VersionSelectPhaseProps) {
  const { t } = useLanguage();

  const hotkeys: HotkeyItem[] = [
    { key: '↑↓', label: t.common.hotkeys.navigate, tone: 'primary' },
    { key: 'Enter', label: t.common.hotkeys.confirm, tone: 'primary' },
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  const selectedVersion = versions[selectedIndex]?.version;
  const summary = selectedVersion
    ? `${t.versionSelect.summary} ${selectedVersion}`
    : t.versionSelect.summary;

  return (
    <ScreenFrame
      title={t.versionSelect.title}
      subtitle={t.versionSelect.subtitle}
      summary={summary}
      hotkeys={hotkeys}
    >
      <Box flexDirection="column">
        <Text bold dimColor>Release</Text>
        <SelectList
          items={versions}
          selectedIndex={selectedIndex}
          visibleCount={10}
          renderItem={(version, isSelected) => (
            <Text color={isSelected ? 'cyan' : undefined}>
              {isSelected ? '› ' : '  '}
              {fitColumn(version.version, 16)}
              {version.major ? '  recommended' : ''}
            </Text>
          )}
        />
      </Box>
    </ScreenFrame>
  );
}
