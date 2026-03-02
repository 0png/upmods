import React from 'react';
import { Box, Text } from 'ink';
import { useLanguage } from '../i18n/use-language.js';
import type { AppState } from '../state/reducer.js';

interface ErrorPhaseProps {
  state: AppState;
}

export function ErrorPhase({ state }: ErrorPhaseProps) {
  const { t } = useLanguage();
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color="red">
        {t.error.prefix || '✘'}  {state.errorMessage ?? 'An unexpected error occurred'}
      </Text>
      <Text dimColor>{t.error.quitHint || 'Press Q to quit'}</Text>
    </Box>
  );
}
