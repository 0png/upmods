import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { truncateText } from '../utils/display.js';
import { formatListNumber, getViewportState } from '../utils/viewport.js';
import type { DownloadResult } from '@upmods/core';

export interface SummaryPhaseProps {
  downloadResults: DownloadResult[];
  outputDir: string;
  summaryCursorIndex: number;
  workflowStep: number | null;
}

const VISIBLE_COUNT = 8;

export function SummaryPhase({
  downloadResults,
  outputDir,
  summaryCursorIndex,
  workflowStep,
}: SummaryPhaseProps) {
  const { t } = useLanguage();

  const successful = downloadResults.filter((result) => result.success);
  const failed = downloadResults.filter((result) => !result.success);
  const hotkeys: HotkeyItem[] = [
    ...(failed.length > 0
      ? [{ key: '↑↓', label: t.common.hotkeys.scroll, tone: 'primary' as const }]
      : []),
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  const summary = t.summary.successSummary.replace('{count}', String(successful.length));
  const viewport = getViewportState(failed, summaryCursorIndex, VISIBLE_COUNT);
  const browsing = failed.length > 0
    ? t.summary.browsing
        .replace('{current}', String(viewport.currentPosition))
        .replace('{total}', String(viewport.totalCount))
    : null;
  const overflow = viewport.hiddenAbove > 0 || viewport.hiddenBelow > 0
    ? t.common.list.overflow
        .replace('{above}', String(viewport.hiddenAbove))
        .replace('{below}', String(viewport.hiddenBelow))
    : null;

  return (
    <ScreenFrame
      title={t.summary.title}
      subtitle={t.summary.subtitle}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
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
          {browsing ? <Text dimColor>{browsing}</Text> : null}
          {overflow ? <Text dimColor>{overflow}</Text> : null}
          <Text bold color="red">
            {t.summary.failedSection} · {t.summary.failedSummary.replace('{count}', String(failed.length))}
          </Text>
          {viewport.visibleItems.map(({ item: result, index }) => (
            <Box key={result.update.mod.file.sha1}>
              <Text color={index === summaryCursorIndex ? 'cyan' : 'gray'}>
                {formatListNumber(index, viewport.totalCount)}{' '}
              </Text>
              <Text color="red">✗ </Text>
              <Text color={index === summaryCursorIndex ? 'cyan' : undefined}>
                {truncateText(`${index === summaryCursorIndex ? '› ' : '  '}${result.update.mod.displayName}`, 32)}
              </Text>
              <Text dimColor>  {truncateText(result.errorReason ?? t.error.unknownError, 24)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScreenFrame>
  );
}
