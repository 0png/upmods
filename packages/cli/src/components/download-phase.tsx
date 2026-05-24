import React from 'react';
import { Box, Static, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';
import { fitColumn } from '../utils/display.js';
import type { ModUpdate, DownloadResult } from '@upmods/core';

export interface DownloadPhaseProps {
  updates: ModUpdate[];
  downloadResults: DownloadResult[];
  downloadProgress: Record<string, { bytes: number; total: number }>;
}

const MOD_WIDTH = 24;
const DETAIL_WIDTH = 34;

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

export function DownloadPhase({ updates, downloadResults, downloadProgress }: DownloadPhaseProps) {
  const { t } = useLanguage();

  const completedSha1s = new Set(downloadResults.map((result) => result.update.mod.file.sha1));
  const completed = downloadResults;
  const inProgress = updates.filter((update) => !completedSha1s.has(update.mod.file.sha1));
  const failedCount = completed.filter((result) => !result.success).length;
  const doneCount = completed.filter((result) => result.success).length;
  const pendingCount = inProgress.length;
  const spinnerChar = useSpinner(pendingCount > 0);

  const hotkeys: HotkeyItem[] = [
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
  ];

  const summary = t.download.summary
    .replace('{done}', String(doneCount))
    .replace('{failed}', String(failedCount))
    .replace('{pending}', String(pendingCount));

  return (
    <ScreenFrame
      title={t.download.title}
      subtitle={t.download.subtitle}
      summary={summary}
      hotkeys={hotkeys}
    >
      <Static items={completed}>
        {(result) => (
          <Box key={result.update.mod.file.sha1}>
            {result.success ? (
              <>
                <Text color="green">✓ </Text>
                <Text>{fitColumn(result.update.mod.displayName, MOD_WIDTH)}</Text>
                <Text dimColor>{fitColumn(result.update.latestVersionNumber, DETAIL_WIDTH)}</Text>
              </>
            ) : (
              <>
                <Text color="red">✗ </Text>
                <Text>{fitColumn(result.update.mod.displayName, MOD_WIDTH)}</Text>
                <Text dimColor>{fitColumn(result.errorReason ?? t.error.unknownError, DETAIL_WIDTH)}</Text>
              </>
            )}
          </Box>
        )}
      </Static>

      {inProgress.map((update) => {
        const progress = downloadProgress[update.mod.file.sha1];

        return (
          <Box key={update.mod.file.sha1}>
            <Text color="yellow">{spinnerChar} </Text>
            <Text>{fitColumn(update.mod.displayName, MOD_WIDTH)}</Text>
            {progress ? (
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
