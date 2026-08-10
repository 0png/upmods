import React from 'react';
import { Box, Text } from 'ink';
import type { LoaderDetection, ModLoader } from '@upmods/core';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { SelectList } from './select-list.js';
import { useLanguage } from '../i18n/use-language.js';
import { fitColumn } from '../utils/display.js';

interface LoaderSelectPhaseProps {
  loaders: ModLoader[];
  detection: LoaderDetection | null;
  mode: 'source' | 'target';
  sourceIndex: number;
  targetIndex: number;
  selectedSourceLoader: string | null;
  mcVersion: string | null;
  workflowStep: number | null;
}

function loaderLabel(loader: string | null): string {
  if (!loader) return '—';
  return loader === 'neoforge'
    ? 'NeoForge'
    : loader.charAt(0).toUpperCase() + loader.slice(1);
}

export function LoaderSelectPhase({
  loaders,
  detection,
  mode,
  sourceIndex,
  targetIndex,
  selectedSourceLoader,
  mcVersion,
  workflowStep,
}: LoaderSelectPhaseProps) {
  const { t } = useLanguage();
  const selectedIndex = mode === 'source' ? sourceIndex : targetIndex;
  const currentLoader = loaders[selectedIndex]?.name ?? null;
  const sourceLoader = mode === 'source' ? currentLoader : selectedSourceLoader;
  const targetLoader = mode === 'target' ? currentLoader : null;
  const hotkeys: HotkeyItem[] = [
    { key: '↑↓', label: t.common.hotkeys.navigate, tone: 'primary' },
    { key: 'Enter', label: t.common.hotkeys.confirm, tone: 'primary' },
    { key: 'B', label: t.common.hotkeys.back, tone: 'muted' },
    ...(mode === 'target'
      ? [{ key: 'S', label: t.common.hotkeys.editSource, tone: 'warning' as const }]
      : []),
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];
  const summary = t.loaderSelect.summary
    .replace('{source}', loaderLabel(sourceLoader))
    .replace('{target}', loaderLabel(targetLoader))
    .replace('{version}', mcVersion ?? '—');

  return (
    <ScreenFrame
      title={t.loaderSelect.title}
      subtitle={t.loaderSelect.subtitle}
      summary={loaders.length > 0 ? summary : t.loaderSelect.loading}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Box marginBottom={1}>
        <Text dimColor>{t.loaderSelect.source} </Text>
        <Text color="cyan" bold>{loaderLabel(sourceLoader)}</Text>
        {detection?.detected === sourceLoader ? (
          <Text dimColor> ({t.loaderSelect.detected})</Text>
        ) : null}
      </Box>
      {detection?.ambiguous ? (
        <Text color="yellow">! {t.loaderSelect.ambiguous}</Text>
      ) : null}
      <Text bold dimColor>
        {mode === 'source' ? t.loaderSelect.sourceMode : t.loaderSelect.targetMode}
      </Text>
      <SelectList
        items={loaders}
        selectedIndex={selectedIndex}
        visibleCount={10}
        renderItem={(loader, isSelected) => (
          <Text color={isSelected ? 'cyan' : undefined}>
            {isSelected ? '› ' : '  '}{fitColumn(loaderLabel(loader.name), 20)}
            {loader.name === detection?.detected ? `  ${t.loaderSelect.detected}` : ''}
          </Text>
        )}
      />
    </ScreenFrame>
  );
}
