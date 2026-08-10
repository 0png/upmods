import React from 'react';
import { Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';

interface CheckingPhaseProps {
  workflowStep: number | null;
  title?: string;
  subtitle?: string;
  inProgress?: string;
  summary?: string;
  cancellable?: boolean;
}

export function CheckingPhase({
  workflowStep,
  title,
  subtitle,
  inProgress,
  summary,
  cancellable = false,
}: CheckingPhaseProps) {
  const { t } = useLanguage();
  const spinnerChar = useSpinner(true);

  const hotkeys: HotkeyItem[] = [
    ...(cancellable ? [{ key: 'C', label: t.common.hotkeys.cancel, tone: 'warning' as const }] : []),
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  return (
    <ScreenFrame
      title={title ?? t.checking.title}
      subtitle={subtitle ?? t.checking.subtitle}
      summary={summary ?? t.checking.summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Text color="yellow">{spinnerChar} </Text>
      <Text>{inProgress ?? t.checking.inProgress}</Text>
    </ScreenFrame>
  );
}
