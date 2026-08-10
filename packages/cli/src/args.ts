export type CliCommand = 'interactive' | 'scan' | 'check' | 'audit' | 'lock' | 'verify' | 'update' | 'rollback' | 'config';

export interface CliPinAssignment {
  project: string;
  version: string;
}

export interface ParsedCliArgs {
  command: CliCommand;
  directory?: string;
  json: boolean;
  noCache: boolean;
  failOnUpdates: boolean;
  strict: boolean;
  dryRun: boolean;
  yes: boolean;
  mcVersion?: string;
  loader?: string;
  channel?: 'stable-only' | 'allow-beta';
  ignore: string[];
  unignore: string[];
  pin: CliPinAssignment[];
  unpin: string[];
  clearMcVersion: boolean;
  clearLoader: boolean;
  help: boolean;
  version: boolean;
}

const COMMANDS = new Set<CliCommand>(['scan', 'check', 'audit', 'lock', 'verify', 'update', 'rollback', 'config']);

const ALLOWED: Record<CliCommand, Set<string>> = {
  interactive: new Set(),
  scan: new Set(['json', 'noCache']),
  check: new Set(['json', 'noCache', 'failOnUpdates', 'mcVersion', 'loader', 'channel']),
  audit: new Set(['json', 'noCache', 'strict', 'mcVersion', 'loader']),
  lock: new Set(['json', 'noCache']),
  verify: new Set(['json', 'noCache']),
  update: new Set(['json', 'noCache', 'dryRun', 'yes', 'mcVersion', 'loader', 'channel']),
  rollback: new Set(),
  config: new Set([
    'json', 'mcVersion', 'loader', 'channel', 'ignore', 'unignore', 'pin', 'unpin',
    'clearMcVersion', 'clearLoader',
  ]),
};

export function parseCliArgs(rawArgs: string[]): ParsedCliArgs {
  const args = rawArgs.filter((arg) => arg !== '--');
  const result: ParsedCliArgs = {
    command: 'interactive',
    json: false,
    noCache: false,
    failOnUpdates: false,
    strict: false,
    dryRun: false,
    yes: false,
    ignore: [],
    unignore: [],
    pin: [],
    unpin: [],
    clearMcVersion: false,
    clearLoader: false,
    help: false,
    version: false,
  };
  const used = new Set<string>();
  const positionals: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '-v' || arg === '--version') result.version = true;
    else if (arg === '--json') { result.json = true; used.add('json'); }
    else if (arg === '--no-cache') { result.noCache = true; used.add('noCache'); }
    else if (arg === '--fail-on-updates') { result.failOnUpdates = true; used.add('failOnUpdates'); }
    else if (arg === '--strict') { result.strict = true; used.add('strict'); }
    else if (arg === '--dry-run') { result.dryRun = true; used.add('dryRun'); }
    else if (arg === '--yes') { result.yes = true; used.add('yes'); }
    else if (arg === '--clear-mc-version') { result.clearMcVersion = true; used.add('clearMcVersion'); }
    else if (arg === '--clear-loader') { result.clearLoader = true; used.add('clearLoader'); }
    else if (arg.startsWith('--ignore=')) {
      result.ignore.push(requiredValue(arg, '--ignore'));
      used.add('ignore');
    } else if (arg.startsWith('--unignore=')) {
      result.unignore.push(requiredValue(arg, '--unignore'));
      used.add('unignore');
    } else if (arg.startsWith('--pin=')) {
      result.pin.push(parsePin(requiredValue(arg, '--pin')));
      used.add('pin');
    } else if (arg.startsWith('--unpin=')) {
      result.unpin.push(requiredValue(arg, '--unpin'));
      used.add('unpin');
    } else if (arg.startsWith('--mc-version=')) {
      result.mcVersion = requiredValue(arg, '--mc-version');
      used.add('mcVersion');
    } else if (arg.startsWith('--loader=')) {
      result.loader = requiredValue(arg, '--loader').toLowerCase();
      used.add('loader');
    } else if (arg.startsWith('--channel=')) {
      const channel = requiredValue(arg, '--channel');
      if (channel !== 'stable-only' && channel !== 'allow-beta') {
        throw new Error(`Invalid update channel: ${channel}. Use stable-only or allow-beta.`);
      }
      result.channel = channel;
      used.add('channel');
    } else {
      throw new Error(`Unknown option: ${arg}. Run upmods --help for supported options.`);
    }
  }

  const first = positionals[0];
  if (first && COMMANDS.has(first as CliCommand)) {
    result.command = first as CliCommand;
    result.directory = positionals[1];
    if (positionals.length > 2) throw new Error(`Unexpected argument: ${positionals[2]}`);
  } else {
    result.directory = first;
    if (positionals.length > 1) throw new Error(`Unexpected argument: ${positionals[1]}`);
  }

  if (!result.help && !result.version) {
    const allowed = ALLOWED[result.command];
    const invalid = [...used].find((option) => !allowed.has(option));
    if (invalid) throw new Error(`Option ${displayOption(invalid)} cannot be used with ${result.command}.`);
  }
  if (result.command === 'update' && result.dryRun && result.yes) {
    throw new Error('Choose either --dry-run or --yes, not both.');
  }
  if (result.command === 'config' && result.mcVersion !== undefined && result.clearMcVersion) {
    throw new Error('Choose either --mc-version or --clear-mc-version, not both.');
  }
  if (result.command === 'config' && result.loader !== undefined && result.clearLoader) {
    throw new Error('Choose either --loader or --clear-loader, not both.');
  }
  return result;
}

function parsePin(value: string): CliPinAssignment {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--pin requires PROJECT=VERSION, for example --pin=sodium=mc1.21-0.6.13.');
  }
  return { project: value.slice(0, separator), version: value.slice(separator + 1) };
}

function requiredValue(arg: string, option: string): string {
  const value = arg.slice(option.length + 1);
  if (!value) throw new Error(`${option} requires a value.`);
  return value;
}

function displayOption(key: string): string {
  const names: Record<string, string> = {
    json: '--json', noCache: '--no-cache', failOnUpdates: '--fail-on-updates', strict: '--strict',
    dryRun: '--dry-run', yes: '--yes', mcVersion: '--mc-version', loader: '--loader', channel: '--channel',
    ignore: '--ignore', unignore: '--unignore', pin: '--pin', unpin: '--unpin',
    clearMcVersion: '--clear-mc-version', clearLoader: '--clear-loader',
  };
  return names[key] ?? key;
}
