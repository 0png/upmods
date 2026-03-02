import React, { useReducer, useRef, useEffect } from 'react';
import { Text, useApp, useInput } from 'ink';
import { LanguageProvider } from './i18n/use-language.js';
import { reducer, initialState } from './state/reducer.js';
import { ErrorPhase } from './components/error-phase.js';
import { ScanPhase } from './components/scan-phase.js';
import { VersionSelectPhase } from './components/version-select-phase.js';
import { CheckPhase } from './components/check-phase.js';
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

  const renderPhase = () => {
    if (state.phase === 'error') {
      return <ErrorPhase state={state} />;
    }
    if (state.phase === 'scanning' || state.phase === 'identifying' || state.phase === 'scan_complete') {
      return <ScanPhase state={state} />;
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
      return <CheckPhase updates={state.updates} upToDate={state.upToDate} />;
    }
    // Future phases (US3-US4) — placeholder
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
