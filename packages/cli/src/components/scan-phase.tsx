import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';
import { truncateText } from '../utils/display.js';
import type { AppState } from '../state/reducer.js';

interface ScanPhaseProps {
  state: AppState;
}

export function ScanPhase({ state }: ScanPhaseProps) {
  const { t } = useLanguage();
  const isScanning =
    state.phase === 'scanning' || state.phase === 'identifying';
  const spinnerChar = useSpinner(isScanning);
  const scanResult = state.scanResult;

  const hotkeys: HotkeyItem[] = state.phase === 'scan_complete' && scanResult && scanResult.totalFiles > 0
    ? [
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

  if (!isScanning && scanResult && scanResult.totalFiles === 0) {
    return (
      <ScreenFrame
        title={t.scan.title}
        subtitle={t.scan.subtitle}
        summary={summary}
        hotkeys={hotkeys}
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

      {scanResult && scanResult.identified.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>
            {t.scan.identifiedSection}
          </Text>
          {scanResult.identified.map((mod) => (
            <Box key={mod.file.path}>
              <Text color="green">✓ </Text>
              <Text>{truncateText(mod.displayName, 34)}</Text>
              <Text dimColor>  {truncateText(mod.installedVersionNumber, 18)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}

      {scanResult && scanResult.unidentified.length > 0 ? (
        <Box flexDirection="column">
          <Text bold dimColor>
            {t.scan.unidentifiedSection}
          </Text>
          {scanResult.unidentified.map((file) => (
            <Box key={file.path}>
              <Text color="yellow">? </Text>
              <Text>{truncateText(file.filename, 34)}</Text>
              <Text dimColor>  {t.scan.unidentifiedLabel}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScreenFrame>
  );
}
