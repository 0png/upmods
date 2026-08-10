import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';
import { fitColumn } from '../utils/display.js';
import { getUpdateVersionUrl } from '../utils/modrinth.js';
import { formatListNumber, getViewportState } from '../utils/viewport.js';
import type { ModUpdate, DownloadResult } from '@upmods/core';

export interface DownloadPhaseProps {
  updates: ModUpdate[];
  downloadResults: DownloadResult[];
  downloadProgress: Record<string, { bytes: number; total: number }>;
  downloadCursorIndex: number;
  workflowStep: number | null;
}

const MOD_WIDTH = 24;
const NUMBER_WIDTH = 5;
const DETAIL_WIDTH = 30;
const VISIBLE_COUNT = 8;

function renderProgressBar(bytes: number, total: number, width = 12): string {
  const ratio = total > 0 ? Math.min(bytes / total, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct}%`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadPhase({
  updates,
  downloadResults,
  downloadProgress,
  downloadCursorIndex,
  workflowStep,
}: DownloadPhaseProps) {
  const { t } = useLanguage();

  const resultsBySha1 = new Map(downloadResults.map((result) => [result.update.mod.file.sha1, result]));
  const failedCount = downloadResults.filter((result) => !result.success).length;
  const doneCount = downloadResults.filter((result) => result.success).length;
  const pendingCount = updates.length - downloadResults.length;
  const spinnerChar = useSpinner(pendingCount > 0);

  const hotkeys: HotkeyItem[] = [
    { key: '↑↓', label: t.common.hotkeys.scroll, tone: 'primary' },
    { key: 'O', label: t.common.hotkeys.open, tone: 'primary' },
    { key: 'C', label: t.common.hotkeys.cancel, tone: 'warning' },
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
  ];

  const summary = t.download.summary
    .replace('{done}', String(doneCount))
    .replace('{failed}', String(failedCount))
    .replace('{pending}', String(pendingCount));
  const viewport = getViewportState(updates, downloadCursorIndex, VISIBLE_COUNT);
  const browsing = t.download.browsing
    .replace('{current}', String(viewport.currentPosition))
    .replace('{total}', String(viewport.totalCount));
  const overflow = viewport.hiddenAbove > 0 || viewport.hiddenBelow > 0
    ? t.common.list.overflow
        .replace('{above}', String(viewport.hiddenAbove))
        .replace('{below}', String(viewport.hiddenBelow))
    : null;
  const currentUpdate = updates[downloadCursorIndex];

  return (
    <ScreenFrame
      title={t.download.title}
      subtitle={t.download.subtitle}
      summary={summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Text dimColor>{browsing}</Text>
      {overflow ? <Text dimColor>{overflow}</Text> : null}
      {currentUpdate ? (
        <Text dimColor>
          {t.download.modrinthLink} {getUpdateVersionUrl(currentUpdate)}
        </Text>
      ) : null}
      {viewport.visibleItems.map(({ item: update, index }) => {
        const progress = downloadProgress[update.mod.file.sha1];
        const result = resultsBySha1.get(update.mod.file.sha1);
        const isSelected = index === downloadCursorIndex;

        return (
          <Box key={update.mod.file.sha1}>
            <Text color={isSelected ? 'cyan' : 'gray'}>
              {fitColumn(formatListNumber(index, viewport.totalCount), NUMBER_WIDTH)}
            </Text>
            {result ? (
              result.success ? (
                <Text color="green">✓ </Text>
              ) : (
                <Text color="red">✗ </Text>
              )
            ) : (
              <Text color="yellow">{isSelected ? spinnerChar : '•'} </Text>
            )}
            <Text color={isSelected ? 'cyan' : undefined}>
              {fitColumn(`${isSelected ? '› ' : '  '}${update.mod.displayName}`, MOD_WIDTH)}
            </Text>
            {result ? (
              result.success ? (
                <Text dimColor>{fitColumn(update.latestVersionNumber, DETAIL_WIDTH)}</Text>
              ) : (
                <Text dimColor>{fitColumn(result.errorReason ?? t.error.unknownError, DETAIL_WIDTH)}</Text>
              )
            ) : progress ? (
              <Text dimColor>
                {fitColumn(
                  `${renderProgressBar(progress.bytes, progress.total)} ${formatBytes(progress.bytes)} / ${formatBytes(progress.total)}`,
                  DETAIL_WIDTH,
                )}
              </Text>
            ) : (
              <Text dimColor>{fitColumn(t.common.status.waiting, DETAIL_WIDTH)}</Text>
            )}
          </Box>
        );
      })}
    </ScreenFrame>
  );
}
