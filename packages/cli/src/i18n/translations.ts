export interface Translations {
  common: {
    brand: string;
    nextLanguage: string;
    list: {
      position: string;
      overflow: string;
    };
    progress: {
      step: string;
      scan: string;
      versionSelect: string;
      check: string;
      download: string;
      done: string;
    };
    hotkeys: {
      quit: string;
      language: string;
      download: string;
      apply: string;
      rollback: string;
      continue: string;
      confirm: string;
      navigate: string;
      toggle: string;
      selectAll: string;
      selectNone: string;
      scroll: string;
      open: string;
      editSource: string;
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
    moreItems: string;
    browsing: string;
  };
  versionSelect: {
    title: string;
    subtitle: string;
    summary: string;
  };
  loaderSelect: {
    title: string;
    subtitle: string;
    source: string;
    detected: string;
    ambiguous: string;
    sourceMode: string;
    targetMode: string;
    summary: string;
    loading: string;
  };
  migration: {
    checkingTitle: string;
    checkingSubtitle: string;
    checkingProgress: string;
    checkingSummary: string;
    reviewTitle: string;
    reviewSubtitle: string;
    mod: string;
    source: string;
    target: string;
    status: string;
    compatible: string;
    convertible: string;
    required: string;
    optional: string;
    unavailable: string;
    selectedSummary: string;
    incomplete: string;
    buildingTitle: string;
    buildingSubtitle: string;
    buildingProgress: string;
    buildingSummary: string;
    doneTitle: string;
    doneSubtitle: string;
    resultSummary: string;
    resultCounts: string;
    outputDir: string;
    complete: string;
    manualInstall: string;
  };
  checking: {
    title: string;
    subtitle: string;
    inProgress: string;
    summary: string;
  };
  applying: {
    title: string;
    subtitle: string;
    inProgress: string;
    summary: string;
  };
  rollbacking: {
    title: string;
    subtitle: string;
    inProgress: string;
    summary: string;
  };
  check: {
    title: string;
    subtitle: string;
    pick: string;
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
    selectionSummary: string;
    noneSelected: string;
    upToDateSummary: string;
    browsing: string;
    modrinthLink: string;
  };
  download: {
    title: string;
    subtitle: string;
    summary: string;
    current: string;
    browsing: string;
    modrinthLink: string;
  };
  summary: {
    title: string;
    subtitle: string;
    successSummary: string;
    outputDir: string;
    failedSection: string;
    failedSummary: string;
    browsing: string;
    modrinthLink: string;
    applySummary: string;
    backupSession: string;
    backupDir: string;
    rollbackSummary: string;
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
    list: {
      position: '{current}/{total}',
      overflow: '↑ {above} above · ↓ {below} below',
    },
    progress: {
      step: 'Step {current}/{total}',
      scan: 'Scan',
      versionSelect: 'Target',
      check: 'Check',
      download: 'Download',
      done: 'Done',
    },
    hotkeys: {
      quit: 'Quit',
      language: '中文',
      download: 'Download',
      apply: 'Apply',
      rollback: 'Rollback',
      continue: 'Continue',
      confirm: 'Confirm',
      navigate: 'Move',
      toggle: 'Toggle',
      selectAll: 'Select all',
      selectNone: 'Clear all',
      scroll: 'Scroll',
      open: 'Open link',
      editSource: 'Change source',
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
    moreItems: '… and {count} more',
    browsing: 'Use arrow keys to browse identified and unidentified mods.',
  },
  versionSelect: {
    title: 'Target Version',
    subtitle: 'Choose which Minecraft release to compare against.',
    summary: 'Use arrow keys to select a release build.',
  },
  loaderSelect: {
    title: 'Target Loader',
    subtitle: 'Choose the mod loader for the target environment.',
    source: 'Source loader:',
    detected: 'auto-detected',
    ambiguous: 'detection is ambiguous — verify the source loader',
    sourceMode: 'Choose the loader used by the current mods.',
    targetMode: 'Choose the loader to update or migrate to.',
    summary: '{source} → {target} · Minecraft {version}',
    loading: 'Loading loaders from Modrinth…',
  },
  migration: {
    checkingTitle: 'Migration Analysis',
    checkingSubtitle: 'Find compatible target-loader versions and dependencies.',
    checkingProgress: 'Analyzing mods and resolving dependencies…',
    checkingSummary: 'Preparing the migration compatibility report…',
    reviewTitle: 'Migration Review',
    reviewSubtitle: 'Review the complete target mod set before building it.',
    mod: 'Mod',
    source: 'Source',
    target: 'Target',
    status: 'Status',
    compatible: 'Compatible',
    convertible: 'Convert',
    required: 'Required',
    optional: 'Optional',
    unavailable: 'Unavailable',
    selectedSummary: '{converted} convert · {copied} copy · {required} required · {optional} optional',
    incomplete: 'Incomplete migration: {count} issue(s) require manual review.',
    buildingTitle: 'Build Migration',
    buildingSubtitle: 'Assemble a complete target-loader mods directory.',
    buildingProgress: 'Downloading and copying migration files…',
    buildingSummary: 'The source mods directory will not be modified.',
    doneTitle: 'Migration Ready',
    doneSubtitle: 'The target-loader mod set has been assembled.',
    resultSummary: '{status} migration for {loader} {version}',
    resultCounts: '{downloaded} downloaded · {copied} copied · {failed} failed · {unavailable} unavailable',
    outputDir: 'Target mods:',
    complete: 'Complete',
    manualInstall: 'Create a matching loader instance, then copy this directory into its mods folder.',
  },
  checking: {
    title: 'Updates',
    subtitle: 'Compare installed versions against the selected release.',
    inProgress: 'Checking Modrinth for newer versions…',
    summary: 'Preparing update availability…',
  },
  applying: {
    title: 'Apply',
    subtitle: 'Copy downloaded updates into your mods folder.',
    inProgress: 'Applying downloaded updates…',
    summary: 'Creating backup session before overwriting installed mods…',
  },
  rollbacking: {
    title: 'Rollback',
    subtitle: 'Restore the latest backup session into your mods folder.',
    inProgress: 'Restoring the latest backup session…',
    summary: 'Reverting installed mods to the previous versions…',
  },
  check: {
    title: 'Updates',
    subtitle: 'Review available updates before downloading.',
    pick: 'Pick',
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
    selectionSummary: '{selected}/{count} selected for download',
    noneSelected: '0/{count} selected · choose at least one update',
    upToDateSummary: '{count} mods already up to date',
    browsing: 'Browsing {current}/{total}',
    modrinthLink: 'Modrinth version:',
  },
  download: {
    title: 'Downloads',
    subtitle: 'Fetch update files into mods-updated.',
    summary: '{done} done · {failed} failed · {pending} pending',
    current: 'Current',
    browsing: 'Use arrow keys to browse the download list.',
    modrinthLink: 'Modrinth version:',
  },
  summary: {
    title: 'Done',
    subtitle: 'Download session finished.',
    successSummary: '{count} mods updated',
    outputDir: 'Saved to:',
    failedSection: 'Failed downloads',
    failedSummary: '{count} failed downloads',
    browsing: 'Browsing {current}/{total}',
    modrinthLink: 'Modrinth version:',
    applySummary: 'Applied {count} mods to your mods folder',
    backupSession: 'Backup session:',
    backupDir: 'Backup dir:',
    rollbackSummary: 'Rolled back {count} mods from the latest session',
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
    list: {
      position: '{current}/{total}',
      overflow: '↑ 上方 {above} 筆 · ↓ 下方 {below} 筆',
    },
    progress: {
      step: '步驟 {current}/{total}',
      scan: '掃描',
      versionSelect: '選版本',
      check: '檢查',
      download: '下載',
      done: '完成',
    },
    hotkeys: {
      quit: '結束',
      language: 'English',
      download: '下載',
      apply: '套用',
      rollback: '回滾',
      continue: '繼續',
      confirm: '確認',
      navigate: '移動',
      toggle: '切換',
      selectAll: '全選',
      selectNone: '全不選',
      scroll: '捲動',
      open: '開啟連結',
      editSource: '修改來源',
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
    moreItems: '… 另外還有 {count} 個',
    browsing: '可用方向鍵瀏覽已識別與未識別項目。',
  },
  versionSelect: {
    title: '目標版本',
    subtitle: '選擇要比對更新的 Minecraft 版本。',
    summary: '使用方向鍵選擇正式版。',
  },
  loaderSelect: {
    title: '目標 Loader',
    subtitle: '選擇目標環境使用的模組載入器。',
    source: '來源 Loader：',
    detected: '自動偵測',
    ambiguous: '偵測結果有歧義，請確認來源 Loader',
    sourceMode: '選擇目前這批 Mods 使用的 Loader。',
    targetMode: '選擇要更新或遷移到的 Loader。',
    summary: '{source} → {target} · Minecraft {version}',
    loading: '正在從 Modrinth 載入 Loader…',
  },
  migration: {
    checkingTitle: '遷移分析',
    checkingSubtitle: '尋找目標 Loader 版本並解析相依模組。',
    checkingProgress: '正在分析 Mods 與遞迴解析依賴…',
    checkingSummary: '正在準備 Loader 遷移相容性報告…',
    reviewTitle: '遷移確認',
    reviewSubtitle: '建立前確認完整的目標 Loader Mod 集合。',
    mod: '模組',
    source: '來源',
    target: '目標',
    status: '狀態',
    compatible: '已相容',
    convertible: '可轉換',
    required: '必要依賴',
    optional: '選用依賴',
    unavailable: '無法轉換',
    selectedSummary: '轉換 {converted} · 複製 {copied} · 必要 {required} · 選用 {optional}',
    incomplete: '遷移不完整：有 {count} 個問題需要手動確認。',
    buildingTitle: '建立遷移集合',
    buildingSubtitle: '組裝完整的目標 Loader mods 目錄。',
    buildingProgress: '正在下載並複製遷移檔案…',
    buildingSummary: '來源 mods 目錄不會被修改。',
    doneTitle: '遷移集合已完成',
    doneSubtitle: '目標 Loader 的 Mod 集合已組裝完成。',
    resultSummary: '{status} · {loader} {version}',
    resultCounts: '下載 {downloaded} · 複製 {copied} · 失敗 {failed} · 無法轉換 {unavailable}',
    outputDir: '目標 Mods：',
    complete: '完整',
    manualInstall: '請建立相符的 Loader 實例，再將此目錄內容放入該實例的 mods 資料夾。',
  },
  checking: {
    title: '更新檢查',
    subtitle: '依據選定版本比對可用更新。',
    inProgress: '正在向 Modrinth 查詢新版本…',
    summary: '正在整理更新結果…',
  },
  applying: {
    title: '套用更新',
    subtitle: '把已下載的更新覆蓋到你的 mods 資料夾。',
    inProgress: '正在套用已下載的更新…',
    summary: '覆蓋前正在建立備份 session…',
  },
  rollbacking: {
    title: '回滾',
    subtitle: '將最新備份 session 還原回你的 mods 資料夾。',
    inProgress: '正在還原最新備份 session…',
    summary: '正在把已安裝模組回復到先前版本…',
  },
  check: {
    title: '更新檢查',
    subtitle: '確認可用更新後再開始下載。',
    pick: '選取',
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
    selectionSummary: '已選取 {selected}/{count} 個更新',
    noneSelected: '已選取 0/{count} 個，請至少選一個更新',
    upToDateSummary: '已有 {count} 個模組是最新版本',
    browsing: '目前位置 {current}/{total}',
    modrinthLink: 'Modrinth 版本頁：',
  },
  download: {
    title: '下載',
    subtitle: '把更新檔下載到 mods-updated。',
    summary: '完成 {done} 個 · 失敗 {failed} 個 · 剩餘 {pending} 個',
    current: '目前',
    browsing: '可用方向鍵瀏覽下載清單。',
    modrinthLink: 'Modrinth 版本頁：',
  },
  summary: {
    title: '完成',
    subtitle: '本次下載流程已結束。',
    successSummary: '已更新 {count} 個模組',
    outputDir: '儲存至：',
    failedSection: '下載失敗',
    failedSummary: '下載失敗 {count} 個',
    browsing: '目前位置 {current}/{total}',
    modrinthLink: 'Modrinth 版本頁：',
    applySummary: '已將 {count} 個模組套用到 mods 資料夾',
    backupSession: '備份 session：',
    backupDir: '備份目錄：',
    rollbackSummary: '已從最新 session 回滾 {count} 個模組',
  },
  error: {
    title: '錯誤',
    subtitle: '更新流程尚未完成即中止。',
    prefix: '✘',
    unknownError: '發生未預期的錯誤',
  },
};
