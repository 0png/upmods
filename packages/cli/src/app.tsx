import React, { useReducer, useRef, useEffect } from 'react';
import path from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
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
import { UpmodsCore, sanitizeVersionString } from '@upmods/core';

interface AppProps {
  dir: string;
}

export function App({ dir }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();
  const coreRef = useRef<UpmodsCore | null>(null);

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') exit();
    if (input === 'l' || input === 'L') dispatch({ type: 'TOGGLE_LANGUAGE' });

    // Proceed from scan summary to version select
    if (state.phase === 'scan_complete' && key.return) {
      dispatch({ type: 'PROCEED_TO_VERSION_SELECT' });
    }

    // Version select navigation
    if (state.phase === 'version_select') {
      if (key.upArrow) dispatch({ type: 'CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'CURSOR_DOWN' });
      if (key.return) dispatch({ type: 'SELECT_MC_VERSION' });
    }

    // Download trigger
    if (state.phase === 'check_complete' && (input === 'u' || input === 'U')) {
      dispatch({ type: 'START_DOWNLOAD' });
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

    const onCheckComplete = (
      updates: import('@upmods/core').ModUpdate[],
      upToDate: import('@upmods/core').Mod[]
    ) => {
      dispatch({ type: 'CHECK_COMPLETE', updates, upToDate });
    };

    core.on('check:complete', onCheckComplete);

    core.checkUpdates(state.scanResult.identified, selectedVersion).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('check:complete', onCheckComplete);
    };
  }, [state.phase, state.selectedMCVersionIndex, state.mcVersions, state.scanResult]);

  // Handle download phase
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'downloading') return;

    const outputDir = path.join(dir, 'mods-updated');

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

    core.downloadUpdates(state.updates, outputDir).catch((err: unknown) => {
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
        return (state.scanResult?.identified ?? []).map((mod) => ({
          name: mod.displayName,
          current: sanitizeVersionString(mod.installedVersionNumber),
          target: '—',
          status: 'IDENTIFIED',
          statusColor: 'cyan',
        }));

      case 'check_complete':
        return state.updates.map((u) => ({
          name: u.mod.displayName,
          current: sanitizeVersionString(u.mod.installedVersionNumber),
          target: sanitizeVersionString(u.latestVersionNumber),
          status: 'pending',
          statusColor: 'yellow',
        }));

      case 'downloading': {
        const resultMap = new Map(
          state.downloadResults.map((r) => [r.update.mod.file.sha1, r]),
        );
        return state.updates.map((u) => {
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
      return (
        <Box flexDirection="column">
          {rows.length > 0 ? (
            <ModTable mods={rows} />
          ) : (
            <ScanPhase state={state} />
          )}
          <Box marginTop={1}>
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

    if (state.phase === 'check_complete') {
      const rows = buildModRows();
      return (
        <Box flexDirection="column">
          {rows.length > 0 ? (
            <ModTable mods={rows} />
          ) : (
            <Text color="green">All mods are up to date.</Text>
          )}
          <Box marginTop={1}>
            <Text dimColor>Press U to update · Q to quit</Text>
          </Box>
        </Box>
      );
    }

    if (state.phase === 'downloading') {
      const rows = buildModRows();
      return (
        <Box flexDirection="column">
          <ModTable mods={rows} />
          <DownloadPhase
            updates={state.updates}
            downloadResults={state.downloadResults}
            downloadProgress={state.downloadProgress}
          />
        </Box>
      );
    }

    if (state.phase === 'done') {
      const rows = buildModRows();
      return (
        <Box flexDirection="column">
          <ModTable mods={rows} />
          <SummaryPhase
            downloadResults={state.downloadResults}
            outputDir={path.join(dir, 'mods-updated')}
          />
        </Box>
      );
    }

    if (state.phase === 'recovery_prompt' || state.phase === 'restoring') {
      return <Text>Recovering previous session…</Text>;
    }

    if (state.phase === 'migrating') {
      return <Text>Migrating mods…</Text>;
    }

    return <Text>Loading…</Text>;
  };

  return (
    <Box flexDirection="column">
      <Banner />
      <LanguageProvider
        locale={state.locale}
        toggleLanguage={() => dispatch({ type: 'TOGGLE_LANGUAGE' })}
      >
        <Box flexGrow={1}>
          {renderPhaseContent()}
        </Box>
      </LanguageProvider>
      <ProgressFooter phase={state.phase} />
    </Box>
  );
}
