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
import { getWorkflowStep } from './state/workflow.js';
import { UpmodsCore } from '@upmods/core';

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

    // Download trigger
    if (state.phase === 'check_complete') {
      if (key.upArrow) dispatch({ type: 'CHECK_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'CHECK_CURSOR_DOWN' });
      if (input === ' ') dispatch({ type: 'TOGGLE_UPDATE_SELECTION' });
      if (input === 'a' || input === 'A') dispatch({ type: 'SELECT_ALL_UPDATES' });
      if (input === 'n' || input === 'N') dispatch({ type: 'CLEAR_ALL_UPDATES' });
      if (input === 'u' || input === 'U') dispatch({ type: 'START_DOWNLOAD' });
    }

    if (state.phase === 'downloading') {
      if (key.upArrow) dispatch({ type: 'DOWNLOAD_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'DOWNLOAD_CURSOR_DOWN' });
    }

    if (state.phase === 'done') {
      if (key.upArrow) dispatch({ type: 'SUMMARY_CURSOR_UP' });
      if (key.downArrow) dispatch({ type: 'SUMMARY_CURSOR_DOWN' });
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
    if (state.phase === 'checking') {
      return <CheckingPhase workflowStep={workflowStep} />;
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
