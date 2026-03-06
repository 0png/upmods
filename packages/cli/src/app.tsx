import React, { useReducer, useRef, useEffect, useState } from 'react';
import path from 'node:path';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { LanguageProvider } from './i18n/use-language.js';
import { reducer, initialState } from './state/reducer.js';
import { ErrorPhase } from './components/error-phase.js';
import { ScanPhase } from './components/scan-phase.js';
import { VersionSelectPhase } from './components/version-select-phase.js';
import { DownloadPhase } from './components/download-phase.js';
import { SummaryPhase } from './components/summary-phase.js';
import Banner from './components/banner.js';
import { ModTable } from './components/mod-table.js';
import type { ModRow } from './components/mod-table.js';
import { ProgressFooter } from './components/progress-footer.js';
import { MultiSelectPhase } from './components/multi-select-phase.js';
import { MigrationPhase } from './components/migration-phase.js';
import { UpmodsCore, sanitizeVersionString } from '@upmods/core';

interface AppProps {
  dir: string;
}

export function App({ dir }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();
  const coreRef = useRef<UpmodsCore | null>(null);
  const { stdout } = useStdout();

  // Track terminal size and re-render on resize (fixes ghosting + resize corruption)
  const getTTY = () => (stdout as { columns?: number; rows?: number });
  const [termCols, setTermCols] = useState(() => getTTY().columns ?? 80);
  const [termRows, setTermRows] = useState(() => getTTY().rows ?? 24);

  useEffect(() => {
    const onResize = () => {
      setTermCols(getTTY().columns ?? 80);
      setTermRows(getTTY().rows ?? 24);
    };
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') exit();
    if (input === 'l' || input === 'L') dispatch({ type: 'TOGGLE_LANGUAGE' });

    // Proceed from scan summary to version select
    if (state.phase === 'scan_complete') {
      if (key.upArrow) dispatch({ type: 'CURSOR_UP' });
      if (key.downArrow) dispatch({
        type: 'CURSOR_DOWN',
        max: (state.scanResult?.identified.length ?? 1) - 1,
      });
      if (key.return) dispatch({ type: 'PROCEED_TO_VERSION_SELECT' });
    }

    // Version select navigation
    if (state.phase === 'version_select') {
      if (key.upArrow) dispatch({ type: 'CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'CURSOR_DOWN' });
      if (key.return) dispatch({ type: 'SELECT_MC_VERSION' });
    }

    // T014: Multi-select phase — Space toggle, Enter confirm, arrows navigate
    if (state.phase === 'check_complete') {
      if (key.upArrow) dispatch({ type: 'CURSOR_UP' });
      if (key.downArrow) dispatch({
        type: 'CURSOR_DOWN',
        max: state.updates.length + state.upToDate.length - 1,
      });

      if (input === ' ') {
        // Find the mod at the cursor position in the combined updates+upToDate list
        const selectableList = [...state.updates, ...state.upToDate];
        const item = selectableList[state.selectedMCVersionIndex];
        if (item) {
          const projectId = 'mod' in item ? item.mod.projectId : item.projectId;
          dispatch({ type: 'TOGGLE_MOD_SELECTION', projectId });
        }
      }

      if (key.return) {
        const hasSelections = Object.values(state.modSelections).some(Boolean);
        if (hasSelections) {
          dispatch({ type: 'CONFIRM_SELECTION' });
        }
      }
    }
  });

  // Start scan on mount
  useEffect(() => {
    const core = new UpmodsCore();
    coreRef.current = core;

    const onScanStart = (_scanDir: string, total: number) => {
      dispatch({ type: 'SCAN_PROGRESS', done: 0, total });
    };

    const onScanProgress = (done: number, total: number) => {
      dispatch({ type: 'SCAN_PROGRESS', done, total });
    };

    const onScanComplete = (result: import('@upmods/core').ScanResult) => {
      dispatch({ type: 'SCAN_COMPLETE', result });

      // Load game versions in the background (but don't transition yet)
      core.getGameVersions().then((versions) => {
        dispatch({ type: 'MC_VERSIONS_LOADED', versions });
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'ERROR', message });
      });
    };

    core.on('scan:start', onScanStart);
    core.on('scan:progress', onScanProgress);
    core.on('scan:complete', onScanComplete);

    core.scanAndIdentify(dir).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('scan:start', onScanStart);
      core.off('scan:progress', onScanProgress);
      core.off('scan:complete', onScanComplete);
    };
  }, [dir]);

  // Handle MC version selection and update check
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'checking') return;

    const selectedVersion = state.mcVersions[state.selectedMCVersionIndex]?.version;
    if (!selectedVersion || !state.scanResult) return;

    // T022(a): subscribe to check:complete:v1 and dispatch CHECK_COMPLETE_V1
    const onCheckCompleteV1 = (
      updates: import('@upmods/core').ModUpdate[],
      upToDate: import('@upmods/core').Mod[],
      incompatible: import('@upmods/core').Mod[]
    ) => {
      dispatch({ type: 'CHECK_COMPLETE_V1', updates, upToDate, incompatible });
    };

    core.on('check:complete:v1', onCheckCompleteV1);

    core.checkUpdates(state.scanResult.identified, selectedVersion).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('check:complete:v1', onCheckCompleteV1);
    };
  }, [state.phase, state.selectedMCVersionIndex, state.mcVersions, state.scanResult]);

  // T022(b): Handle migration phase
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'migrating') return;

    const outputDir = path.join(dir, 'mods-updated');
    // Only migrate upToDate mods that are selected (not explicitly deselected)
    const selectedUpToDate = state.upToDate.filter(
      (m) => state.modSelections[m.projectId] !== false
    );

    const onMigrateComplete = (result: import('@upmods/core').MigrationResult) => {
      dispatch({ type: 'MIGRATION_RESULT', result });
    };

    const onMigrateError = (mod: import('@upmods/core').Mod, error: Error) => {
      const result: import('@upmods/core').MigrationResult = {
        mod,
        success: false,
        sourceDeleted: false,
        errorReason: error.message,
      };
      dispatch({ type: 'MIGRATION_RESULT', result });
    };

    const onAllMigrationsDone = (_results: import('@upmods/core').MigrationResult[]) => {
      dispatch({ type: 'ALL_MIGRATIONS_DONE' });
    };

    core.on('migrate:complete', onMigrateComplete);
    core.on('migrate:error', onMigrateError);
    core.on('all:migrations:done', onAllMigrationsDone);

    core.migrateCompatibleMods(selectedUpToDate, outputDir).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('migrate:complete', onMigrateComplete);
      core.off('migrate:error', onMigrateError);
      core.off('all:migrations:done', onAllMigrationsDone);
    };
  }, [state.phase]);

  // Handle download phase
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'downloading') return;

    const outputDir = path.join(dir, 'mods-updated');
    // T022(d): only download updates for selected mods
    const selectedUpdates = state.updates.filter(
      (u) => state.modSelections[u.mod.projectId] !== false
    );

    const onDownloadProgress = (
      update: import('@upmods/core').ModUpdate,
      bytesReceived: number,
      totalBytes: number
    ) => {
      dispatch({
        type: 'DOWNLOAD_PROGRESS',
        modName: update.mod.file.sha1,
        bytes: bytesReceived,
        total: totalBytes,
      });
    };

    const onDownloadComplete = (result: import('@upmods/core').DownloadResult) => {
      dispatch({ type: 'DOWNLOAD_RESULT', result });
    };

    const onDownloadError = (update: import('@upmods/core').ModUpdate, error: Error) => {
      const result: import('@upmods/core').DownloadResult = {
        update,
        success: false,
        errorReason: error.message,
      };
      dispatch({ type: 'DOWNLOAD_RESULT', result });
    };

    const onAllDone = (_results: import('@upmods/core').DownloadResult[]) => {
      dispatch({ type: 'DOWNLOAD_ALL_DONE' });
    };

    core.on('download:progress', onDownloadProgress);
    core.on('download:complete', onDownloadComplete);
    core.on('download:error', onDownloadError);
    core.on('all:done', onAllDone);

    core.downloadUpdates(selectedUpdates, outputDir).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('download:progress', onDownloadProgress);
      core.off('download:complete', onDownloadComplete);
      core.off('download:error', onDownloadError);
      core.off('all:done', onAllDone);
    };
  }, [state.phase]);

  const buildModRows = (): ModRow[] => {
    switch (state.phase) {
      case 'scan_complete':
        return (state.scanResult?.identified ?? []).map((mod, i) => ({
          name: (i === state.selectedMCVersionIndex ? '❯ ' : '  ') + mod.displayName,
          current: sanitizeVersionString(mod.installedVersionNumber),
          target: '—',
          status: 'IDENTIFIED',
          statusColor: 'cyan',
        }));

      case 'downloading': {
        const resultMap = new Map(
          state.downloadResults.map((r) => [r.update.mod.file.sha1, r]),
        );
        const selectedUpdates = state.updates.filter(
          (u) => state.modSelections[u.mod.projectId] !== false
        );
        return selectedUpdates.map((u) => {
          const result = resultMap.get(u.mod.file.sha1);
          if (result) {
            return {
              name: u.mod.displayName,
              current: sanitizeVersionString(u.mod.installedVersionNumber),
              target: sanitizeVersionString(u.latestVersionNumber),
              status: result.success ? '✓ DONE' : '✘ ERROR',
              statusColor: result.success ? 'greenBright' : 'red',
            };
          }
          return {
            name: u.mod.displayName,
            current: sanitizeVersionString(u.mod.installedVersionNumber),
            target: sanitizeVersionString(u.latestVersionNumber),
            status: 'downloading...',
            statusColor: 'cyan',
          };
        });
      }

      case 'done':
        return state.downloadResults.map((r) => ({
          name: r.update.mod.displayName,
          current: sanitizeVersionString(r.update.mod.installedVersionNumber),
          target: sanitizeVersionString(r.update.latestVersionNumber),
          status: r.success ? '✓ DONE' : '✘ ERROR',
          statusColor: r.success ? 'greenBright' : 'red',
        }));

      default:
        return [];
    }
  };

  const renderPhaseContent = () => {
    if (state.phase === 'error') {
      return <ErrorPhase state={state} />;
    }

    if (state.phase === 'scanning' || state.phase === 'identifying') {
      return <ScanPhase state={state} />;
    }

    if (state.phase === 'scan_complete') {
      const rows = buildModRows();
      const availableRows = termRows - 12;
      return (
        <Box flexDirection="column">
          {rows.length > 0 ? (
            <ModTable mods={rows} maxVisibleRows={availableRows} cursorIndex={state.selectedMCVersionIndex} />
          ) : (
            <ScanPhase state={state} />
          )}
          <Box marginTop={1} justifyContent="center">
            <Text dimColor>Press Enter to select MC version · Q to quit</Text>
          </Box>
        </Box>
      );
    }

    if (state.phase === 'version_select') {
      return (
        <VersionSelectPhase
          versions={state.mcVersions}
          selectedIndex={state.selectedMCVersionIndex}
        />
      );
    }

    if (state.phase === 'checking') {
      return <Text>Checking for updates…</Text>;
    }

    // T014: Replace check_complete placeholder with MultiSelectPhase
    if (state.phase === 'check_complete') {
      return (
        <MultiSelectPhase
          updates={state.updates}
          upToDate={state.upToDate}
          incompatibleMods={state.incompatibleMods}
          modSelections={state.modSelections}
          selectedIndex={state.selectedMCVersionIndex}
        />
      );
    }

    // T022(c): Migration phase display
    if (state.phase === 'migrating') {
      const selectedUpToDate = state.upToDate.filter(
        (m) => state.modSelections[m.projectId] !== false
      );
      return (
        <MigrationPhase
          migrationResults={state.migrationResults}
          totalMigrations={selectedUpToDate.length}
        />
      );
    }

    if (state.phase === 'restoring' || state.phase === 'recovery_prompt') {
      return <Text>Recovering previous session…</Text>;
    }

    if (state.phase === 'downloading') {
      const rows = buildModRows();
      const availableRows = termRows - 12;
      return (
        <Box flexDirection="column">
          <ModTable mods={rows} maxVisibleRows={availableRows} />
          <DownloadPhase
            updates={state.updates.filter((u) => state.modSelections[u.mod.projectId] !== false)}
            downloadResults={state.downloadResults}
            downloadProgress={state.downloadProgress}
          />
        </Box>
      );
    }

    if (state.phase === 'done') {
      const rows = buildModRows();
      const availableRows = termRows - 12;
      return (
        <Box flexDirection="column">
          <ModTable mods={rows} maxVisibleRows={availableRows} />
          <SummaryPhase
            downloadResults={state.downloadResults}
            outputDir={path.join(dir, 'mods-updated')}
          />
        </Box>
      );
    }

    return <Text>Loading…</Text>;
  };

  // Too-narrow guard: prevent entire UI from collapsing below minimum width
  if (termCols < 80) {
    return (
      <Box flexDirection="column" height={termRows}>
        <Box justifyContent="center" paddingY={0}>
          <Text bold color="cyan">UPMODS</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
          <Text color="red">Terminal too narrow — please resize to ≥ 80 columns.</Text>
          <Text dimColor>Current width: {termCols} cols · Minimum: 80 cols</Text>
        </Box>
        <ProgressFooter phase={state.phase} />
      </Box>
    );
  }

  return (
    // height={termRows} ensures every render occupies the full terminal height,
    // so Ink's line-erasure algorithm always clears the entire previous frame.
    // This eliminates "ghosting" when phases render fewer lines than the previous phase.
    <Box flexDirection="column" height={termRows}>
      <Box flexShrink={0} justifyContent="center">
        <Banner />
      </Box>
      <LanguageProvider
        locale={state.locale}
        toggleLanguage={() => dispatch({ type: 'TOGGLE_LANGUAGE' })}
      >
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {renderPhaseContent()}
        </Box>
      </LanguageProvider>
      <Box flexShrink={0} justifyContent="center">
        <ProgressFooter phase={state.phase} />
      </Box>
    </Box>
  );
}
