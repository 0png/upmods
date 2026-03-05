import React from 'react';
import { Box, Text } from 'ink';
import type { AppPhase } from '../state/reducer.js';

type StepInfo = { step: number; label: string } | { step: null; label: string };

const PHASE_MAP: Record<AppPhase, StepInfo> = {
  recovery_prompt: { step: null, label: 'Restoring previous session...' },
  restoring:       { step: null, label: 'Restoring previous session...' },
  scanning:        { step: 1, label: 'Scanning local files...' },
  identifying:     { step: 1, label: 'Scanning local files...' },
  scan_complete:   { step: 1, label: 'Scanning local files...' },
  version_select:  { step: 2, label: 'Fetching metadata...' },
  checking:        { step: 2, label: 'Fetching metadata...' },
  check_complete:  { step: 3, label: 'Decision & filtering...' },
  migrating:       { step: 4, label: 'Downloading & migrating...' },
  downloading:     { step: 4, label: 'Downloading & migrating...' },
  done:            { step: 5, label: 'Complete!' },
  error:           { step: null, label: 'Error' },
};

interface ProgressFooterProps {
  phase: AppPhase;
}

export function ProgressFooter({ phase }: ProgressFooterProps) {
  const info = PHASE_MAP[phase];
  const content =
    info.step !== null ? `Step ${info.step}/5: ${info.label}` : info.label;

  return (
    <Box justifyContent="center" paddingY={0}>
      <Box borderStyle="single" paddingX={1}>
        <Text>{content}</Text>
      </Box>
    </Box>
  );
}
