import React from 'react';
import { Box, Text } from 'ink';
import { useLanguage } from '../i18n/use-language.js';
import type { DownloadResult } from '@upmods/core';

export interface SummaryPhaseProps {
  downloadResults: DownloadResult[];
  outputDir: string;
}

export function SummaryPhase({ downloadResults, outputDir }: SummaryPhaseProps) {
  const { t } = useLanguage();

  const successful = downloadResults.filter((r) => r.success);
  const failed = downloadResults.filter((r) => !r.success);

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="green">
          ✓ {t.summary.title.replace('{count}', String(successful.length))}
        </Text>
      </Box>

      {/* Successful downloads */}
      {successful.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {successful.map((result) => (
            <Box key={result.update.mod.file.sha1}>
              <Text color="green">  ✓ </Text>
              <Text>{result.update.mod.displayName}</Text>
              <Text dimColor>  {result.update.latestVersionNumber}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Output directory */}
      <Box marginBottom={1}>
        <Text dimColor>{t.summary.outputDir} </Text>
        <Text>{outputDir}</Text>
      </Box>

      {/* Failed downloads */}
      {failed.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>
            {t.summary.failedSection}
          </Text>
          {failed.map((result) => (
            <Box key={result.update.mod.file.sha1}>
              <Text color="red">  ✗ </Text>
              <Text>{result.update.mod.displayName}</Text>
              <Text dimColor>  {result.errorReason ?? 'unknown error'}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Quit hint */}
      <Box marginTop={1}>
        <Text dimColor>{t.summary.quitHint}</Text>
      </Box>
    </Box>
  );
}
