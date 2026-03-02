import React, { useReducer, useRef, useEffect } from 'react';
import { Text, useApp, useInput } from 'ink';
import { LanguageProvider } from './i18n/use-language.js';
import { reducer, initialState } from './state/reducer.js';
import { ErrorPhase } from './components/error-phase.js';
import { ScanPhase } from './components/scan-phase.js';
import { UpmodsCore } from '@upmods/core';

interface AppProps {
  dir: string;
}

export function App({ dir }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();
  const coreRef = useRef<UpmodsCore | null>(null);

  useInput((input) => {
    if (input === 'q' || input === 'Q') exit();
    if (input === 'l' || input === 'L') dispatch({ type: 'TOGGLE_LANGUAGE' });
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

  const renderPhase = () => {
    if (state.phase === 'error') {
      return <ErrorPhase state={state} />;
    }
    if (state.phase === 'scanning' || state.phase === 'identifying' || state.phase === 'scan_complete') {
      return <ScanPhase state={state} />;
    }
    // Future phases (US2-US4) — placeholder
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
