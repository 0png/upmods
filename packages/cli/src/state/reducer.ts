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
  scanCursorIndex: number;
  mcVersions: MCVersion[];
  selectedMCVersionIndex: number;
  selectedMCVersion: string | null;
  updates: ModUpdate[];
  selectedUpdates: Record<string, boolean>;
  checkCursorIndex: number;
  activeDownloads: ModUpdate[];
  downloadCursorIndex: number;
  upToDate: Mod[];
  downloadResults: DownloadResult[];
  /** Per-mod SHA-1 → { bytes, total } for live progress display */
  downloadProgress: Record<string, { bytes: number; total: number }>;
  summaryCursorIndex: number;
  errorMessage: string | null;
  locale: 'en' | 'zh-TW';
}

export type AppAction =
  | { type: 'SCAN_PROGRESS'; done: number; total: number }
  | { type: 'SCAN_COMPLETE'; result: ScanResult }
  | { type: 'SCAN_CURSOR_UP' }
  | { type: 'SCAN_CURSOR_DOWN' }
  | { type: 'PROCEED_TO_VERSION_SELECT' }
  | { type: 'MC_VERSIONS_LOADED'; versions: MCVersion[] }
  | { type: 'CURSOR_UP' }
  | { type: 'CURSOR_DOWN' }
  | { type: 'SELECT_MC_VERSION' }
  | { type: 'CHECK_COMPLETE'; updates: ModUpdate[]; upToDate: Mod[] }
  | { type: 'CHECK_CURSOR_UP' }
  | { type: 'CHECK_CURSOR_DOWN' }
  | { type: 'TOGGLE_UPDATE_SELECTION' }
  | { type: 'SELECT_ALL_UPDATES' }
  | { type: 'CLEAR_ALL_UPDATES' }
  | { type: 'START_DOWNLOAD' }
  | { type: 'DOWNLOAD_CURSOR_UP' }
  | { type: 'DOWNLOAD_CURSOR_DOWN' }
  | { type: 'DOWNLOAD_PROGRESS'; modName: string; bytes: number; total: number }
  | { type: 'DOWNLOAD_RESULT'; result: DownloadResult }
  | { type: 'DOWNLOAD_ALL_DONE' }
  | { type: 'SUMMARY_CURSOR_UP' }
  | { type: 'SUMMARY_CURSOR_DOWN' }
  | { type: 'TOGGLE_LANGUAGE' }
  | { type: 'QUIT' }
  | { type: 'ERROR'; message: string };

export const initialState: AppState = {
  phase: 'scanning',
  scanResult: null,
  scanCursorIndex: 0,
  mcVersions: [],
  selectedMCVersionIndex: 0,
  selectedMCVersion: null,
  updates: [],
  selectedUpdates: {},
  checkCursorIndex: 0,
  activeDownloads: [],
  downloadCursorIndex: 0,
  upToDate: [],
  downloadResults: [],
  downloadProgress: {},
  summaryCursorIndex: 0,
  errorMessage: null,
  locale: 'en',
};

function getUpdateSelectionMap(updates: ModUpdate[]): Record<string, boolean> {
  return Object.fromEntries(
    updates.map((update) => [update.mod.file.sha1, true]),
  );
}

function getSelectedDownloads(state: AppState): ModUpdate[] {
  return state.updates.filter(
    (update) => state.selectedUpdates[update.mod.file.sha1],
  );
}

function getCheckListTotal(state: AppState): number {
  return state.updates.length + state.upToDate.length;
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SCAN_PROGRESS':
      return { ...state, phase: 'scanning' };
    case 'SCAN_COMPLETE':
      return {
        ...state,
        phase: 'scan_complete',
        scanResult: action.result,
        scanCursorIndex: 0,
      };
    case 'SCAN_CURSOR_UP': {
      const total = (state.scanResult?.identified.length ?? 0) + (state.scanResult?.unidentified.length ?? 0);
      if (total <= 1) return state;
      return {
        ...state,
        scanCursorIndex: state.scanCursorIndex === 0 ? total - 1 : state.scanCursorIndex - 1,
      };
    }
    case 'SCAN_CURSOR_DOWN': {
      const total = (state.scanResult?.identified.length ?? 0) + (state.scanResult?.unidentified.length ?? 0);
      if (total <= 1) return state;
      return {
        ...state,
        scanCursorIndex: state.scanCursorIndex === total - 1 ? 0 : state.scanCursorIndex + 1,
      };
    }
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
        selectedUpdates: getUpdateSelectionMap(action.updates),
        checkCursorIndex: 0,
        activeDownloads: [],
        downloadCursorIndex: 0,
        upToDate: action.upToDate,
        downloadResults: [],
        downloadProgress: {},
        summaryCursorIndex: 0,
      };
    case 'CHECK_CURSOR_UP':
      if (getCheckListTotal(state) <= 1) return state;
      return {
        ...state,
        checkCursorIndex: state.checkCursorIndex === 0
          ? getCheckListTotal(state) - 1
          : state.checkCursorIndex - 1,
      };
    case 'CHECK_CURSOR_DOWN':
      if (getCheckListTotal(state) <= 1) return state;
      return {
        ...state,
        checkCursorIndex: state.checkCursorIndex === getCheckListTotal(state) - 1
          ? 0
          : state.checkCursorIndex + 1,
      };
    case 'TOGGLE_UPDATE_SELECTION': {
      const update = state.updates[state.checkCursorIndex];
      if (!update) return state;

      const sha1 = update.mod.file.sha1;
      return {
        ...state,
        selectedUpdates: {
          ...state.selectedUpdates,
          [sha1]: !state.selectedUpdates[sha1],
        },
      };
    }
    case 'SELECT_ALL_UPDATES':
      return {
        ...state,
        selectedUpdates: getUpdateSelectionMap(state.updates),
      };
    case 'CLEAR_ALL_UPDATES':
      return {
        ...state,
        selectedUpdates: Object.fromEntries(
          state.updates.map((update) => [update.mod.file.sha1, false]),
        ),
      };
    case 'START_DOWNLOAD':
      {
        const activeDownloads = getSelectedDownloads(state);
        if (activeDownloads.length === 0) return state;

        return {
          ...state,
          phase: 'downloading',
          activeDownloads,
          downloadCursorIndex: 0,
          downloadResults: [],
          downloadProgress: {},
          summaryCursorIndex: 0,
        };
      }
    case 'DOWNLOAD_CURSOR_UP':
      if (state.activeDownloads.length <= 1) return state;
      return {
        ...state,
        downloadCursorIndex: state.downloadCursorIndex === 0
          ? state.activeDownloads.length - 1
          : state.downloadCursorIndex - 1,
      };
    case 'DOWNLOAD_CURSOR_DOWN':
      if (state.activeDownloads.length <= 1) return state;
      return {
        ...state,
        downloadCursorIndex: state.downloadCursorIndex === state.activeDownloads.length - 1
          ? 0
          : state.downloadCursorIndex + 1,
      };
    case 'DOWNLOAD_PROGRESS':
      return {
        ...state,
        downloadProgress: {
          ...state.downloadProgress,
          [action.modName]: { bytes: action.bytes, total: action.total },
        },
      };
    case 'DOWNLOAD_RESULT':
      return {
        ...state,
        downloadResults: [...state.downloadResults, action.result],
      };
    case 'DOWNLOAD_ALL_DONE':
      return {
        ...state,
        phase: 'done',
        summaryCursorIndex: 0,
      };
    case 'SUMMARY_CURSOR_UP':
      if (state.downloadResults.filter((result) => !result.success).length <= 1) return state;
      return {
        ...state,
        summaryCursorIndex: state.summaryCursorIndex === 0
          ? state.downloadResults.filter((result) => !result.success).length - 1
          : state.summaryCursorIndex - 1,
      };
    case 'SUMMARY_CURSOR_DOWN': {
      const failedCount = state.downloadResults.filter((result) => !result.success).length;
      if (failedCount <= 1) return state;
      return {
        ...state,
        summaryCursorIndex: state.summaryCursorIndex === failedCount - 1
          ? 0
          : state.summaryCursorIndex + 1,
      };
    }
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
