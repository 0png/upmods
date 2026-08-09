import React from 'react';
import { Box, Text } from 'ink';
import { ScreenFrame, type HotkeyItem } from './chrome.js';
import { useLanguage } from '../i18n/use-language.js';
import { fitColumn } from '../utils/display.js';
import { formatListNumber, getViewportState } from '../utils/viewport.js';
import { getInstalledVersionUrl, getUpdateVersionUrl } from '../utils/modrinth.js';
import type { ModUpdate, Mod } from '@upmods/core';

export interface CheckPhaseProps {
  updates: ModUpdate[];
  selectedUpdates: Record<string, boolean>;
  checkCursorIndex: number;
  upToDate: Mod[];
  workflowStep: number | null;
}

const NUMBER_WIDTH = 5;
const PICK_WIDTH = 7;
const MOD_WIDTH = 17;
const VERSION_WIDTH = 16;
const STATUS_WIDTH = 12;
const VISIBLE_COUNT = 8;

export function CheckPhase({
  updates,
  selectedUpdates,
  checkCursorIndex,
  upToDate,
  workflowStep,
}: CheckPhaseProps) {
  const { t } = useLanguage();

  const hasUpdates = updates.length > 0;
  const selectedCount = updates.filter((update) => selectedUpdates[update.mod.file.sha1]).length;
  const totalChecked = updates.length + upToDate.length;
  const checkItems = [
    ...updates.map((update) => ({
      kind: 'update' as const,
      key: update.mod.file.sha1,
      url: getUpdateVersionUrl(update),
      modName: update.mod.displayName,
      installed: update.mod.installedVersionNumber,
      available: update.latestVersionNumber,
      status: `${t.check.updateAvailable} ↑`,
      selected: selectedUpdates[update.mod.file.sha1],
    })),
    ...upToDate.map((mod) => ({
      kind: 'upToDate' as const,
      key: mod.file.sha1,
      url: getInstalledVersionUrl(mod),
      modName: mod.displayName,
      installed: mod.installedVersionNumber,
      available: '—',
      status: `${t.check.upToDate} ✓`,
      selected: false,
    })),
  ];
  const canDownload = hasUpdates && selectedCount > 0;
  const hotkeys: HotkeyItem[] = hasUpdates
    ? [
        { key: '↑↓', label: t.common.hotkeys.scroll, tone: 'primary' },
        { key: 'Space', label: t.common.hotkeys.toggle, tone: 'primary' },
        { key: 'A', label: t.common.hotkeys.selectAll, tone: 'success' },
        { key: 'N', label: t.common.hotkeys.selectNone, tone: 'muted' },
        ...(canDownload
          ? [{ key: 'U', label: t.common.hotkeys.download, tone: 'warning' as const }]
          : []),
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ]
    : [
        { key: 'Q', label: t.common.hotkeys.quit, tone: 'muted' },
        { key: 'L', label: t.common.hotkeys.language, tone: 'muted' },
      ];

  const summary = hasUpdates
    ? (
        canDownload
          ? t.check.selectionSummary
          : t.check.noneSelected
      )
        .replace('{selected}', String(selectedCount))
        .replace('{count}', String(updates.length))
    : t.check.allUpToDate;
  const viewport = getViewportState(checkItems, checkCursorIndex, VISIBLE_COUNT);
  const browsing = checkItems.length > 0
    ? t.check.browsing
        .replace('{current}', String(viewport.currentPosition))
        .replace('{total}', String(viewport.totalCount))
    : null;
  const overflow = viewport.hiddenAbove > 0 || viewport.hiddenBelow > 0
    ? t.common.list.overflow
        .replace('{above}', String(viewport.hiddenAbove))
        .replace('{below}', String(viewport.hiddenBelow))
    : null;
  const currentItem = checkItems[checkCursorIndex];
  const subtitle = `${t.check.subtitle} ${t.check.modsChecked.replace('{count}', String(totalChecked))}`;

  return (
    <ScreenFrame
      title={t.check.title}
      subtitle={subtitle}
      summary={summary}
      hotkeys={hotkeys}
      workflowStep={workflowStep}
    >
      {browsing ? <Text dimColor>{browsing}</Text> : null}
      {overflow ? <Text dimColor>{overflow}</Text> : null}
      {currentItem ? (
        <Text dimColor>
          {t.check.modrinthLink} {currentItem.url}
        </Text>
      ) : null}
      <Box marginBottom={1}>
        <Text bold dimColor>{fitColumn('#', NUMBER_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.pick, PICK_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.modName, MOD_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.installed, VERSION_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.available, VERSION_WIDTH)}</Text>
        <Text bold dimColor>{fitColumn(t.check.status, STATUS_WIDTH)}</Text>
      </Box>

      {viewport.visibleItems.map(({ item, index }) => (
        <Box key={item.key}>
          <Text color={index === checkCursorIndex ? 'cyan' : 'gray'}>
            {fitColumn(formatListNumber(index, viewport.totalCount), NUMBER_WIDTH)}
          </Text>
          {item.kind === 'update' ? (
            <Text color={index === checkCursorIndex ? 'cyan' : undefined}>
              {fitColumn(
                `${index === checkCursorIndex ? '›' : ' '} ${item.selected ? '[x]' : '[ ]'}`,
                PICK_WIDTH,
              )}
            </Text>
          ) : (
            <Text dimColor>{fitColumn('  --', PICK_WIDTH)}</Text>
          )}
          <Text color={index === checkCursorIndex ? 'cyan' : undefined}>
            {fitColumn(item.modName, MOD_WIDTH)}
          </Text>
          <Text color={index === checkCursorIndex ? 'cyan' : undefined}>
            {fitColumn(item.installed, VERSION_WIDTH)}
          </Text>
          <Text color={item.kind === 'update' ? 'green' : undefined} dimColor={item.kind !== 'update'}>
            {fitColumn(item.available, VERSION_WIDTH)}
          </Text>
          <Text color={item.kind === 'update' ? 'yellow' : 'green'}>
            {fitColumn(item.status, STATUS_WIDTH)}
          </Text>
        </Box>
      ))}
    </ScreenFrame>
  );
}
