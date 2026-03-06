import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useLanguage } from '../i18n/use-language.js';
import type { AppState } from '../state/reducer.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

interface ScanPhaseProps {
  state: AppState;
}

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  return SPINNER_FRAMES[frame];
}

export function ScanPhase({ state }: ScanPhaseProps) {
  const { t } = useLanguage();
  const isScanning =
    state.phase === 'scanning' || state.phase === 'identifying';
  const spinnerChar = useSpinner(isScanning);

  const scanResult = state.scanResult;

  // Empty directory state
  if (!isScanning && scanResult && scanResult.totalFiles === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text>{t.scan.emptyDir} {scanResult.directory}</Text>
        <Text>{t.scan.emptyDirHint}</Text>
        <Text dimColor>{t.common.quitHint}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1} alignItems="center">
      {/* Header with spinner or done indicator */}
      <Box>
        {isScanning ? (
          <Text color="cyan">{spinnerChar} </Text>
        ) : (
          <Text color="green">✓ </Text>
        )}
        <Text bold>
          {state.phase === 'identifying'
            ? t.scan.identifying
            : isScanning
              ? t.scan.scanning
              : t.scan.title}
        </Text>
      </Box>

      {/* Scan progress */}
      {isScanning && scanResult === null && state.phase === 'scanning' && (
        <Text dimColor>{t.scan.scanning}</Text>
      )}

      {/* Identified mods section */}
      {scanResult && scanResult.identified.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>{t.scan.identifiedSection}</Text>
          {scanResult.identified.map((mod) => (
            <Box key={mod.file.path}>
              <Text color="green">  ✓ </Text>
              <Text>{mod.displayName}</Text>
              <Text dimColor>  {mod.installedVersionNumber}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Unidentified files section */}
      {scanResult && scanResult.unidentified.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>{t.scan.unidentifiedSection}</Text>
          {scanResult.unidentified.map((file) => (
            <Box key={file.path}>
              <Text color="yellow">  ? </Text>
              <Text>{file.filename}</Text>
              <Text dimColor>  {t.scan.unidentifiedLabel}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Footer hints */}
      <Box marginTop={1}>
        {state.phase === 'scan_complete' && scanResult && scanResult.totalFiles > 0 ? (
        <Text dimColor>{t.scan.continueHint}  {t.common.quitHint}  {t.common.langToggle}</Text>
        ) : (
          <>
            <Text dimColor>{t.common.quitHint}</Text>
            <Text dimColor>  {t.common.langToggle}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
