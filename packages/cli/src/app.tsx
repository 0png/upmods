import React, { useReducer } from 'react';
import { Text, useApp, useInput } from 'ink';
import { LanguageProvider } from './i18n/use-language.js';
import { reducer, initialState } from './state/reducer.js';
import { ErrorPhase } from './components/error-phase.js';

interface AppProps {
  dir: string;
}

export function App({ dir: _dir }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q' || input === 'Q') exit();
    if (input === 'l' || input === 'L') dispatch({ type: 'TOGGLE_LANGUAGE' });
  });

  return (
    <LanguageProvider
      locale={state.locale}
      toggleLanguage={() => dispatch({ type: 'TOGGLE_LANGUAGE' })}
    >
      {state.phase === 'error' ? (
        <ErrorPhase state={state} />
      ) : (
        <Text>Loading…</Text>
      )}
    </LanguageProvider>
  );
}
