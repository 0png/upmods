import React from 'react';
import { Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { useSpinner } from '../hooks/use-spinner.js';

interface CheckingPhaseProps {
  workflowStep: number | null;
}

export function CheckingPhase({ workflowStep }: CheckingPhaseProps) {
  const { t } = useLanguage();
  const spinnerChar = useSpinner(true);

  const hotkeys: HotkeyItem[] = [
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  return (
    <ScreenFrame
      title={t.checking.title}
      subtitle={t.checking.subtitle}
      summary={t.checking.summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Text color="yellow">{spinnerChar} </Text>
      <Text>{t.checking.inProgress}</Text>
    </ScreenFrame>
  );
}
