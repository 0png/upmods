import React from 'react';
import { Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import type { AppState } from '../state/reducer.js';

interface ErrorPhaseProps {
  state: AppState;
}

export function ErrorPhase({ state }: ErrorPhaseProps) {
  const { t } = useLanguage();
  const hotkeys: HotkeyItem[] = [
    { key: 'T', label: t.common.hotkeys.retryScan, tone: 'primary' },
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'danger' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];

  return (
    <ScreenFrame
      title={t.error.title}
      subtitle={t.error.subtitle}
      summary={state.errorMessage ?? t.error.unknownError}
      hotkeys={hotkeys}
    >
      <Text color="red">
        {t.error.prefix} {state.errorMessage ?? t.error.unknownError}
      </Text>
    </ScreenFrame>
  );
}
