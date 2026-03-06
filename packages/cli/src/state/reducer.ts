import type { ScanResult, MCVersion, ModUpdate, Mod, DownloadResult, MigrationResult, SessionSnapshot } from '@upmods/core';

export type AppPhase =
  | 'recovery_prompt'
  | 'restoring'
  | 'scanning'
  | 'identifying'
  | 'scan_complete'
  | 'version_select'
  | 'checking'
  | 'check_complete'
  | 'migrating'
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
  incompatibleMods: Mod[];
  downloadResults: DownloadResult[];
  /** Per-mod SHA-1 → { bytes, total } for live progress display */
  downloadProgress: Record<string, { bytes: number; total: number }>;
  migrationResults: MigrationResult[];
  modSelections: Record<string, boolean>;
  recoverySnapshot: SessionSnapshot | null;
  snapshotPath: string | null;
  errorMessage: string | null;
  locale: 'en' | 'zh-TW';
}

export type AppAction =
  | { type: 'SCAN_PROGRESS'; done: number; total: number }
  | { type: 'SCAN_COMPLETE'; result: ScanResult }
  | { type: 'PROCEED_TO_VERSION_SELECT' }
  | { type: 'MC_VERSIONS_LOADED'; versions: MCVersion[] }
  | { type: 'CURSOR_UP' }
  | { type: 'CURSOR_DOWN'; max?: number }
  | { type: 'SET_CURSOR'; index: number }
  | { type: 'SELECT_MC_VERSION' }
  | { type: 'CHECK_COMPLETE'; updates: ModUpdate[]; upToDate: Mod[] }
  | { type: 'START_DOWNLOAD' }
  | { type: 'DOWNLOAD_PROGRESS'; modName: string; bytes: number; total: number }
  | { type: 'DOWNLOAD_RESULT'; result: DownloadResult }
  | { type: 'DOWNLOAD_ALL_DONE' }
  | { type: 'TOGGLE_LANGUAGE' }
  | { type: 'QUIT' }
  | { type: 'ERROR'; message: string }
  // V1 actions
  | { type: 'RECOVERY_DETECTED'; snapshot: SessionSnapshot }
  | { type: 'RECOVERY_CONFIRMED' }
  | { type: 'RECOVERY_DECLINED' }
  | { type: 'RECOVERY_COMPLETE'; restoredCount: number; failedCount: number }
  | { type: 'CHECK_COMPLETE_V1'; updates: ModUpdate[]; upToDate: Mod[]; incompatible: Mod[] }
  | { type: 'TOGGLE_MOD_SELECTION'; projectId: string }
  | { type: 'CONFIRM_SELECTION' }
  | { type: 'SNAPSHOT_WRITTEN'; snapshotPath: string }
  | { type: 'MIGRATION_RESULT'; result: MigrationResult }
  | { type: 'ALL_MIGRATIONS_DONE' }
  | { type: 'INTEGRITY_RESULT'; modName: string; passed: boolean };

export const initialState: AppState = {
  phase: 'scanning',
  scanResult: null,
  mcVersions: [],
  selectedMCVersionIndex: 0,
  selectedMCVersion: null,
  updates: [],
  upToDate: [],
  incompatibleMods: [],
  downloadResults: [],
  downloadProgress: {},
  migrationResults: [],
  modSelections: {},
  recoverySnapshot: null,
  snapshotPath: null,
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
      return { ...state, phase: 'version_select', selectedMCVersionIndex: 0 };
    case 'MC_VERSIONS_LOADED':
      return {
        ...state,
        mcVersions: action.versions,
      };
    case 'SET_CURSOR':
      return { ...state, selectedMCVersionIndex: action.index };
    case 'CURSOR_UP':
      return {
        ...state,
        selectedMCVersionIndex: Math.max(0, state.selectedMCVersionIndex - 1),
      };
    case 'CURSOR_DOWN': {
      const upperBound = action.max !== undefined ? action.max : state.mcVersions.length - 1;
      return {
        ...state,
        selectedMCVersionIndex: Math.min(upperBound, state.selectedMCVersionIndex + 1),
      };
    }
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
      return { ...state, phase: 'done' };
    case 'TOGGLE_LANGUAGE':
      return { ...state, locale: state.locale === 'en' ? 'zh-TW' : 'en' };
    case 'QUIT':
      return state;
    case 'ERROR':
      return { ...state, phase: 'error', errorMessage: action.message };

    // V1 reducer cases
    case 'RECOVERY_DETECTED':
      return { ...state, phase: 'recovery_prompt', recoverySnapshot: action.snapshot };
    case 'RECOVERY_CONFIRMED':
      return { ...state, phase: 'restoring' };
    case 'RECOVERY_DECLINED':
      return { ...state, phase: 'scanning', recoverySnapshot: null };
    case 'RECOVERY_COMPLETE':
      return { ...state, phase: 'scanning', recoverySnapshot: null };
    case 'CHECK_COMPLETE_V1': {
      const selectable = [...action.updates, ...action.upToDate];
      const modSelections = Object.fromEntries(
        selectable.map((entry) => {
          const projectId = 'mod' in entry ? entry.mod.projectId : entry.projectId;
          return [projectId, true];
        }),
      );
      return {
        ...state,
        phase: 'check_complete',
        updates: action.updates,
        upToDate: action.upToDate,
        incompatibleMods: action.incompatible,
        modSelections,
      };
    }
    case 'TOGGLE_MOD_SELECTION':
      return {
        ...state,
        modSelections: {
          ...state.modSelections,
          [action.projectId]: !state.modSelections[action.projectId],
        },
      };
    case 'CONFIRM_SELECTION':
      return { ...state, phase: 'migrating' };
    case 'SNAPSHOT_WRITTEN':
      return { ...state, snapshotPath: action.snapshotPath };
    case 'MIGRATION_RESULT':
      return {
        ...state,
        migrationResults: [...state.migrationResults, action.result],
      };
    case 'ALL_MIGRATIONS_DONE':
      return { ...state, phase: 'downloading' };
    case 'INTEGRITY_RESULT':
      // Status already updated via DOWNLOAD_RESULT; no-op here
      return state;

    default:
      return state;
  }
}
