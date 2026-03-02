import React from 'react';
import { Box, Text } from 'ink';
import { useLanguage } from '../i18n/use-language.js';
import type { ModUpdate, Mod } from '@upmods/core';

export interface CheckPhaseProps {
  updates: ModUpdate[];
  upToDate: Mod[];
}

export function CheckPhase({ updates, upToDate }: CheckPhaseProps) {
  const { t } = useLanguage();

  const hasUpdates = updates.length > 0;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>{t.check.title}</Text>
      </Box>

      {/* Table header */}
      <Box marginBottom={1}>
        <Box width={30}>
          <Text bold dimColor>
            {t.check.modName}
          </Text>
        </Box>
        <Box width={15}>
          <Text bold dimColor>
            {t.check.installed}
          </Text>
        </Box>
        <Box width={15}>
          <Text bold dimColor>
            {t.check.available}
          </Text>
        </Box>
        <Box width={20}>
          <Text bold dimColor>
            {t.check.status}
          </Text>
        </Box>
      </Box>

      {/* Mods with updates */}
      {updates.map((update) => (
        <Box key={update.mod.file.sha1}>
          <Box width={30}>
            <Text>{update.mod.displayName}</Text>
          </Box>
          <Box width={15}>
            <Text>{update.mod.installedVersionNumber}</Text>
          </Box>
          <Box width={15}>
            <Text color="green">{update.latestVersionNumber}</Text>
          </Box>
          <Box width={20}>
            <Text color="yellow">
              {t.check.updateAvailable} ↑
            </Text>
          </Box>
        </Box>
      ))}

      {/* Up-to-date mods */}
      {upToDate.map((mod) => (
        <Box key={mod.file.sha1}>
          <Box width={30}>
            <Text>{mod.displayName}</Text>
          </Box>
          <Box width={15}>
            <Text>{mod.installedVersionNumber}</Text>
          </Box>
          <Box width={15}>
            <Text dimColor>—</Text>
          </Box>
          <Box width={20}>
            <Text color="green">{t.check.upToDate} ✓</Text>
          </Box>
        </Box>
      ))}

      {/* Summary message */}
      <Box marginTop={1}>
        {hasUpdates ? (
          <Text color="cyan">{t.check.updatesFound.replace('{count}', String(updates.length))}</Text>
        ) : (
          <Text color="green">{t.check.allUpToDate}</Text>
        )}
      </Box>

      {/* Action hints */}
      <Box marginTop={1}>
        <Text dimColor>
          {hasUpdates ? t.check.hintWithUpdates : t.check.hintNoUpdates}
        </Text>
      </Box>
    </Box>
  );
}
