import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { truncateText } from '../utils/display.js';
import type { DownloadResult } from '@upmods/core';

export interface SummaryPhaseProps {
  downloadResults: DownloadResult[];
  outputDir: string;
}

export function SummaryPhase({ downloadResults, outputDir }: SummaryPhaseProps) {
  const { t } = useLanguage();

  const successful = downloadResults.filter((result) => result.success);
  const failed = downloadResults.filter((result) => !result.success);
  const hotkeys: HotkeyItem[] = [
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  const summary = t.summary.successSummary.replace('{count}', String(successful.length));

  return (
    <ScreenFrame
      title={t.summary.title}
      subtitle={t.summary.subtitle}
      hotkeys={hotkeys}
    >
      <Box marginBottom={1}>
        <Text color="green">✓ </Text>
        <Text bold>{summary}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{t.summary.outputDir} </Text>
        <Text>{outputDir}</Text>
      </Box>

      {failed.length > 0 ? (
        <Box flexDirection="column">
          <Text bold color="red">
            {t.summary.failedSection}
          </Text>
          {failed.map((result) => (
            <Box key={result.update.mod.file.sha1}>
              <Text color="red">✗ </Text>
              <Text>{truncateText(result.update.mod.displayName, 32)}</Text>
              <Text dimColor>  {truncateText(result.errorReason ?? t.error.unknownError, 24)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScreenFrame>
  );
}
