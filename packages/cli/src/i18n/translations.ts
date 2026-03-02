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
  },
};

// zh-TW stub — all keys present, strings filled in T042 (US4)
export const zhTW: Translations = {
  common: {
    quitHint: '',
    langToggle: '',
  },
  scan: {
    title: '',
    scanning: '',
    identifying: '',
    progress: '',
    identifiedSection: '',
    unidentifiedSection: '',
    unidentifiedLabel: '',
    emptyDir: '',
    emptyDirHint: '',
  },
  versionSelect: {
    title: '',
    hint: '',
  },
  check: {
    title: '',
    modName: '',
    installed: '',
    available: '',
    status: '',
    upToDate: '',
    updateAvailable: '',
    notAvailable: '',
    allUpToDate: '',
    updatesFound: '',
    hintWithUpdates: '',
    hintNoUpdates: '',
  },
  download: {
    title: '',
    done: '',
    failed: '',
  },
  summary: {
    title: '',
    outputDir: '',
    quitHint: '',
    failedSection: '',
  },
  error: {
    prefix: '',
    quitHint: '',
  },
};
