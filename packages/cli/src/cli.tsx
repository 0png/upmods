#!/usr/bin/env node
/* eslint-disable no-console -- This file is the CLI's intentional stdout/stderr boundary. */
import { access } from 'node:fs/promises';
import path from 'node:path';
import type {
  AuditReport,
  InstanceConfig,
  InstanceConfigPatch,
  InstanceResolution,
  LockfileChange,
  ScanResult,
  SupportedModLoader,
  UpdatePlan,
} from '@upmods/core';
import { parseCliArgs } from './args.js';

const invocationCwd = process.env['INIT_CWD'] ?? process.cwd();
const parsed = parseCliArgs(process.argv.slice(2));
const CLI_VERSION = '0.2.0';
const operationController = new AbortController();
let cancellationExitCode = 130;
const HELP = `upmods ${CLI_VERSION}

Safe Minecraft instance and mod maintenance powered by Modrinth.

Usage:
  upmods [instance-dir]
  upmods scan [instance-dir] [--json] [--no-cache]
  upmods check [instance-dir] [--mc-version=<version>] [--loader=<loader>] [--json]
  upmods audit [instance-dir] [--json] [--strict]
  upmods update [instance-dir] [--dry-run | --yes]
  upmods lock [instance-dir] [--json] [--no-cache]
  upmods verify [instance-dir] [--json] [--no-cache]
  upmods rollback [instance-dir]
  upmods config [instance-dir] [settings options]

Commands:
  scan             Resolve the instance, inspect JARs, and identify mods
  check            Check compatible updates without downloading
  audit            Report duplicate, incompatible, missing, legacy, and drift issues
  update           Plan updates; only --yes downloads and applies them
  lock             Save a portable .upmods-lock.json snapshot
  verify           Compare the current mod set with its lockfile
  rollback         Restore the latest applied backup session
  config           Show or safely change persistent instance settings

Options:
  --json             Print machine-readable output
  --no-cache         Recompute all JAR hashes
  --mc-version=V     Override detected/saved Minecraft version
  --loader=L         Override detected/saved loader
  --channel=C        stable-only (default) or allow-beta
  --dry-run          Show update decisions and projected dependency blockers
  --yes              Confirm download and transactional Apply
  --strict           Exit 2 when audit finds startup-breaking errors
  --fail-on-updates  Exit 2 when check finds available updates
  --ignore=PROJECT   Ignore a project ID or slug (repeatable; config only)
  --unignore=PROJECT Remove an ignored project (repeatable; config only)
  --pin=P=V          Pin project P to version ID/number V (repeatable; config only)
  --unpin=PROJECT    Remove a project pin (repeatable; config only)
  --clear-mc-version Clear the saved Minecraft version (config only)
  --clear-loader     Clear the saved loader (config only)
  Ctrl+C             Cancel a non-interactive operation (exit 130)
  -h, --help         Show this help
  -v, --version      Show the installed version

Examples:
  upmods D:\\Games\\PrismLauncher\\instances\\MyPack
  upmods audit . --strict
  upmods update . --dry-run
  upmods update . --yes --channel=allow-beta
  upmods config . --loader=fabric --mc-version=1.21.1
  upmods config . --ignore=example --pin=sodium=mc1.21-0.6.13`;

const ALT_SCREEN_ENTER = '\u001b[?1049h';
const ALT_SCREEN_EXIT = '\u001b[?1049l';
const CLEAR_SCREEN = '\u001b[2J\u001b[H';
let screenActive = false;

function enterScreen(): void {
  screenActive = true;
  process.stdout.write(ALT_SCREEN_ENTER);
  process.stdout.write(CLEAR_SCREEN);
}

function restoreScreen(): void {
  if (!screenActive) return;
  screenActive = false;
  process.stdout.write(ALT_SCREEN_EXIT);
}

function resolveInputDirectory(): string {
  return parsed.directory ? path.resolve(invocationCwd, parsed.directory) : invocationCwd;
}

async function prepareInstance() {
  const { UpmodsCore } = await import('@upmods/core');
  const integrationBaseUrl = process.env['UPMODS_TEST_MODRINTH_API_BASE_URL'];
  let modrinthOptions;
  if (integrationBaseUrl !== undefined) {
    if (process.env['UPMODS_INTEGRATION_TEST'] !== '1') {
      throw new Error('UPMODS_TEST_MODRINTH_API_BASE_URL is restricted to the integration test harness.');
    }
    const url = new URL(integrationBaseUrl);
    const localHosts = new Set(['127.0.0.1', '::1', 'localhost']);
    if (url.protocol !== 'http:' || !localHosts.has(url.hostname) || url.username || url.password) {
      throw new Error('Integration test API must be an unauthenticated localhost HTTP URL.');
    }
    modrinthOptions = {
      baseUrl: url.href,
      maxRetries: 0,
      headersTimeoutMs: 2_000,
      bodyTimeoutMs: 2_000,
    };
  }
  const core = new UpmodsCore({ ...(modrinthOptions ? { modrinth: modrinthOptions } : {}) });
  const instance = await core.resolveInstance(resolveInputDirectory());
  return { core, instance };
}

function printInstance(instance: InstanceResolution): void {
  console.log(`Instance: ${instance.instanceDir} (${instance.kind})`);
  console.log(`Mods: ${instance.modsDir}`);
  for (const warning of instance.warnings) console.log(`  ! ${warning}`);
}

function printHumanScan(result: ScanResult): void {
  console.log(`Scanned ${result.totalFiles} JARs in ${result.durationMs} ms`);
  console.log(`Identified: ${result.identifiedCount} · Unidentified: ${result.unidentifiedCount}`);
  for (const mod of result.identified) {
    console.log(`  ✓ ${mod.displayName} ${mod.installedVersionNumber} (${mod.file.filename})`);
  }
  for (const file of result.unidentified) {
    const metadata = file.metadata ? ` · ${file.metadata.name} (${file.metadata.format})` : '';
    console.log(`  ? ${file.filename}${metadata}`);
  }
}

async function scanInstance() {
  const { core, instance } = await prepareInstance();
  const scan = await core.scanAndIdentify(instance.modsDir, {
    cache: !parsed.noCache,
    metadataFallback: true,
    signal: operationController.signal,
  });
  return { core, instance, scan };
}

function selectedEnvironment(instance: InstanceResolution): { mcVersion: string; loader: string } {
  const mcVersion = parsed.mcVersion ?? instance.minecraftVersion;
  const loader = parsed.loader ?? instance.loader;
  if (!mcVersion) {
    throw new Error('Cannot determine Minecraft version. Pass --mc-version=<version> or set minecraftVersion in .upmods.json.');
  }
  if (!loader) {
    throw new Error('Cannot determine a mod loader. Pass --loader=<loader> or set loader in .upmods.json.');
  }
  return { mcVersion, loader };
}

async function runScan(): Promise<void> {
  const { instance, scan } = await scanInstance();
  if (parsed.json) console.log(JSON.stringify(scan, null, 2));
  else {
    printInstance(instance);
    printHumanScan(scan);
  }
}

async function runCheck(): Promise<void> {
  const { core, instance, scan } = await scanInstance();
  const { mcVersion, loader } = selectedEnvironment(instance);
  const channel = parsed.channel ?? instance.config.channel;
  const result = await core.checkUpdates(
    scan.identified,
    mcVersion,
    loader,
    channel,
    operationController.signal,
  );
  const output = { mcVersion, loader, channel, ...result };
  if (parsed.json) console.log(JSON.stringify(output, null, 2));
  else {
    printInstance(instance);
    console.log(`Minecraft ${mcVersion} · ${loader} · ${channel}`);
    console.log(`Updates: ${result.updates.length} · Up to date: ${result.upToDate.length}`);
    for (const update of result.updates) {
      console.log(`  ↑ ${update.mod.displayName}: ${update.mod.installedVersionNumber} → ${update.latestVersionNumber}`);
    }
  }
  if (result.updates.length > 0 && parsed.failOnUpdates) process.exitCode = 2;
}

async function lockfileVerification(
  core: Awaited<ReturnType<typeof prepareInstance>>['core'],
  scan: ScanResult,
) {
  const { MODPACK_LOCKFILE_FILENAME } = await import('@upmods/core');
  const lockfilePath = path.join(scan.directory, MODPACK_LOCKFILE_FILENAME);
  try {
    await access(lockfilePath);
  } catch {
    return null;
  }
  return await core.verifyLockfile(scan);
}

function printAudit(report: AuditReport): void {
  console.log(`Audit: ${report.errorCount} error(s) · ${report.warningCount} warning(s) · ${report.infoCount} info`);
  if (report.issues.length === 0) console.log('  ✓ No health issues found.');
  for (const entry of report.issues) {
    const marker = entry.severity === 'error' ? '✗' : entry.severity === 'warning' ? '!' : 'i';
    console.log(`  ${marker} [${entry.kind}] ${entry.message}`);
    console.log(`    Fix: ${entry.remediation}`);
  }
}

async function runAudit(): Promise<void> {
  const { core, instance, scan } = await scanInstance();
  const environment = {
    minecraftVersion: parsed.mcVersion ?? instance.minecraftVersion,
    loader: parsed.loader ?? instance.loader,
  };
  const verification = await lockfileVerification(core, scan);
  const report = core.audit(scan, { ...environment, lockfileVerification: verification });
  if (parsed.json) console.log(JSON.stringify({ instance, report }, null, 2));
  else {
    printInstance(instance);
    printAudit(report);
  }
  if (parsed.strict && report.errorCount > 0) process.exitCode = 2;
}

async function runLock(): Promise<void> {
  const { core, instance, scan } = await scanInstance();
  const { MODPACK_LOCKFILE_FILENAME } = await import('@upmods/core');
  const lockfile = await core.writeLockfile(scan);
  if (parsed.json) console.log(JSON.stringify(lockfile, null, 2));
  else {
    printInstance(instance);
    console.log(`Locked ${lockfile.mods.length} identified and ${lockfile.unidentified.length} unidentified JARs`);
    console.log(path.join(instance.modsDir, MODPACK_LOCKFILE_FILENAME));
  }
}

function formatLockedVersion(change: LockfileChange, side: 'expected' | 'actual'): string {
  const value = change[side];
  if (!value) return 'none';
  return 'versionNumber' in value ? value.versionNumber : value.filename;
}

async function runVerify(): Promise<void> {
  const { core, instance } = await prepareInstance();
  const { MODPACK_LOCKFILE_FILENAME, compareModpackLockfile, readModpackLockfile } = await import('@upmods/core');
  const lockfilePath = path.join(instance.modsDir, MODPACK_LOCKFILE_FILENAME);
  const lockfile = await readModpackLockfile(lockfilePath);
  const scan = await core.scanAndIdentify(instance.modsDir, {
    cache: !parsed.noCache,
    metadataFallback: true,
    signal: operationController.signal,
  });
  const result = compareModpackLockfile(lockfile, scan, lockfilePath);
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else if (result.valid) console.log(`✓ Mod set matches ${result.lockfilePath}`);
  else {
    console.log(`Mod set drift detected: ${result.changes.length} change(s)`);
    for (const change of result.changes) {
      if (change.kind === 'changed') {
        console.log(`  ~ ${change.displayName}: ${formatLockedVersion(change, 'expected')} → ${formatLockedVersion(change, 'actual')}`);
      } else console.log(`  ${change.kind === 'added' ? '+' : '-'} ${change.displayName}`);
    }
  }
  if (!result.valid) process.exitCode = 2;
}

function printUpdatePlan(plan: UpdatePlan): void {
  const counts = new Map<string, number>();
  for (const item of plan.items) counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  console.log(
    `Plan: ${counts.get('update') ?? 0} update · ${counts.get('up-to-date') ?? 0} current · `
    + `${counts.get('ignored') ?? 0} ignored · ${counts.get('pinned') ?? 0} pinned · ${counts.get('incompatible') ?? 0} incompatible`,
  );
  for (const item of plan.items) {
    const target = item.update ? ` → ${item.update.latestVersionNumber}` : '';
    console.log(`  ${item.action.padEnd(12)} ${item.mod.displayName}${target} · ${item.reason}`);
  }
}

async function runUpdate(): Promise<void> {
  const { core, instance, scan } = await scanInstance();
  const { mcVersion, loader } = selectedEnvironment(instance);
  const channel = parsed.channel ?? instance.config.channel;
  const policy = { channel, ignored: instance.config.ignored, pinned: instance.config.pinned };
  const verification = await lockfileVerification(core, scan);
  const audit = core.audit(scan, { minecraftVersion: mcVersion, loader, lockfileVerification: verification });
  const plan = await core.planUpdates(
    scan.identified,
    mcVersion,
    loader,
    policy,
    operationController.signal,
  );
  const safety = core.evaluateUpdateSafety(plan.items, audit, scan);
  const previewOnly = parsed.dryRun || !parsed.yes;

  if (previewOnly) {
    if (parsed.json) console.log(JSON.stringify({ instance, audit, plan, safety, dryRun: true }, null, 2));
    else {
      printInstance(instance);
      printAudit(audit);
      printUpdatePlan(plan);
      if (!safety.safe && safety.blockers[0]) {
        console.log(`Update blocked: ${safety.blockers[0].message}`);
        console.log(`Fix: ${safety.blockers[0].remediation}`);
      }
      console.log(parsed.dryRun
        ? 'Dry run complete; no files were downloaded or changed.'
        : 'Preview only; pass --yes to download, back up, and apply this plan.');
    }
    return;
  }

  if (!safety.safe) {
    const first = safety.blockers[0]!;
    throw new Error(
      `Update refused: ${safety.blockers.length} blocking issue(s). ${first.message} Fix: ${first.remediation}`,
    );
  }
  if (!['fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) {
    throw new Error(`Cannot persist unsupported loader "${loader}". Use fabric, forge, neoforge, or quilt.`);
  }

  const execution = await core.executeUpdatePlan(
    plan,
    instance.modsDir,
    operationController.signal,
    audit,
    scan,
  );
  if (execution.applied || plan.updates.length === 0) {
    await core.saveInstanceConfig(instance.instanceDir, {
      ...instance.config,
      minecraftVersion: mcVersion,
      loader: loader as SupportedModLoader,
      channel,
    });
  }
  if (!execution.applied && execution.failureReason) process.exitCode = 1;
  if (parsed.json) console.log(JSON.stringify({ instance, audit, execution }, null, 2));
  else {
    printInstance(instance);
    printAudit(audit);
    printUpdatePlan(plan);
    if (execution.applied) {
      console.log(`✓ Applied ${execution.applyResult?.appliedCount ?? 0} update(s) with backup ${execution.applyResult?.session.sessionId}.`);
    } else if (execution.failureReason) {
      console.log(`✗ ${execution.failureReason}`);
    } else console.log('✓ No updates needed; no files changed.');
  }
}

async function runRollback(): Promise<void> {
  const { core, instance } = await prepareInstance();
  const result = await core.rollbackLatestSession(instance.modsDir);
  console.log(`Rolled back ${result.restoredCount} mods from session ${result.sessionId}`);
  console.log(`Backup dir: ${result.backupDir}`);
}

function hasConfigChanges(): boolean {
  return parsed.mcVersion !== undefined
    || parsed.loader !== undefined
    || parsed.channel !== undefined
    || parsed.ignore.length > 0
    || parsed.unignore.length > 0
    || parsed.pin.length > 0
    || parsed.unpin.length > 0
    || parsed.clearMcVersion
    || parsed.clearLoader;
}

function configPatch(): InstanceConfigPatch {
  let loader: SupportedModLoader | null | undefined;
  if (parsed.clearLoader) loader = null;
  else if (parsed.loader !== undefined) {
    if (!['fabric', 'forge', 'neoforge', 'quilt'].includes(parsed.loader)) {
      throw new Error(`Invalid loader: ${parsed.loader}. Use fabric, forge, neoforge, or quilt.`);
    }
    loader = parsed.loader as SupportedModLoader;
  }
  return {
    ...(parsed.clearMcVersion
      ? { minecraftVersion: null }
      : parsed.mcVersion !== undefined ? { minecraftVersion: parsed.mcVersion } : {}),
    ...(loader !== undefined ? { loader } : {}),
    ...(parsed.channel !== undefined ? { channel: parsed.channel } : {}),
    addIgnored: parsed.ignore,
    removeIgnored: parsed.unignore,
    setPinned: Object.fromEntries(parsed.pin.map((entry) => [entry.project, entry.version])),
    removePinned: parsed.unpin,
  };
}

function printConfig(instance: InstanceResolution, configPath: string, config: InstanceConfig, updated: boolean): void {
  console.log(`${updated ? 'Saved' : 'Settings'}: ${configPath}`);
  console.log(`Minecraft: ${config.minecraftVersion ?? `(automatic${instance.minecraftVersion ? `; detected ${instance.minecraftVersion}` : ''})`}`);
  console.log(`Loader: ${config.loader ?? `(automatic${instance.loader ? `; detected ${instance.loader}` : ''})`}`);
  console.log(`Channel: ${config.channel}`);
  console.log(`Ignored (${config.ignored.length}): ${config.ignored.join(', ') || 'none'}`);
  const pins = Object.entries(config.pinned);
  console.log(`Pinned (${pins.length}):`);
  if (pins.length === 0) console.log('  none');
  else for (const [project, version] of pins) console.log(`  ${project} = ${version}`);
}

async function runConfig(): Promise<void> {
  const { core, instance } = await prepareInstance();
  const updated = hasConfigChanges();
  const result = updated
    ? await core.updateInstanceConfig(instance.instanceDir, configPatch())
    : await core.getInstanceConfig(instance.instanceDir);
  const displayInstance = updated ? await core.resolveInstance(instance.instanceDir) : instance;
  if (parsed.json) {
    console.log(JSON.stringify({
      instanceDir: displayInstance.instanceDir,
      modsDir: displayInstance.modsDir,
      configPath: result.configPath,
      config: result.config,
      updated,
    }, null, 2));
  } else printConfig(displayInstance, result.configPath, result.config, updated);
}

async function runInteractive(): Promise<void> {
  const { instance } = await prepareInstance();
  enterScreen();
  process.stdout.write(`upmods ${CLI_VERSION}\nStarting…`);
  const onSigint = () => { restoreScreen(); process.exit(130); };
  const onSigterm = () => { restoreScreen(); process.exit(143); };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    const { runTui } = await import('./tui.js');
    process.stdout.write(CLEAR_SCREEN);
    const tui = runTui(instance);
    await tui.waitUntilExit();
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    restoreScreen();
  }
}

async function main(): Promise<void> {
  if (parsed.help) { console.log(HELP); return; }
  if (parsed.version) { console.log(CLI_VERSION); return; }
  switch (parsed.command) {
    case 'scan': await runScan(); break;
    case 'check': await runCheck(); break;
    case 'audit': await runAudit(); break;
    case 'lock': await runLock(); break;
    case 'verify': await runVerify(); break;
    case 'update': await runUpdate(); break;
    case 'rollback': await runRollback(); break;
    case 'config': await runConfig(); break;
    case 'interactive': await runInteractive(); break;
  }
}

const onCommandSigint = () => {
  cancellationExitCode = 130;
  process.exitCode = cancellationExitCode;
  operationController.abort();
};
const onCommandSigterm = () => {
  cancellationExitCode = 143;
  process.exitCode = cancellationExitCode;
  operationController.abort();
};
const handlesCommandSignals = parsed.command !== 'interactive' && !parsed.help && !parsed.version;
if (handlesCommandSignals) {
  process.once('SIGINT', onCommandSigint);
  process.once('SIGTERM', onCommandSigterm);
}

main().catch((error: unknown) => {
  restoreScreen();
  const value = error as { name?: unknown; code?: unknown } | null;
  const cancelled = value?.name === 'AbortError' || value?.code === 'UPMODS_CANCELLED';
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = cancelled ? cancellationExitCode : 1;
}).finally(() => {
  if (handlesCommandSignals) {
    process.off('SIGINT', onCommandSigint);
    process.off('SIGTERM', onCommandSigterm);
  }
});
