import type { ScanResult, MCVersion, ModUpdate, Mod, DownloadResult } from '@upmods/core';

export type AppPhase =
  | 'scanning'
  | 'identifying'
  | 'scan_complete'
  | 'version_select'
  | 'checking'
  | 'check_complete'
  | 'downloading'
  | 'done'
  | 'error';

export interface AppState {
  phase: AppPhase;
  scanResult: ScanResult | null;
  mcVersions: MCVersion[];
  selectedMCVersionIndex: number;
  selectedMCVersion: string | null;
  updates: ModUpdate[];
  upToDate: Mod[];
  downloadResults: DownloadResult[];
  errorMessage: string | null;
  locale: 'en' | 'zh-TW';
}

export type AppAction =
  | { type: 'SCAN_PROGRESS'; done: number; total: number }
  | { type: 'SCAN_COMPLETE'; result: ScanResult }
  | { type: 'PROCEED_TO_VERSION_SELECT' }
  | { type: 'MC_VERSIONS_LOADED'; versions: MCVersion[] }
  | { type: 'CURSOR_UP' }
  | { type: 'CURSOR_DOWN' }
  | { type: 'SELECT_MC_VERSION' }
  | { type: 'CHECK_COMPLETE'; updates: ModUpdate[]; upToDate: Mod[] }
  | { type: 'START_DOWNLOAD' }
  | { type: 'DOWNLOAD_PROGRESS'; modName: string; bytes: number; total: number }
  | { type: 'DOWNLOAD_RESULT'; result: DownloadResult }
  | { type: 'DOWNLOAD_ALL_DONE' }
  | { type: 'TOGGLE_LANGUAGE' }
  | { type: 'QUIT' }
  | { type: 'ERROR'; message: string };

export const initialState: AppState = {
  phase: 'scanning',
  scanResult: null,
  mcVersions: [],
  selectedMCVersionIndex: 0,
  selectedMCVersion: null,
  updates: [],
  upToDate: [],
  downloadResults: [],
  errorMessage: null,
  locale: 'en',
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SCAN_PROGRESS':
      return { ...state, phase: 'scanning' };
    case 'SCAN_COMPLETE':
      return { ...state, phase: 'scan_complete', scanResult: action.result };
    case 'PROCEED_TO_VERSION_SELECT':
      return { ...state, phase: 'version_select' };
    case 'MC_VERSIONS_LOADED':
      return {
        ...state,
        mcVersions: action.versions,
        selectedMCVersionIndex: 0,
      };
    case 'CURSOR_UP':
      return {
        ...state,
        selectedMCVersionIndex: Math.max(0, state.selectedMCVersionIndex - 1),
      };
    case 'CURSOR_DOWN':
      return {
        ...state,
        selectedMCVersionIndex: Math.min(
          state.mcVersions.length - 1,
          state.selectedMCVersionIndex + 1,
        ),
      };
    case 'SELECT_MC_VERSION':
      return {
        ...state,
        phase: 'checking',
        selectedMCVersion:
          state.mcVersions[state.selectedMCVersionIndex]?.version ?? null,
      };
    case 'CHECK_COMPLETE':
      return {
        ...state,
        phase: 'check_complete',
        updates: action.updates,
        upToDate: action.upToDate,
      };
    case 'START_DOWNLOAD':
      return { ...state, phase: 'downloading' };
    case 'DOWNLOAD_PROGRESS':
      return state;
    case 'DOWNLOAD_RESULT':
      return {
        ...state,
        downloadResults: [...state.downloadResults, action.result],
      };
    case 'DOWNLOAD_ALL_DONE':
      return { ...state, phase: 'done' };
    case 'TOGGLE_LANGUAGE':
      return { ...state, locale: state.locale === 'en' ? 'zh-TW' : 'en' };
    case 'QUIT':
      return state;
    case 'ERROR':
      return { ...state, phase: 'error', errorMessage: action.message };
    default:
      return state;
  }
}
