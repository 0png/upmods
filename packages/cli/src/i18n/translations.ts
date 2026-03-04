export interface Translations {
  common: {
    quitHint: string;
    langToggle: string;
  };
  scan: {
    title: string;
    scanning: string;
    identifying: string;
    progress: string;
    identifiedSection: string;
    unidentifiedSection: string;
    unidentifiedLabel: string;
    emptyDir: string;
    emptyDirHint: string;
    continueHint: string;
  };
  versionSelect: {
    title: string;
    hint: string;
  };
  check: {
    title: string;
    modName: string;
    installed: string;
    available: string;
    status: string;
    upToDate: string;
    updateAvailable: string;
    notAvailable: string;
    allUpToDate: string;
    updatesFound: string;
    hintWithUpdates: string;
    hintNoUpdates: string;
  };
  download: {
    title: string;
    done: string;
    failed: string;
    waiting: string;
  };
  summary: {
    title: string;
    outputDir: string;
    quitHint: string;
    failedSection: string;
  };
  error: {
    prefix: string;
    quitHint: string;
    unknownError: string;
  };
}

export const en: Translations = {
  common: {
    quitHint: 'Press Q to quit',
    langToggle: 'Press L to toggle language',
  },
  scan: {
    title: 'Scanning mods directory…',
    scanning: 'Scanning…',
    identifying: 'Identifying mods…',
    progress: '{done} / {total} scanned',
    identifiedSection: 'Identified mods',
    unidentifiedSection: 'Unidentified files',
    unidentifiedLabel: '(unidentified)',
    emptyDir: 'No mod files found in:',
    emptyDirHint: 'Make sure you are in a Minecraft mods directory.',
    continueHint: 'Press Enter to continue',
  },
  versionSelect: {
    title: 'Select Minecraft version to check updates for',
    hint: '↑↓ navigate  Enter confirm  Q quit  L language',
  },
  check: {
    title: 'Update availability',
    modName: 'Mod',
    installed: 'Installed',
    available: 'Available',
    status: 'Status',
    upToDate: 'Up to date',
    updateAvailable: 'Update available',
    notAvailable: 'Not available',
    allUpToDate: 'All mods are up to date.',
    updatesFound: '{count} update(s) available',
    hintWithUpdates: 'Press U to download updates  Q to quit  L language',
    hintNoUpdates: 'Press Q to quit  L language',
  },
  download: {
    title: 'Downloading updates…',
    done: 'done',
    failed: 'failed',
    waiting: 'waiting…',
  },
  summary: {
    title: '{count} mods updated',
    outputDir: 'Saved to:',
    quitHint: 'Press Q to quit',
    failedSection: 'Failed downloads',
  },
  error: {
    prefix: '✘',
    quitHint: 'Press Q to quit',
    unknownError: 'An unexpected error occurred',
  },
};

// zh-TW translations — filled in T042 (US4)
export const zhTW: Translations = {
  common: {
    quitHint: '按 Q 結束',
    langToggle: '按 L 切換語言',
  },
  scan: {
    title: '正在掃描模組目錄…',
    scanning: '掃描中…',
    identifying: '識別模組中…',
    progress: '{done} / {total} 已掃描',
    identifiedSection: '已識別的模組',
    unidentifiedSection: '未識別的檔案',
    unidentifiedLabel: '（未識別）',
    emptyDir: '找不到模組檔案於：',
    emptyDirHint: '請確認您位於 Minecraft 模組目錄中。',
    continueHint: '按 Enter 繼續',
  },
  versionSelect: {
    title: '選擇要檢查更新的 Minecraft 版本',
    hint: '↑↓ 導覽  Enter 確認  Q 結束  L 切換語言',
  },
  check: {
    title: '更新狀況',
    modName: '模組',
    installed: '已安裝',
    available: '可用版本',
    status: '狀態',
    upToDate: '已是最新',
    updateAvailable: '有更新可用',
    notAvailable: '此版本不支援',
    allUpToDate: '所有模組均為最新版本。',
    updatesFound: '{count} 個更新可用',
    hintWithUpdates: '按 U 下載更新  Q 結束  L 切換語言',
    hintNoUpdates: '按 Q 結束  L 切換語言',
  },
  download: {
    title: '正在下載更新…',
    done: '完成',
    failed: '失敗',
    waiting: '等待中…',
  },
  summary: {
    title: '已更新 {count} 個模組',
    outputDir: '儲存至：',
    quitHint: '按 Q 結束',
    failedSection: '下載失敗',
  },
  error: {
    prefix: '✘',
    quitHint: '按 Q 結束',
    unknownError: '發生未預期的錯誤',
  },
};
