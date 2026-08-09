import React from 'react';
import { Box, Text } from 'ink';
import type { LoaderMigrationPlan, MigrationEntry, MigrationResult } from '@upmods/core';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { fitColumn } from '../utils/display.js';
import { formatListNumber, getViewportState } from '../utils/viewport.js';
import { CheckingPhase } from './checking-phase.js';

const NUMBER_WIDTH = 5;
const PICK_WIDTH = 7;
const MOD_WIDTH = 20;
const LOADER_WIDTH = 12;
const TARGET_WIDTH = 18;
const STATUS_WIDTH = 15;
const VISIBLE_COUNT = 8;

export function MigrationLoadingPhase({
  building,
  workflowStep,
}: {
  building: boolean;
  workflowStep: number | null;
}) {
  const { t } = useLanguage();
  return (
    <CheckingPhase
      workflowStep={workflowStep}
      title={building ? t.migration.buildingTitle : t.migration.checkingTitle}
      subtitle={building ? t.migration.buildingSubtitle : t.migration.checkingSubtitle}
      inProgress={building ? t.migration.buildingProgress : t.migration.checkingProgress}
      summary={building ? t.migration.buildingSummary : t.migration.checkingSummary}
    />
  );
}

interface MigrationReviewPhaseProps {
  plan: LoaderMigrationPlan;
  cursorIndex: number;
  selectedOptionalEntries: Record<string, boolean>;
  workflowStep: number | null;
}

function getEntryUrl(entry: MigrationEntry): string | null {
  if (!entry.projectSlug || !entry.targetVersionId) return null;
  return `https://modrinth.com/mod/${entry.projectSlug}/version/${entry.targetVersionId}`;
}

export function MigrationReviewPhase({
  plan,
  cursorIndex,
  selectedOptionalEntries,
  workflowStep,
}: MigrationReviewPhaseProps) {
  const { t } = useLanguage();
  const optionalEntries = plan.entries.filter((entry) => entry.status === 'optional');
  const selectedOptionalCount = optionalEntries.filter((entry) => selectedOptionalEntries[entry.id]).length;
  const isEntryActive = (entry: MigrationEntry) => entry.activationKeys.includes('root')
    || entry.activationKeys.some((key) => selectedOptionalEntries[key]);
  const converted = plan.entries.filter((entry) => entry.status === 'convertible').length;
  const copied = plan.entries.filter((entry) => entry.status === 'compatible').length;
  const required = plan.entries.filter((entry) => entry.status === 'required' && isEntryActive(entry)).length;
  const viewport = getViewportState(plan.entries, cursorIndex, VISIBLE_COUNT);
  const currentEntry = plan.entries[cursorIndex];
  const currentUrl = currentEntry ? getEntryUrl(currentEntry) : null;
  const hotkeys: HotkeyItem[] = [
    { key: '↑↓', label: t.common.hotkeys.scroll, tone: 'primary' },
    ...(optionalEntries.length > 0 ? [
      { key: 'Space', label: t.common.hotkeys.toggle, tone: 'primary' as const },
      { key: 'A', label: t.common.hotkeys.selectAll, tone: 'success' as const },
      { key: 'N', label: t.common.hotkeys.selectNone, tone: 'muted' as const },
    ] : []),
    ...(currentUrl ? [{ key: 'O', label: t.common.hotkeys.open, tone: 'primary' as const }] : []),
    { key: 'U', label: t.common.hotkeys.download, tone: 'warning' },
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];
  const summary = t.migration.selectedSummary
    .replace('{converted}', String(converted))
    .replace('{copied}', String(copied))
    .replace('{required}', String(required))
    .replace('{optional}', String(selectedOptionalCount));
  const overflow = viewport.hiddenAbove > 0 || viewport.hiddenBelow > 0
    ? t.common.list.overflow
        .replace('{above}', String(viewport.hiddenAbove))
        .replace('{below}', String(viewport.hiddenBelow))
    : null;

  const statusText = (entry: MigrationEntry): string => {
    switch (entry.status) {
      case 'compatible': return t.migration.compatible;
      case 'convertible': return t.migration.convertible;
      case 'required': return t.migration.required;
      case 'optional': return t.migration.optional;
      case 'unavailable': return t.migration.unavailable;
    }
  };
  const statusColor = (entry: MigrationEntry): string => {
    switch (entry.status) {
      case 'compatible': return 'green';
      case 'required': return 'cyan';
      case 'unavailable': return 'red';
      default: return 'yellow';
    }
  };

  return (
    <ScreenFrame
      title={t.migration.reviewTitle}
      subtitle={t.migration.reviewSubtitle}
      summary={summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Text dimColor>
        {t.common.list.position
          .replace('{current}', String(viewport.currentPosition))
          .replace('{total}', String(viewport.totalCount))}
      </Text>
      {overflow ? <Text dimColor>{overflow}</Text> : null}
      {currentUrl ? <Text dimColor>Modrinth: {currentUrl}</Text> : null}
      {!plan.complete ? (
        <Text color="yellow">
          ! {t.migration.incomplete.replace('{count}', String(plan.issues.length))}
        </Text>
      ) : null}
      <Box marginBottom={1}>
        <Text bold dimColor>{fitColumn('#', NUMBER_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn('Pick', PICK_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.migration.mod, MOD_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.migration.source, LOADER_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.migration.target, TARGET_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.migration.status, STATUS_WIDTH)}</Text>
      </Box>
      {viewport.visibleItems.map(({ item: entry, index }) => {
        const selected = entry.status !== 'unavailable' && isEntryActive(entry);
        const isSelected = index === cursorIndex;
        return (
          <Box key={entry.id}>
            <Text color={isSelected ? 'cyan' : 'gray'}>
              {fitColumn(formatListNumber(index, viewport.totalCount), NUMBER_WIDTH)}
            </Text>
            <Text color={isSelected ? 'cyan' : undefined} dimColor={entry.status === 'unavailable'}>
              {fitColumn(`${isSelected ? '›' : ' '} ${entry.status === 'unavailable' ? '--' : selected ? '[x]' : '[ ]'}`, PICK_WIDTH)}
            </Text>
            <Text color={isSelected ? 'cyan' : undefined}>{fitColumn(entry.displayName, MOD_WIDTH)}</Text>
            <Text dimColor>{fitColumn(entry.dependencyType === 'root' ? plan.sourceLoader : '—', LOADER_WIDTH)}</Text>
            <Text color={entry.status === 'unavailable' ? 'red' : undefined}>
              {fitColumn(entry.targetVersionNumber ?? '—', TARGET_WIDTH)}
            </Text>
            <Text color={statusColor(entry)}>{fitColumn(statusText(entry), STATUS_WIDTH)}</Text>
          </Box>
        );
      })}
    </ScreenFrame>
  );
}

interface MigrationSummaryPhaseProps {
  result: MigrationResult;
  workflowStep: number | null;
}

export function MigrationSummaryPhase({ result, workflowStep }: MigrationSummaryPhaseProps) {
  const { t } = useLanguage();
  const status = result.complete ? t.migration.complete : t.migration.incomplete.replace('{count}', String(result.manifest.issues.length));
  const hotkeys: HotkeyItem[] = [
    { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
    { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
  ];
  const summary = t.migration.resultSummary
    .replace('{status}', status)
    .replace('{loader}', result.manifest.targetLoader)
    .replace('{version}', result.manifest.mcVersion);
  const counts = t.migration.resultCounts
    .replace('{downloaded}', String(result.downloadedCount))
    .replace('{copied}', String(result.copiedCount))
    .replace('{failed}', String(result.failedCount))
    .replace('{unavailable}', String(result.unavailableCount));

  return (
    <ScreenFrame
      title={t.migration.doneTitle}
      subtitle={t.migration.doneSubtitle}
      summary={summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      <Text color={result.complete ? 'green' : 'yellow'} bold>
        {result.complete ? '✓' : '!'} {counts}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>{t.migration.outputDir} </Text>
        <Text>{result.outputDir}</Text>
      </Box>
      <Text color="yellow">{t.migration.manualInstall}</Text>
    </ScreenFrame>
  );
}
