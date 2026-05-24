import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';
import { truncateText } from '../utils/display.js';
import { formatListNumber, getViewportState } from '../utils/viewport.js';
import type { AppState } from '../state/reducer.js';

const LIST_VISIBLE_COUNT = 8;

interface ScanPhaseProps {
  state: AppState;
  workflowStep: number | null;
}

export function ScanPhase({ state, workflowStep }: ScanPhaseProps) {
  const { t } = useLanguage();
  const isScanning =
    state.phase === 'scanning' || state.phase === 'identifying';
  const spinnerChar = useSpinner(isScanning);
  const scanResult = state.scanResult;

  const hotkeys: HotkeyItem[] = state.phase === 'scan_complete' && scanResult && scanResult.totalFiles > 0
    ? [
        { key: '↑↓', label: t.common.hotkeys.scroll, tone: 'primary' },
        { key: 'Enter', label: t.common.hotkeys.continue, tone: 'primary' },
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ]
    : [
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ];

  const summary = !scanResult
    ? t.scan.summaryScanning
    : scanResult.totalFiles === 0
      ? t.scan.summaryEmpty
      : t.scan.summaryComplete
          .replace('{identified}', String(scanResult.identified.length))
          .replace('{unidentified}', String(scanResult.unidentified.length));
  const scanItems = scanResult
    ? [
        ...scanResult.identified.map((mod) => ({
          key: mod.file.path,
          kind: 'identified' as const,
          name: mod.displayName,
          detail: mod.installedVersionNumber,
        })),
        ...scanResult.unidentified.map((file) => ({
          key: file.path,
          kind: 'unidentified' as const,
          name: file.filename,
          detail: t.scan.unidentifiedLabel,
        })),
      ]
    : [];
  const viewport = getViewportState(scanItems, state.scanCursorIndex, LIST_VISIBLE_COUNT);
  const browsing = viewport.totalCount > 0
    ? t.common.list.position
        .replace('{current}', String(viewport.currentPosition))
        .replace('{total}', String(viewport.totalCount))
    : null;
  const overflow = viewport.hiddenAbove > 0 || viewport.hiddenBelow > 0
    ? t.common.list.overflow
        .replace('{above}', String(viewport.hiddenAbove))
        .replace('{below}', String(viewport.hiddenBelow))
    : null;

  if (!isScanning && scanResult && scanResult.totalFiles === 0) {
    return (
      <ScreenFrame
        title={t.scan.title}
        subtitle={t.scan.subtitle}
        summary={summary}
        hotkeys={hotkeys}
        workflowStep={workflowStep}
      >
        <Text color="yellow">{t.scan.emptyDir}</Text>
        <Text>{scanResult.directory}</Text>
        <Text dimColor>{t.scan.emptyDirHint}</Text>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      title={t.scan.title}
      subtitle={t.scan.subtitle}
      summary={summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Box marginBottom={1}>
        {isScanning ? (
          <Text color="yellow">{spinnerChar} </Text>
        ) : (
          <Text color="green">✓ </Text>
        )}
        <Text bold>
          {state.phase === 'identifying'
            ? t.scan.identifying
            : isScanning
              ? t.scan.scanning
              : t.common.status.ready}
        </Text>
      </Box>

      {state.phase === 'scan_complete' && scanItems.length > 0 ? (
        <Box flexDirection="column">
          <Text dimColor>{t.scan.browsing} {browsing}</Text>
          {overflow ? <Text dimColor>{overflow}</Text> : null}
          {viewport.visibleItems.map(({ item, index }) => (
            <Box key={item.key}>
              <Text color={index === state.scanCursorIndex ? 'cyan' : 'gray'}>
                {formatListNumber(index, viewport.totalCount)}{' '}
              </Text>
              <Text color={item.kind === 'identified' ? 'green' : 'yellow'}>
                {item.kind === 'identified' ? '✓ ' : '? '}
              </Text>
              <Text color={index === state.scanCursorIndex ? 'cyan' : undefined}>
                {truncateText(item.name, 32)}
              </Text>
              <Text dimColor>  {truncateText(item.detail, 20)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScreenFrame>
  );
}
