export interface Translations {
  common: {
    brand: string;
    nextLanguage: string;
    hotkeys: {
      quit: string;
      language: string;
      download: string;
      continue: string;
      confirm: string;
      navigate: string;
    };
    status: {
      ready: string;
      done: string;
      failed: string;
      waiting: string;
    };
  };
  scan: {
    title: string;
    subtitle: string;
    scanning: string;
    identifying: string;
    identifiedSection: string;
    unidentifiedSection: string;
    unidentifiedLabel: string;
    emptyDir: string;
    emptyDirHint: string;
    summaryScanning: string;
    summaryComplete: string;
    summaryEmpty: string;
  };
  versionSelect: {
    title: string;
    subtitle: string;
    summary: string;
  };
  checking: {
    title: string;
    subtitle: string;
    inProgress: string;
    summary: string;
  };
  check: {
    title: string;
    subtitle: string;
    modName: string;
    installed: string;
    available: string;
    status: string;
    upToDate: string;
    updateAvailable: string;
    notAvailable: string;
    allUpToDate: string;
    updatesFound: string;
    modsChecked: string;
  };
  download: {
    title: string;
    subtitle: string;
    summary: string;
    current: string;
  };
  summary: {
    title: string;
    subtitle: string;
    successSummary: string;
    outputDir: string;
    failedSection: string;
  };
  error: {
    title: string;
    subtitle: string;
    prefix: string;
    unknownError: string;
  };
}

export const en: Translations = {
  common: {
    brand: 'upmods',
    nextLanguage: '中文',
    hotkeys: {
      quit: 'Quit',
      language: '中文',
      download: 'Download',
      continue: 'Continue',
      confirm: 'Confirm',
      navigate: 'Move',
    },
    status: {
      ready: 'Ready',
      done: 'Done',
      failed: 'Failed',
      waiting: 'Waiting…',
    },
  },
  scan: {
    title: 'Scan',
    subtitle: 'Find installed mods and match them with Modrinth.',
    scanning: 'Scanning files…',
    identifying: 'Identifying mods…',
    identifiedSection: 'Identified',
    unidentifiedSection: 'Unidentified',
    unidentifiedLabel: 'Needs manual review',
    emptyDir: 'No mod files found in:',
    emptyDirHint: 'Run upmods inside a Minecraft mods directory.',
    summaryScanning: 'Scanning your mods folder…',
    summaryComplete: '{identified} identified · {unidentified} unidentified',
    summaryEmpty: 'No mod archives were found.',
  },
  versionSelect: {
    title: 'Target Version',
    subtitle: 'Choose which Minecraft release to compare against.',
    summary: 'Use arrow keys to select a release build.',
  },
  checking: {
    title: 'Updates',
    subtitle: 'Compare installed versions against the selected release.',
    inProgress: 'Checking Modrinth for newer versions…',
    summary: 'Preparing update availability…',
  },
  check: {
    title: 'Updates',
    subtitle: 'Review available updates before downloading.',
    modName: 'Mod',
    installed: 'Installed',
    available: 'Available',
    status: 'Status',
    upToDate: 'Latest',
    updateAvailable: 'Update',
    notAvailable: 'N/A',
    allUpToDate: 'All mods are up to date.',
    updatesFound: '{count} updates available',
    modsChecked: '{count} mods checked',
  },
  download: {
    title: 'Downloads',
    subtitle: 'Fetch update files into mods-updated.',
    summary: '{done} done · {failed} failed · {pending} pending',
    current: 'Current',
  },
  summary: {
    title: 'Done',
    subtitle: 'Download session finished.',
    successSummary: '{count} mods updated',
    outputDir: 'Saved to:',
    failedSection: 'Failed downloads',
  },
  error: {
    title: 'Error',
    subtitle: 'The update flow stopped before completion.',
    prefix: '✘',
    unknownError: 'An unexpected error occurred',
  },
};

export const zhTW: Translations = {
  common: {
    brand: 'upmods',
    nextLanguage: 'English',
    hotkeys: {
      quit: '結束',
      language: 'English',
      download: '下載',
      continue: '繼續',
      confirm: '確認',
      navigate: '移動',
    },
    status: {
      ready: '就緒',
      done: '完成',
      failed: '失敗',
      waiting: '等待中…',
    },
  },
  scan: {
    title: '掃描',
    subtitle: '找出已安裝模組，並與 Modrinth 資料比對。',
    scanning: '掃描檔案中…',
    identifying: '識別模組中…',
    identifiedSection: '已識別',
    unidentifiedSection: '未識別',
    unidentifiedLabel: '需手動確認',
    emptyDir: '找不到模組檔案於：',
    emptyDirHint: '請在 Minecraft 的 mods 目錄中執行 upmods。',
    summaryScanning: '正在掃描你的 mods 資料夾…',
    summaryComplete: '已識別 {identified} 個 · 未識別 {unidentified} 個',
    summaryEmpty: '沒有找到任何模組封裝檔。',
  },
  versionSelect: {
    title: '目標版本',
    subtitle: '選擇要比對更新的 Minecraft 版本。',
    summary: '使用方向鍵選擇正式版。',
  },
  checking: {
    title: '更新檢查',
    subtitle: '依據選定版本比對可用更新。',
    inProgress: '正在向 Modrinth 查詢新版本…',
    summary: '正在整理更新結果…',
  },
  check: {
    title: '更新檢查',
    subtitle: '確認可用更新後再開始下載。',
    modName: '模組',
    installed: '已安裝',
    available: '可用版本',
    status: '狀態',
    upToDate: '最新',
    updateAvailable: '可更新',
    notAvailable: '無',
    allUpToDate: '所有模組都已是最新版本。',
    updatesFound: '可更新模組：{count}',
    modsChecked: '已檢查 {count} 個模組',
  },
  download: {
    title: '下載',
    subtitle: '把更新檔下載到 mods-updated。',
    summary: '完成 {done} 個 · 失敗 {failed} 個 · 剩餘 {pending} 個',
    current: '目前',
  },
  summary: {
    title: '完成',
    subtitle: '本次下載流程已結束。',
    successSummary: '已更新 {count} 個模組',
    outputDir: '儲存至：',
    failedSection: '下載失敗',
  },
  error: {
    title: '錯誤',
    subtitle: '更新流程尚未完成即中止。',
    prefix: '✘',
    unknownError: '發生未預期的錯誤',
  },
};
