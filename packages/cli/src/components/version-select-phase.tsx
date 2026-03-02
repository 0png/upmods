import React from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './select-list.js';
import { useLanguage } from '../i18n/use-language.js';
import type { MCVersion } from '@upmods/core';

export interface VersionSelectPhaseProps {
  versions: MCVersion[];
  selectedIndex: number;
}

export function VersionSelectPhase({ versions, selectedIndex }: VersionSelectPhaseProps) {
  const { t } = useLanguage();

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>{t.versionSelect.title}</Text>
      </Box>

      <SelectList
        items={versions}
        selectedIndex={selectedIndex}
        visibleCount={10}
        renderItem={(version, isSelected) => (
          <Text color={isSelected ? 'cyan' : undefined}>
            {isSelected ? '› ' : '  '}
            {version.version}
            {version.major ? ' ⭐' : ''}
          </Text>
        )}
      />

      <Box marginTop={1}>
        <Text dimColor>{t.versionSelect.hint}</Text>
      </Box>
    </Box>
  );
}
