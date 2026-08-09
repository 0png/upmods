import type {
  ApplyResult,
  BackupSessionManifest,
  DownloadResult,
  LoaderDetection,
  LoaderMigrationPlan,
  MCVersion,
  MigrationResult,
  Mod,
  ModLoader,
  ModUpdate,
  RollbackResult,
  ScanResult,
} from '@upmods/core';

export type AppPhase =
  | 'scanning'
  | 'identifying'
  | 'scan_complete'
  | 'version_select'
  | 'loader_select'
  | 'checking'
  | 'check_complete'
  | 'downloading'
  | 'applying'
  | 'rollbacking'
  | 'done'
  | 'migration_checking'
  | 'migration_review'
  | 'migration_building'
  | 'migration_done'
  | 'error';

export interface AppState {
  phase: AppPhase;
  scanResult: ScanResult | null;
  scanCursorIndex: number;
  mcVersions: MCVersion[];
  selectedMCVersionIndex: number;
  selectedMCVersion: string | null;
  modLoaders: ModLoader[];
  loaderDetection: LoaderDetection | null;
  loaderSelectionMode: 'source' | 'target';
  sourceLoaderIndex: number;
  targetLoaderIndex: number;
  selectedSourceLoader: string | null;
  selectedTargetLoader: string | null;
  updates: ModUpdate[];
  selectedUpdates: Record<string, boolean>;
  checkCursorIndex: number;
  activeDownloads: ModUpdate[];
  downloadCursorIndex: number;
  upToDate: Mod[];
  downloadResults: DownloadResult[];
  lastBackupSession: BackupSessionManifest | null;
  lastApplyResult: ApplyResult | null;
  lastRollbackResult: RollbackResult | null;
  /** Per-mod SHA-1 → { bytes, total } for live progress display */
  downloadProgress: Record<string, { bytes: number; total: number }>;
  summaryCursorIndex: number;
  migrationPlan: LoaderMigrationPlan | null;
  migrationCursorIndex: number;
  selectedOptionalEntries: Record<string, boolean>;
  migrationProgress: Record<string, { bytes: number; total: number }>;
  migrationResult: MigrationResult | null;
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
  | { type: 'MOD_LOADERS_LOADED'; loaders: ModLoader[]; detection: LoaderDetection }
  | { type: 'CURSOR_UP' }
  | { type: 'CURSOR_DOWN' }
  | { type: 'SELECT_MC_VERSION' }
  | { type: 'LOADER_CURSOR_UP' }
  | { type: 'LOADER_CURSOR_DOWN' }
  | { type: 'EDIT_SOURCE_LOADER' }
  | { type: 'CONFIRM_LOADER_SELECTION' }
  | { type: 'CHECK_COMPLETE'; updates: ModUpdate[]; upToDate: Mod[] }
  | { type: 'CHECK_CURSOR_UP' }
  | { type: 'CHECK_CURSOR_DOWN' }
  | { type: 'TOGGLE_UPDATE_SELECTION' }
  | { type: 'SELECT_ALL_UPDATES' }
  | { type: 'CLEAR_ALL_UPDATES' }
  | { type: 'START_DOWNLOAD' }
  | { type: 'START_APPLY' }
  | { type: 'APPLY_COMPLETE'; result: ApplyResult }
  | { type: 'START_ROLLBACK' }
  | { type: 'ROLLBACK_COMPLETE'; result: RollbackResult }
  | { type: 'DOWNLOAD_CURSOR_UP' }
  | { type: 'DOWNLOAD_CURSOR_DOWN' }
  | { type: 'DOWNLOAD_PROGRESS'; modName: string; bytes: number; total: number }
  | { type: 'DOWNLOAD_RESULT'; result: DownloadResult }
  | { type: 'DOWNLOAD_ALL_DONE' }
  | { type: 'MIGRATION_PLAN_COMPLETE'; plan: LoaderMigrationPlan }
  | { type: 'MIGRATION_CURSOR_UP' }
  | { type: 'MIGRATION_CURSOR_DOWN' }
  | { type: 'TOGGLE_OPTIONAL_DEPENDENCY' }
  | { type: 'SELECT_ALL_OPTIONAL_DEPENDENCIES' }
  | { type: 'CLEAR_OPTIONAL_DEPENDENCIES' }
  | { type: 'START_MIGRATION_BUILD' }
  | { type: 'MIGRATION_PROGRESS'; entryId: string; bytes: number; total: number }
  | { type: 'MIGRATION_COMPLETE'; result: MigrationResult }
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
  modLoaders: [],
  loaderDetection: null,
  loaderSelectionMode: 'target',
  sourceLoaderIndex: 0,
  targetLoaderIndex: 0,
  selectedSourceLoader: null,
  selectedTargetLoader: null,
  updates: [],
  selectedUpdates: {},
  checkCursorIndex: 0,
  activeDownloads: [],
  downloadCursorIndex: 0,
  upToDate: [],
  downloadResults: [],
  lastBackupSession: null,
  lastApplyResult: null,
  lastRollbackResult: null,
  downloadProgress: {},
  summaryCursorIndex: 0,
  migrationPlan: null,
  migrationCursorIndex: 0,
  selectedOptionalEntries: {},
  migrationProgress: {},
  migrationResult: null,
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
    case 'MOD_LOADERS_LOADED': {
      const detectedIndex = action.detection.detected
        ? action.loaders.findIndex((loader) => loader.name === action.detection.detected)
        : -1;
      const initialIndex = detectedIndex >= 0 ? detectedIndex : 0;
      const detectedLoader = detectedIndex >= 0
        ? action.loaders[detectedIndex]?.name ?? null
        : null;
      return {
        ...state,
        modLoaders: action.loaders,
        loaderDetection: action.detection,
        loaderSelectionMode: detectedLoader ? 'target' : 'source',
        sourceLoaderIndex: initialIndex,
        targetLoaderIndex: initialIndex,
        selectedSourceLoader: detectedLoader,
        selectedTargetLoader: detectedLoader,
      };
    }
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
        phase: 'loader_select',
        selectedMCVersion:
          state.mcVersions[state.selectedMCVersionIndex]?.version ?? null,
      };
    case 'LOADER_CURSOR_UP': {
      if (state.modLoaders.length <= 1) return state;
      if (state.loaderSelectionMode === 'source') {
        return {
          ...state,
          sourceLoaderIndex: state.sourceLoaderIndex === 0
            ? state.modLoaders.length - 1
            : state.sourceLoaderIndex - 1,
        };
      }
      return {
        ...state,
        targetLoaderIndex: state.targetLoaderIndex === 0
          ? state.modLoaders.length - 1
          : state.targetLoaderIndex - 1,
      };
    }
    case 'LOADER_CURSOR_DOWN': {
      if (state.modLoaders.length <= 1) return state;
      if (state.loaderSelectionMode === 'source') {
        return {
          ...state,
          sourceLoaderIndex: state.sourceLoaderIndex === state.modLoaders.length - 1
            ? 0
            : state.sourceLoaderIndex + 1,
        };
      }
      return {
        ...state,
        targetLoaderIndex: state.targetLoaderIndex === state.modLoaders.length - 1
          ? 0
          : state.targetLoaderIndex + 1,
      };
    }
    case 'EDIT_SOURCE_LOADER': {
      const selectedIndex = state.selectedSourceLoader
        ? state.modLoaders.findIndex((loader) => loader.name === state.selectedSourceLoader)
        : state.sourceLoaderIndex;
      return {
        ...state,
        loaderSelectionMode: 'source',
        sourceLoaderIndex: selectedIndex >= 0 ? selectedIndex : 0,
      };
    }
    case 'CONFIRM_LOADER_SELECTION': {
      if (state.loaderSelectionMode === 'source') {
        const sourceLoader = state.modLoaders[state.sourceLoaderIndex]?.name;
        if (!sourceLoader) return state;
        const targetIndex = state.selectedTargetLoader
          ? state.targetLoaderIndex
          : state.modLoaders.findIndex((loader) => loader.name === sourceLoader);
        return {
          ...state,
          loaderSelectionMode: 'target',
          selectedSourceLoader: sourceLoader,
          selectedTargetLoader: state.selectedTargetLoader ?? sourceLoader,
          targetLoaderIndex: targetIndex >= 0 ? targetIndex : 0,
        };
      }

      const targetLoader = state.modLoaders[state.targetLoaderIndex]?.name;
      if (!state.selectedSourceLoader || !targetLoader) return state;
      return {
        ...state,
        selectedTargetLoader: targetLoader,
        phase: state.selectedSourceLoader === targetLoader ? 'checking' : 'migration_checking',
        migrationPlan: null,
        migrationProgress: {},
        migrationResult: null,
      };
    }
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
        lastBackupSession: null,
        lastApplyResult: null,
        lastRollbackResult: null,
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
          lastApplyResult: null,
          lastRollbackResult: null,
          downloadProgress: {},
          summaryCursorIndex: 0,
        };
      }
    case 'START_APPLY':
      return { ...state, phase: 'applying', lastRollbackResult: null };
    case 'APPLY_COMPLETE':
      return {
        ...state,
        phase: 'done',
        lastBackupSession: action.result.session,
        lastApplyResult: action.result,
        lastRollbackResult: null,
      };
    case 'START_ROLLBACK':
      return { ...state, phase: 'rollbacking' };
    case 'ROLLBACK_COMPLETE':
      return {
        ...state,
        phase: 'done',
        lastRollbackResult: action.result,
      };
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
        lastApplyResult: null,
        lastRollbackResult: null,
        summaryCursorIndex: 0,
      };
    case 'MIGRATION_PLAN_COMPLETE':
      return {
        ...state,
        phase: 'migration_review',
        migrationPlan: action.plan,
        migrationCursorIndex: 0,
        selectedOptionalEntries: Object.fromEntries(
          action.plan.entries
            .filter((entry) => entry.status === 'optional')
            .map((entry) => [entry.id, false]),
        ),
        migrationProgress: {},
        migrationResult: null,
      };
    case 'MIGRATION_CURSOR_UP': {
      const total = state.migrationPlan?.entries.length ?? 0;
      if (total <= 1) return state;
      return {
        ...state,
        migrationCursorIndex: state.migrationCursorIndex === 0
          ? total - 1
          : state.migrationCursorIndex - 1,
      };
    }
    case 'MIGRATION_CURSOR_DOWN': {
      const total = state.migrationPlan?.entries.length ?? 0;
      if (total <= 1) return state;
      return {
        ...state,
        migrationCursorIndex: state.migrationCursorIndex === total - 1
          ? 0
          : state.migrationCursorIndex + 1,
      };
    }
    case 'TOGGLE_OPTIONAL_DEPENDENCY': {
      const entry = state.migrationPlan?.entries[state.migrationCursorIndex];
      if (!entry || entry.status !== 'optional') return state;
      return {
        ...state,
        selectedOptionalEntries: {
          ...state.selectedOptionalEntries,
          [entry.id]: !state.selectedOptionalEntries[entry.id],
        },
      };
    }
    case 'SELECT_ALL_OPTIONAL_DEPENDENCIES':
      return {
        ...state,
        selectedOptionalEntries: Object.fromEntries(
          (state.migrationPlan?.entries ?? [])
            .filter((entry) => entry.status === 'optional')
            .map((entry) => [entry.id, true]),
        ),
      };
    case 'CLEAR_OPTIONAL_DEPENDENCIES':
      return {
        ...state,
        selectedOptionalEntries: Object.fromEntries(
          (state.migrationPlan?.entries ?? [])
            .filter((entry) => entry.status === 'optional')
            .map((entry) => [entry.id, false]),
        ),
      };
    case 'START_MIGRATION_BUILD':
      return { ...state, phase: 'migration_building', migrationProgress: {} };
    case 'MIGRATION_PROGRESS':
      return {
        ...state,
        migrationProgress: {
          ...state.migrationProgress,
          [action.entryId]: { bytes: action.bytes, total: action.total },
        },
      };
    case 'MIGRATION_COMPLETE':
      return { ...state, phase: 'migration_done', migrationResult: action.result };
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
