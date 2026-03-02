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
    navHint: string;
  };
  check: {
    title: string;
    colMod: string;
    colInstalled: string;
    colAvailable: string;
    colStatus: string;
    upToDate: string;
    updateAvailable: string;
    notAvailable: string;
    allUpToDate: string;
    downloadHint: string;
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
    navHint: '↑↓ navigate  Enter confirm  Q quit',
  },
  check: {
    title: 'Update availability',
    colMod: 'Mod',
    colInstalled: 'Installed',
    colAvailable: 'Available',
    colStatus: 'Status',
    upToDate: 'Up to date ✓',
    updateAvailable: 'Update available',
    notAvailable: 'Not available –',
    allUpToDate: 'All mods are up to date.',
    downloadHint: 'Press U to download updates  Q to quit',
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
    navHint: '',
  },
  check: {
    title: '',
    colMod: '',
    colInstalled: '',
    colAvailable: '',
    colStatus: '',
    upToDate: '',
    updateAvailable: '',
    notAvailable: '',
    allUpToDate: '',
    downloadHint: '',
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
