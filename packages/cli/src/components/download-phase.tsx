import React, { useEffect, useState } from 'react';
import { Box, Text, Static } from 'ink';
import { useLanguage } from '../i18n/use-language.js';
import type { ModUpdate, DownloadResult } from '@upmods/core';

export interface DownloadPhaseProps {
  updates: ModUpdate[];
  downloadResults: DownloadResult[];
  downloadProgress: Record<string, { bytes: number; total: number }>;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  return SPINNER_FRAMES[frame] ?? '⠋';
}

function renderProgressBar(bytes: number, total: number, width = 16): string {
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

  // Build a set of completed sha1s for quick lookup
  const completedSha1s = new Set(downloadResults.map((r) => r.update.mod.file.sha1));

  // Separate completed (done/error) from in-progress
  const completed = downloadResults;
  const inProgress = updates.filter((u) => !completedSha1s.has(u.mod.file.sha1));

  const isActive = inProgress.length > 0;
  const spinnerChar = useSpinner(isActive);

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        {isActive ? (
          <Text color="cyan">{spinnerChar} </Text>
        ) : (
          <Text color="green">✓ </Text>
        )}
        <Text bold>{t.download.title}</Text>
      </Box>

      {/* Completed and failed rows — Static so they never re-render */}
      <Static items={completed}>
        {(result) => (
          <Box key={result.update.mod.file.sha1}>
            {result.success ? (
              <>
                <Text color="green">  ✓ </Text>
                <Text>{result.update.mod.displayName}</Text>
                <Text dimColor>  {result.update.latestVersionNumber}  {t.download.done}</Text>
              </>
            ) : (
              <>
                <Text color="red">  ✗ </Text>
                <Text>{result.update.mod.displayName}</Text>
                <Text dimColor>  {t.download.failed}: {result.errorReason ?? 'unknown error'}</Text>
              </>
            )}
          </Box>
        )}
      </Static>

      {/* In-progress rows — live, re-renders on state changes */}
      {inProgress.map((update) => {
        const progress = downloadProgress[update.mod.file.sha1];
        return (
          <Box key={update.mod.file.sha1}>
            <Text color="yellow">  {spinnerChar} </Text>
            <Text>{update.mod.displayName}</Text>
            {progress ? (
              <Text dimColor>
                {'  '}
                {renderProgressBar(progress.bytes, progress.total)}
                {'  '}
                {formatBytes(progress.bytes)} / {formatBytes(progress.total)}
              </Text>
            ) : (
              <Text dimColor>  waiting…</Text>
            )}
          </Box>
        );
      })}

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text dimColor>{t.common.quitHint}</Text>
      </Box>
    </Box>
  );
}
