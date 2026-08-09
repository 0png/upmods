import React, { useReducer, useRef, useEffect } from 'react';
import path from 'node:path';
import { Text, useApp, useInput } from 'ink';
import { LanguageProvider } from './i18n/use-language.js';
import { reducer, initialState } from './state/reducer.js';
import { ErrorPhase } from './components/error-phase.js';
import { ScanPhase } from './components/scan-phase.js';
import { VersionSelectPhase } from './components/version-select-phase.js';
import { CheckPhase } from './components/check-phase.js';
import { CheckingPhase } from './components/checking-phase.js';
import { DownloadPhase } from './components/download-phase.js';
import { SummaryPhase } from './components/summary-phase.js';
import { LoaderSelectPhase } from './components/loader-select-phase.js';
import {
  MigrationLoadingPhase,
  MigrationReviewPhase,
  MigrationSummaryPhase,
} from './components/migration-phase.js';
import { getWorkflowStep } from './state/workflow.js';
import { getInstalledVersionUrl, getUpdateVersionUrl, openExternalUrl } from './utils/modrinth.js';
import { UpmodsCore } from '@upmods/core';

interface AppProps {
  dir: string;
}

function getMigrationOutputDir(dir: string, loader: string, mcVersion: string): string {
  const environmentName = `${loader}-${mcVersion}`.replace(/[^a-zA-Z0-9._-]/g, '-');
  return path.join(dir, 'mods-updated', environmentName);
}

export function App({ dir }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();
  const coreRef = useRef<UpmodsCore | null>(null);

  const openSelectedModrinthLink = () => {
    if (state.phase === 'check_complete') {
      if (state.checkCursorIndex < state.updates.length) {
        const update = state.updates[state.checkCursorIndex];
        if (update) openExternalUrl(getUpdateVersionUrl(update));
        return;
      }

      const mod = state.upToDate[state.checkCursorIndex - state.updates.length];
      if (mod) openExternalUrl(getInstalledVersionUrl(mod));
      return;
    }

    if (state.phase === 'downloading') {
      const update = state.activeDownloads[state.downloadCursorIndex];
      if (update) openExternalUrl(getUpdateVersionUrl(update));
      return;
    }

    if (state.phase === 'done') {
      const failed = state.downloadResults.filter((result) => !result.success);
      const result = failed[state.summaryCursorIndex];
      if (result) openExternalUrl(getUpdateVersionUrl(result.update));
      return;
    }

    if (state.phase === 'migration_review') {
      const entry = state.migrationPlan?.entries[state.migrationCursorIndex];
      if (entry?.projectSlug && entry.targetVersionId) {
        openExternalUrl(`https://modrinth.com/mod/${entry.projectSlug}/version/${entry.targetVersionId}`);
      }
    }
  };

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') exit();
    if (input === 'l' || input === 'L') dispatch({ type: 'TOGGLE_LANGUAGE' });

    // Proceed from scan summary to version select
    if (state.phase === 'scan_complete' && key.return) {
      dispatch({ type: 'PROCEED_TO_VERSION_SELECT' });
    }
    if (state.phase === 'scan_complete') {
      if (key.upArrow) dispatch({ type: 'SCAN_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'SCAN_CURSOR_DOWN' });
    }

    // Version select navigation
    if (state.phase === 'version_select') {
      if (key.upArrow) dispatch({ type: 'CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'CURSOR_DOWN' });
      if (key.return) dispatch({ type: 'SELECT_MC_VERSION' });
    }

    if (state.phase === 'loader_select') {
      if (key.upArrow) dispatch({ type: 'LOADER_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'LOADER_CURSOR_DOWN' });
      if (key.return) dispatch({ type: 'CONFIRM_LOADER_SELECTION' });
      if ((input === 's' || input === 'S') && state.loaderSelectionMode === 'target') {
        dispatch({ type: 'EDIT_SOURCE_LOADER' });
      }
    }

    // Download trigger
    if (state.phase === 'check_complete') {
      if (key.upArrow) dispatch({ type: 'CHECK_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'CHECK_CURSOR_DOWN' });
      if (input === ' ') dispatch({ type: 'TOGGLE_UPDATE_SELECTION' });
      if (input === 'a' || input === 'A') dispatch({ type: 'SELECT_ALL_UPDATES' });
      if (input === 'n' || input === 'N') dispatch({ type: 'CLEAR_ALL_UPDATES' });
      if (input === 'o' || input === 'O') openSelectedModrinthLink();
      if (input === 'u' || input === 'U') dispatch({ type: 'START_DOWNLOAD' });
    }

    if (state.phase === 'downloading') {
      if (key.upArrow) dispatch({ type: 'DOWNLOAD_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'DOWNLOAD_CURSOR_DOWN' });
      if (input === 'o' || input === 'O') openSelectedModrinthLink();
    }

    if (state.phase === 'migration_review') {
      if (key.upArrow) dispatch({ type: 'MIGRATION_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'MIGRATION_CURSOR_DOWN' });
      if (input === ' ') dispatch({ type: 'TOGGLE_OPTIONAL_DEPENDENCY' });
      if (input === 'a' || input === 'A') dispatch({ type: 'SELECT_ALL_OPTIONAL_DEPENDENCIES' });
      if (input === 'n' || input === 'N') dispatch({ type: 'CLEAR_OPTIONAL_DEPENDENCIES' });
      if (input === 'o' || input === 'O') openSelectedModrinthLink();
      if (input === 'u' || input === 'U') dispatch({ type: 'START_MIGRATION_BUILD' });
    }

    if (state.phase === 'done') {
      if (key.upArrow) dispatch({ type: 'SUMMARY_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'SUMMARY_CURSOR_DOWN' });
      if (
        (input === 'a' || input === 'A')
        && state.downloadResults.some((result) => result.success)
        && !state.lastApplyResult
      ) {
        dispatch({ type: 'START_APPLY' });
      }
      if ((input === 'r' || input === 'R') && state.lastBackupSession) {
        dispatch({ type: 'START_ROLLBACK' });
      }
      if (input === 'o' || input === 'O') openSelectedModrinthLink();
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

      core.getModLoaders().then((loaders) => {
        dispatch({
          type: 'MOD_LOADERS_LOADED',
          loaders,
          detection: core.detectSourceLoader(result.identified),
        });
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

    core.checkUpdates(
      state.scanResult.identified,
      selectedVersion,
      state.selectedTargetLoader ?? undefined,
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('check:complete', onCheckComplete);
    };
  }, [
    state.phase,
    state.selectedMCVersionIndex,
    state.mcVersions,
    state.scanResult,
    state.selectedTargetLoader,
  ]);

  // Analyze a cross-loader migration after the target environment is confirmed.
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'migration_checking' || !state.scanResult) return;
    if (!state.selectedMCVersion || !state.selectedSourceLoader || !state.selectedTargetLoader) return;

    core.planLoaderMigration(
      state.scanResult.identified,
      state.selectedMCVersion,
      state.selectedSourceLoader,
      state.selectedTargetLoader,
    ).then((plan) => {
      dispatch({ type: 'MIGRATION_PLAN_COMPLETE', plan });
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });
  }, [
    state.phase,
    state.scanResult,
    state.selectedMCVersion,
    state.selectedSourceLoader,
    state.selectedTargetLoader,
  ]);

  // Build the complete target-loader mod set in its managed output directory.
  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'migration_building' || !state.migrationPlan) return;
    if (!state.selectedMCVersion || !state.selectedTargetLoader) return;

    const outputDir = getMigrationOutputDir(dir, state.selectedTargetLoader, state.selectedMCVersion);
    const selectedOptionalEntryIds = Object.entries(state.selectedOptionalEntries)
      .filter(([, selected]) => selected)
      .map(([entryId]) => entryId);
    const onProgress = (
      entry: import('@upmods/core').MigrationEntry,
      bytesReceived: number,
      totalBytes: number,
    ) => {
      dispatch({
        type: 'MIGRATION_PROGRESS',
        entryId: entry.id,
        bytes: bytesReceived,
        total: totalBytes,
      });
    };
    core.on('migration:progress', onProgress);
    core.materializeMigration(
      state.migrationPlan,
      selectedOptionalEntryIds,
      outputDir,
    ).then((result) => {
      dispatch({ type: 'MIGRATION_COMPLETE', result });
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      core.off('migration:progress', onProgress);
    };
  }, [
    state.phase,
    state.migrationPlan,
    state.selectedOptionalEntries,
    state.selectedMCVersion,
    state.selectedTargetLoader,
    dir,
  ]);

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

    core.downloadUpdates(state.activeDownloads, outputDir).catch((err: unknown) => {
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

  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'applying') return;

    const outputDir = path.join(dir, 'mods-updated');
    const successfulUpdates = state.downloadResults
      .filter((result) => result.success)
      .map((result) => result.update);

    core.applyUpdates(successfulUpdates, outputDir, dir).then((result) => {
      dispatch({ type: 'APPLY_COMPLETE', result });
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });
  }, [state.phase, state.downloadResults, dir]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core || state.phase !== 'rollbacking') return;

    core.rollbackLatestSession(dir).then((result) => {
      dispatch({ type: 'ROLLBACK_COMPLETE', result });
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', message });
    });
  }, [state.phase, dir]);

  const renderPhase = () => {
    const workflowStep = getWorkflowStep(state.phase);

    if (state.phase === 'error') {
      return <ErrorPhase state={state} />;
    }
    if (state.phase === 'scanning' || state.phase === 'identifying' || state.phase === 'scan_complete') {
      return <ScanPhase state={state} workflowStep={workflowStep} />;
    }
    if (state.phase === 'version_select') {
      return (
        <VersionSelectPhase
          versions={state.mcVersions}
          selectedIndex={state.selectedMCVersionIndex}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'loader_select') {
      return (
        <LoaderSelectPhase
          loaders={state.modLoaders}
          detection={state.loaderDetection}
          mode={state.loaderSelectionMode}
          sourceIndex={state.sourceLoaderIndex}
          targetIndex={state.targetLoaderIndex}
          selectedSourceLoader={state.selectedSourceLoader}
          mcVersion={state.selectedMCVersion}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'checking') {
      return <CheckingPhase workflowStep={workflowStep} />;
    }
    if (state.phase === 'migration_checking') {
      return <MigrationLoadingPhase building={false} workflowStep={workflowStep} />;
    }
    if (state.phase === 'migration_building') {
      return <MigrationLoadingPhase building workflowStep={workflowStep} />;
    }
    if (state.phase === 'applying') {
      return (
        <CheckingPhase
          workflowStep={workflowStep}
          title={state.locale === 'en' ? 'Apply' : '套用更新'}
          subtitle={state.locale === 'en'
            ? 'Copy downloaded updates into your mods folder.'
            : '把已下載的更新覆蓋到你的 mods 資料夾。'}
          inProgress={state.locale === 'en'
            ? 'Applying downloaded updates…'
            : '正在套用已下載的更新…'}
          summary={state.locale === 'en'
            ? 'Creating backup session before overwriting installed mods…'
            : '覆蓋前正在建立備份 session…'}
        />
      );
    }
    if (state.phase === 'rollbacking') {
      return (
        <CheckingPhase
          workflowStep={workflowStep}
          title={state.locale === 'en' ? 'Rollback' : '回滾'}
          subtitle={state.locale === 'en'
            ? 'Restore the latest backup session into your mods folder.'
            : '將最新備份 session 還原回你的 mods 資料夾。'}
          inProgress={state.locale === 'en'
            ? 'Restoring the latest backup session…'
            : '正在還原最新備份 session…'}
          summary={state.locale === 'en'
            ? 'Reverting installed mods to the previous versions…'
            : '正在把已安裝模組回復到先前版本…'}
        />
      );
    }
    if (state.phase === 'check_complete') {
      return (
        <CheckPhase
          updates={state.updates}
          selectedUpdates={state.selectedUpdates}
          checkCursorIndex={state.checkCursorIndex}
          upToDate={state.upToDate}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'migration_review' && state.migrationPlan) {
      return (
        <MigrationReviewPhase
          plan={state.migrationPlan}
          cursorIndex={state.migrationCursorIndex}
          selectedOptionalEntries={state.selectedOptionalEntries}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'downloading') {
      return (
        <DownloadPhase
          updates={state.activeDownloads}
          downloadResults={state.downloadResults}
          downloadProgress={state.downloadProgress}
          downloadCursorIndex={state.downloadCursorIndex}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'done') {
      return (
        <SummaryPhase
          downloadResults={state.downloadResults}
          outputDir={path.join(dir, 'mods-updated')}
          summaryCursorIndex={state.summaryCursorIndex}
          lastBackupSession={state.lastBackupSession}
          lastApplyResult={state.lastApplyResult}
          lastRollbackResult={state.lastRollbackResult}
          workflowStep={workflowStep}
        />
      );
    }
    if (state.phase === 'migration_done' && state.migrationResult) {
      return (
        <MigrationSummaryPhase
          result={state.migrationResult}
          workflowStep={workflowStep}
        />
      );
    }
    return <Text>Loading…</Text>;
  };

  return (
    <LanguageProvider
      locale={state.locale}
      toggleLanguage={() => dispatch({ type: 'TOGGLE_LANGUAGE' })}
    >
      {renderPhase()}
    </LanguageProvider>
  );
}
