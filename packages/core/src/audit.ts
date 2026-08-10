import path from 'node:path';
import type {
  AuditIssue,
  AuditOptions,
  AuditReport,
  LocalModDependency,
  Mod,
  ModFile,
  ScanResult,
  UpdatePlanItem,
  UpdateSafetyReport,
} from './types.js';

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

function numericVersion(value: string): number[] | null {
  const match = value.match(/^([0-9]+(?:\.[0-9]+){0,3})/);
  return match ? match[1]!.split('.').map(Number) : null;
}

function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Returns false only when the supported syntaxes make incompatibility clear. */
function versionRangeSupports(range: string | undefined, version: string): boolean | null {
  if (!range || range === '*' || range.toLowerCase() === 'any') return null;
  const target = numericVersion(version);
  if (!target) return null;
  if (range === version || range.split(/\s*\|\|\s*|\s*,\s*/).includes(version)) return true;

  const forge = range.match(/^([[(])\s*([^,]*)\s*,\s*([^\])]*?)\s*([\])])$/);
  if (forge) {
    const lower = numericVersion(forge[2] ?? '');
    const upper = numericVersion(forge[3] ?? '');
    const lowerOk = !lower || compareVersions(target, lower) > 0 || (forge[1] === '[' && compareVersions(target, lower) === 0);
    const upperOk = !upper || compareVersions(target, upper) < 0 || (forge[4] === ']' && compareVersions(target, upper) === 0);
    return lowerOk && upperOk;
  }

  const constraints = [...range.matchAll(/(>=|<=|>|<|=|\^|~)?\s*(\d+(?:\.\d+){0,3})/g)];
  if (constraints.length === 0) return range.includes(version) ? true : null;
  for (const constraint of constraints) {
    const operator = constraint[1] ?? '=';
    const compared = numericVersion(constraint[2] ?? '');
    if (!compared) continue;
    const difference = compareVersions(target, compared);
    if (operator === '>=' && difference < 0) return false;
    if (operator === '>' && difference <= 0) return false;
    if (operator === '<=' && difference > 0) return false;
    if (operator === '<' && difference >= 0) return false;
    if (operator === '=' && difference !== 0) return false;
    if ((operator === '^' || operator === '~') && target[0] !== compared[0]) return false;
  }
  return true;
}

function issue(
  kind: AuditIssue['kind'],
  severity: AuditIssue['severity'],
  id: string,
  message: string,
  files: string[],
  remediation: string,
): AuditIssue {
  return { id: `${kind}:${id}`, kind, severity, message, files: [...files].sort(), remediation };
}

interface InstalledDependencyVersion {
  displayName: string;
  filename: string;
  versionId?: string;
  versionNumber?: string;
}

interface AuditedDependency extends LocalModDependency {
  versionId?: string | null;
  lookupId?: string;
}

const VERSION_LOOKUP_PREFIX = 'version:';

function addInstalled(
  index: Map<string, InstalledDependencyVersion[]>,
  key: string,
  value: InstalledDependencyVersion,
): void {
  const normalized = key.toLowerCase();
  const values = index.get(normalized) ?? [];
  if (!values.includes(value)) values.push(value);
  index.set(normalized, values);
}

function installedVersions(scan: ScanResult): Map<string, InstalledDependencyVersion[]> {
  const index = new Map<string, InstalledDependencyVersion[]>();
  for (const mod of scan.identified) {
    if (mod.file.disabled) continue;
    const value = {
      displayName: mod.displayName,
      filename: mod.file.filename,
      versionId: mod.installedVersionId,
      versionNumber: mod.installedVersionNumber,
    };
    addInstalled(index, mod.projectId, value);
    addInstalled(index, mod.projectSlug, value);
    addInstalled(index, `${VERSION_LOOKUP_PREFIX}${mod.installedVersionId}`, value);
  }
  for (const file of scan.unidentified) {
    if (!file.disabled && file.metadata) {
      addInstalled(index, file.metadata.id, {
        displayName: file.metadata.name,
        filename: file.filename,
        ...(file.metadata.version ? { versionNumber: file.metadata.version } : {}),
      });
    }
  }
  return index;
}

function dependencyVersionMatches(
  dependency: AuditedDependency,
  installed: InstalledDependencyVersion,
): boolean | null {
  if (dependency.versionId) {
    return installed.versionId ? installed.versionId === dependency.versionId : null;
  }
  if (dependency.versionRange) {
    return installed.versionNumber
      ? versionRangeSupports(dependency.versionRange, installed.versionNumber)
      : null;
  }
  return true;
}

function dependencyIssues(
  owner: string,
  filename: string,
  dependencies: AuditedDependency[],
  installed: Map<string, InstalledDependencyVersion[]>,
): AuditIssue[] {
  const result: AuditIssue[] = [];
  for (const dependency of dependencies) {
    const candidates = installed.get((dependency.lookupId ?? dependency.id).toLowerCase()) ?? [];
    if (dependency.type === 'required' && candidates.length === 0) {
      result.push(issue(
        'missing-required-dependency',
        'error',
        `${owner}:${dependency.id}`,
        `${owner} requires ${dependency.id}, but it is not installed.`,
        [filename],
        `Install a compatible ${dependency.id} build, then run upmods audit again.`,
      ));
    }
    if (dependency.type === 'required' && candidates.length > 0) {
      const matches = candidates.map((candidate) => dependencyVersionMatches(dependency, candidate));
      if (matches.length > 0 && matches.every((matchesVersion) => matchesVersion === false)) {
        const expected = dependency.versionId ?? dependency.versionRange ?? 'a compatible version';
        const actual = candidates.map((candidate) => candidate.versionNumber ?? candidate.versionId ?? 'unknown').join(', ');
        result.push(issue(
          'incompatible-dependency',
          'error',
          `${owner}:${dependency.id}:version`,
          `${owner} requires ${dependency.id} ${expected}, but the active version is ${actual}.`,
          [filename, ...candidates.map((candidate) => candidate.filename)],
          `Install ${dependency.id} ${expected}, then run upmods audit again.`,
        ));
      }
    }
    if (dependency.type === 'incompatible' && candidates.length > 0) {
      const matches = candidates.map((candidate) => dependencyVersionMatches(dependency, candidate));
      if (!matches.some((matchesVersion) => matchesVersion === true)) continue;
      const constraint = dependency.versionId ?? dependency.versionRange;
      result.push(issue(
        'incompatible-dependency',
        'error',
        `${owner}:${dependency.id}`,
        `${owner} declares the active ${dependency.id}${constraint ? ` ${constraint}` : ''} as incompatible.`,
        [filename, ...candidates.map((candidate) => candidate.filename)],
        `Remove one of the conflicting mods, then run upmods audit again.`,
      ));
    }
  }
  return result;
}

function modrinthDependencyIssues(
  mod: Mod,
  installed: Map<string, InstalledDependencyVersion[]>,
): AuditIssue[] {
  const dependencies: AuditedDependency[] = (mod.dependencies ?? [])
    .filter((dependency) => (dependency.projectId || dependency.versionId)
      && ['required', 'incompatible'].includes(dependency.dependencyType))
    .map((dependency) => ({
      id: dependency.projectId ?? `version ${dependency.versionId!}`,
      lookupId: dependency.projectId ?? `${VERSION_LOOKUP_PREFIX}${dependency.versionId!}`,
      type: dependency.dependencyType === 'incompatible' ? 'incompatible' : 'required',
      ...(dependency.versionId ? { versionId: dependency.versionId } : {}),
    }));
  return dependencyIssues(mod.displayName, mod.file.filename, dependencies, installed);
}

function projectedInstalledVersions(
  items: UpdatePlanItem[],
  scan?: ScanResult,
): Map<string, InstalledDependencyVersion[]> {
  const index = new Map<string, InstalledDependencyVersion[]>();
  const selectedBySha1 = new Map(
    items.flatMap((item) => item.update ? [[item.mod.file.sha1, item.update] as const] : []),
  );
  const mods = scan?.identified ?? items.map((item) => item.mod);

  for (const mod of mods) {
    if (mod.file.disabled) continue;
    const update = selectedBySha1.get(mod.file.sha1);
    const versionId = update?.latestVersionId ?? mod.installedVersionId;
    const versionNumber = update?.latestVersionNumber ?? mod.installedVersionNumber;
    const value = {
      displayName: mod.displayName,
      filename: update?.downloadFilename ?? mod.file.filename,
      versionId,
      versionNumber,
    };
    addInstalled(index, mod.projectId, value);
    addInstalled(index, mod.projectSlug, value);
    addInstalled(index, `${VERSION_LOOKUP_PREFIX}${versionId}`, value);
  }

  for (const file of scan?.unidentified ?? []) {
    if (!file.disabled && file.metadata) {
      addInstalled(index, file.metadata.id, {
        displayName: file.metadata.name,
        filename: file.filename,
        ...(file.metadata.version ? { versionNumber: file.metadata.version } : {}),
      });
    }
  }
  return index;
}

function projectedDependencyIssues(items: UpdatePlanItem[], scan?: ScanResult): AuditIssue[] {
  const installed = projectedInstalledVersions(items, scan);
  const selectedBySha1 = new Map(
    items.flatMap((item) => item.update ? [[item.mod.file.sha1, item.update] as const] : []),
  );
  const mods = scan?.identified ?? items.map((item) => item.mod);
  const issues: AuditIssue[] = [];

  for (const mod of mods) {
    if (mod.file.disabled) continue;
    const update = selectedBySha1.get(mod.file.sha1);
    const projected: Mod = update
      ? {
          ...mod,
          file: { ...mod.file, filename: update.downloadFilename },
          installedVersionId: update.latestVersionId,
          installedVersionNumber: update.latestVersionNumber,
          dependencies: update.dependencies ?? mod.dependencies,
        }
      : mod;
    issues.push(...modrinthDependencyIssues(projected, installed));
  }

  for (const file of scan?.unidentified ?? []) {
    if (!file.disabled && file.metadata) {
      issues.push(...dependencyIssues(file.metadata.name, file.filename, file.metadata.dependencies, installed));
    }
  }
  return issues;
}

/** Pure audit logic. All disk and network access must happen before calling this function. */
export function auditModSet(scan: ScanResult, options: AuditOptions = {}): AuditReport {
  const issues: AuditIssue[] = [];
  const allFiles: ModFile[] = [...scan.identified.map((mod) => mod.file), ...scan.unidentified];
  const activeMods = scan.identified.filter((mod) => !mod.file.disabled);
  const installed = installedVersions(scan);

  for (const [projectId, mods] of groupBy(activeMods, (mod) => mod.projectId).entries()) {
    if (mods.length < 2) continue;
    issues.push(issue(
      'duplicate-project',
      'error',
      projectId,
      `${mods[0]?.displayName ?? projectId} has ${mods.length} active JARs for the same project.`,
      mods.map((mod) => mod.file.filename),
      'Keep one compatible version and move the other JARs out of the mods directory.',
    ));
  }

  for (const [sha1, files] of groupBy(allFiles.filter((file) => !file.disabled), (file) => file.sha1).entries()) {
    if (files.length < 2) continue;
    issues.push(issue(
      'duplicate-content',
      'error',
      sha1,
      `${files.length} active files have identical contents.`,
      files.map((file) => file.filename),
      'Remove duplicate copies and keep one JAR.',
    ));
  }

  for (const mod of activeMods) {
    if (options.loader && !mod.loaders.includes(options.loader)) {
      issues.push(issue(
        'loader-incompatible',
        'error',
        mod.file.sha1,
        `${mod.displayName} does not declare ${options.loader} support.`,
        [mod.file.filename],
        `Install a ${options.loader} build of this mod or correct the saved loader setting.`,
      ));
    }
    if (options.minecraftVersion && !mod.supportedMcVersions.includes(options.minecraftVersion)) {
      issues.push(issue(
        'minecraft-incompatible',
        'error',
        mod.file.sha1,
        `${mod.displayName} does not declare Minecraft ${options.minecraftVersion} support.`,
        [mod.file.filename],
        `Install a Minecraft ${options.minecraftVersion} build or correct the saved version setting.`,
      ));
    }
    issues.push(...modrinthDependencyIssues(mod, installed));
  }

  for (const file of scan.unidentified) {
    const metadata = file.metadata;
    issues.push(issue(
      'unidentified-jar',
      'warning',
      file.sha1,
      metadata
        ? `${file.filename} is not mapped to a Modrinth project; local ${metadata.format} metadata identifies it as ${metadata.name}.`
        : `${file.filename} could not be identified from Modrinth or safe local metadata.`,
      [file.filename],
      'Review this JAR manually. upmods will not download a replacement without a reliable project mapping.',
    ));
    if (!metadata || file.disabled) continue;
    if (options.loader && !metadata.loaders.some((loader) => loader === options.loader)) {
      issues.push(issue(
        'loader-incompatible',
        'error',
        file.sha1,
        `${metadata.name} local metadata targets ${metadata.loaders.join(', ')}, not ${options.loader}.`,
        [file.filename],
        'Replace it with a build for the configured loader or correct the instance setting.',
      ));
    }
    const supportsMinecraft = options.minecraftVersion
      ? versionRangeSupports(metadata.minecraftVersionRange, options.minecraftVersion)
      : null;
    if (supportsMinecraft === false) {
      issues.push(issue(
        'minecraft-incompatible',
        'error',
        file.sha1,
        `${metadata.name} local metadata excludes Minecraft ${options.minecraftVersion}.`,
        [file.filename],
        'Replace it with a compatible build or correct the instance setting.',
      ));
    }
    issues.push(...dependencyIssues(metadata.name, file.filename, metadata.dependencies, installed));
  }

  for (const file of allFiles.filter((candidate) => candidate.disabled || /\.jar\.(?:disabled|old|bak)$/i.test(candidate.filename))) {
    issues.push(issue(
      'disabled-or-legacy-jar',
      'warning',
      file.sha1,
      `${file.filename} appears disabled or retained as an old backup.`,
      [file.filename],
      `Move legacy files outside ${path.basename(scan.directory)} after confirming they are no longer needed.`,
    ));
  }

  for (const change of options.lockfileVerification?.changes ?? []) {
    issues.push(issue(
      'lockfile-drift',
      'warning',
      `${change.kind}:${change.projectId ?? change.displayName}`,
      `Lockfile drift: ${change.kind} ${change.displayName}.`,
      [change.actual?.filename ?? change.expected?.filename ?? change.displayName],
      'Review the change, then run upmods lock if the current set is intentional.',
    ));
  }

  const sorted = issues.sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity] || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  });
  const errorCount = sorted.filter((entry) => entry.severity === 'error').length;
  const warningCount = sorted.filter((entry) => entry.severity === 'warning').length;
  const infoCount = sorted.filter((entry) => entry.severity === 'info').length;
  return {
    directory: scan.directory,
    issues: sorted,
    errorCount,
    warningCount,
    infoCount,
    healthy: errorCount === 0,
  };
}

/** Pure policy shared by CLI, TUI, and update execution. */
export function evaluateUpdateSafety(
  items: UpdatePlanItem[],
  auditReport?: AuditReport | null,
  scan?: ScanResult | null,
): UpdateSafetyReport {
  const blockers: UpdateSafetyReport['blockers'] = [];
  const replacedFiles = new Set(
    items.flatMap((item) => item.update ? [item.update.mod.file.filename] : []),
  );

  for (const auditIssue of auditReport?.issues ?? []) {
    if (auditIssue.severity !== 'error') continue;
    if (scan && (auditIssue.kind === 'missing-required-dependency'
      || auditIssue.kind === 'incompatible-dependency')) continue;
    const repairedByPlannedReplacement = (
      auditIssue.kind === 'loader-incompatible' || auditIssue.kind === 'minecraft-incompatible'
    ) && auditIssue.files.length > 0
      && auditIssue.files.every((filename) => replacedFiles.has(filename));
    if (repairedByPlannedReplacement) continue;
    blockers.push({
      source: 'audit',
      kind: auditIssue.kind,
      message: auditIssue.message,
      files: auditIssue.files,
      remediation: auditIssue.remediation,
    });
  }

  for (const item of items.filter((candidate) => candidate.action === 'incompatible')) {
    blockers.push({
      source: 'plan',
      kind: 'incompatible-update-plan',
      message: `${item.mod.displayName}: ${item.reason}`,
      files: [item.mod.file.filename],
      remediation: 'Change the pin or target environment, then run the update preview again.',
    });
  }

  for (const dependencyIssue of projectedDependencyIssues(items, scan ?? undefined)) {
    if (dependencyIssue.severity !== 'error') continue;
    blockers.push({
      source: 'update-dependency',
      kind: dependencyIssue.kind,
      message: dependencyIssue.message,
      files: dependencyIssue.files,
      remediation: dependencyIssue.remediation,
    });
  }

  const unique = [...new Map(blockers.map((blocker) => [
    `${blocker.kind}:${blocker.message}:${blocker.files.join('\0')}`,
    blocker,
  ])).values()];

  return { safe: unique.length === 0, blockers: unique };
}

/** Keep non-update decisions plus only the updates selected for this operation. */
export function selectUpdatePlanItems(
  items: UpdatePlanItem[],
  selectedUpdateSha1s: Iterable<string>,
): UpdatePlanItem[] {
  const selected = new Set(selectedUpdateSha1s);
  return items.filter((item) => !item.update || selected.has(item.update.mod.file.sha1));
}

export function updateSafetyFailureMessage(report: UpdateSafetyReport): string {
  const first = report.blockers[0];
  if (!first) return 'Update safety check passed.';
  return `Update refused: ${report.blockers.length} blocking issue(s). ${first.message} Fix: ${first.remediation}`;
}
