import { randomUUID } from 'node:crypto';
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DetectionConfidence,
  InstanceConfig,
  InstanceConfigPatch,
  InstanceConfigUpdateResult,
  InstanceKind,
  InstanceResolution,
  InstanceSuggestion,
  SupportedModLoader,
} from './types.js';

export const INSTANCE_CONFIG_FILENAME = '.upmods.json';
const CONFIG_MAX_BYTES = 1024 * 1024;
const KNOWN_LOADERS = new Set<SupportedModLoader>(['fabric', 'forge', 'neoforge', 'quilt']);
const DEFAULT_CONFIG: InstanceConfig = {
  schemaVersion: 1,
  channel: 'stable-only',
  ignored: [],
  pinned: {},
};
const PROJECT_REFERENCE_PATTERN = /^[A-Za-z0-9_-]+$/;
const MINECRAFT_VERSION_PATTERN = /^1\.[0-9]+(?:\.[0-9]+)?$/;

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

async function readSmallText(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile() || stats.size > CONFIG_MAX_BYTES) return null;
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  const text = await readSmallText(filePath);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeLoader(value: unknown): SupportedModLoader | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('neoforge')) return 'neoforge';
  if (normalized.includes('fabric')) return 'fabric';
  if (normalized.includes('quilt')) return 'quilt';
  if (normalized.includes('forge')) return 'forge';
  return null;
}

function normalizeMinecraftVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/(?:^|[^0-9])(1\.[0-9]+(?:\.[0-9]+)?)(?:$|[^0-9])/);
  return match?.[1] ?? (/^1\.[0-9]+(?:\.[0-9]+)?$/.test(value) ? value : null);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function parseConfig(value: Record<string, unknown> | null): InstanceConfig {
  if (!value || value['schemaVersion'] !== 1) return { ...DEFAULT_CONFIG };
  const loader = normalizeLoader(value['loader']);
  const channel = value['channel'] === 'allow-beta' ? 'allow-beta' : 'stable-only';
  const pinnedValue = value['pinned'];
  const pinned = pinnedValue && typeof pinnedValue === 'object' && !Array.isArray(pinnedValue)
    ? Object.fromEntries(Object.entries(pinnedValue).filter((entry): entry is [string, string] => (
        entry[0].length > 0 && typeof entry[1] === 'string' && entry[1].length > 0
      )))
    : {};
  return {
    schemaVersion: 1,
    ...(typeof value['minecraftVersion'] === 'string'
      ? { minecraftVersion: value['minecraftVersion'] }
      : {}),
    ...(loader ? { loader } : {}),
    channel,
    ignored: isStringArray(value['ignored']) ? [...new Set(value['ignored'])] : [],
    pinned,
  };
}

export async function readInstanceConfig(configPath: string): Promise<InstanceConfig> {
  return parseConfig(await readJsonObject(configPath));
}

export async function writeInstanceConfig(
  instanceDir: string,
  config: InstanceConfig,
): Promise<string> {
  const configPath = path.join(path.resolve(instanceDir), INSTANCE_CONFIG_FILENAME);
  const normalized = parseConfig(config as unknown as Record<string, unknown>);
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await rename(tempPath, configPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot save instance settings to ${configPath}: ${message}. Check directory permissions.`);
  }
  return configPath;
}

function cleanProjectReference(value: string, context: string): string {
  const normalized = value.trim();
  if (!PROJECT_REFERENCE_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid project ID or slug for ${context}: "${value}". Use letters, numbers, underscores, or hyphens.`,
    );
  }
  return normalized;
}

function cleanPinnedVersion(value: string, project: string): string {
  const normalized = value.trim();
  if (!isValidPinnedVersion(normalized)) {
    throw new Error(`Invalid pinned version for ${project}. Use a Modrinth version ID or version number.`);
  }
  return normalized;
}

function isValidPinnedVersion(value: string): boolean {
  return value.length > 0
    && value.length <= 200
    && [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    });
}

function removeCaseInsensitive(values: string[], removals: string[]): string[] {
  const keys = new Set(removals.map((entry) => cleanProjectReference(entry, 'unignore').toLowerCase()));
  return values.filter((entry) => !keys.has(entry.toLowerCase()));
}

function mergeIgnored(existing: string[], additions: string[], removals: string[]): string[] {
  const result = removeCaseInsensitive(existing, removals);
  const seen = new Set(result.map((entry) => entry.toLowerCase()));
  for (const raw of additions) {
    const entry = cleanProjectReference(raw, 'ignore');
    if (!seen.has(entry.toLowerCase())) {
      seen.add(entry.toLowerCase());
      result.push(entry);
    }
  }
  return result;
}

function mergePinned(
  existing: Record<string, string>,
  additions: Record<string, string>,
  removals: string[],
): Record<string, string> {
  const result = { ...existing };
  const findKey = (reference: string): string | undefined => (
    Object.keys(result).find((key) => key.toLowerCase() === reference.toLowerCase())
  );
  for (const raw of removals) {
    const reference = cleanProjectReference(raw, 'unpin');
    const existingKey = findKey(reference);
    if (existingKey) delete result[existingKey];
  }
  for (const [rawProject, rawVersion] of Object.entries(additions)) {
    const project = cleanProjectReference(rawProject, 'pin');
    const existingKey = findKey(project);
    if (existingKey && existingKey !== project) delete result[existingKey];
    result[project] = cleanPinnedVersion(rawVersion, project);
  }
  return result;
}

export function patchInstanceConfig(
  current: InstanceConfig,
  patch: InstanceConfigPatch,
): InstanceConfig {
  if (patch.minecraftVersion !== undefined && patch.minecraftVersion !== null
    && !MINECRAFT_VERSION_PATTERN.test(patch.minecraftVersion)) {
    throw new Error(
      `Invalid Minecraft version: ${patch.minecraftVersion}. Use a version such as 1.21.1.`,
    );
  }
  if (patch.loader !== undefined && patch.loader !== null && !KNOWN_LOADERS.has(patch.loader)) {
    throw new Error(`Invalid loader: ${patch.loader}. Use fabric, forge, neoforge, or quilt.`);
  }
  if (patch.channel !== undefined && patch.channel !== 'stable-only' && patch.channel !== 'allow-beta') {
    throw new Error(`Invalid update channel: ${String(patch.channel)}. Use stable-only or allow-beta.`);
  }

  const next: InstanceConfig = {
    ...current,
    schemaVersion: 1,
    channel: patch.channel ?? current.channel,
    ignored: mergeIgnored(current.ignored, patch.addIgnored ?? [], patch.removeIgnored ?? []),
    pinned: mergePinned(current.pinned, patch.setPinned ?? {}, patch.removePinned ?? []),
  };
  if (patch.minecraftVersion === null) delete next.minecraftVersion;
  else if (patch.minecraftVersion !== undefined) next.minecraftVersion = patch.minecraftVersion;
  if (patch.loader === null) delete next.loader;
  else if (patch.loader !== undefined) next.loader = patch.loader;
  return next;
}

function validateConfigForMutation(value: unknown, configPath: string): InstanceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cannot update ${configPath}: expected a JSON object. Fix the file or delete it and retry.`);
  }
  const object = value as Record<string, unknown>;
  const pinned = object['pinned'];
  const validPinned = pinned === undefined || (
    pinned !== null && typeof pinned === 'object' && !Array.isArray(pinned)
    && Object.entries(pinned).every(([key, entry]) => (
      PROJECT_REFERENCE_PATTERN.test(key) && typeof entry === 'string' && isValidPinnedVersion(entry.trim())
    ))
  );
  if (object['schemaVersion'] !== 1
    || (object['minecraftVersion'] !== undefined
      && (typeof object['minecraftVersion'] !== 'string'
        || !MINECRAFT_VERSION_PATTERN.test(object['minecraftVersion'])))
    || (object['loader'] !== undefined
      && (typeof object['loader'] !== 'string'
        || !KNOWN_LOADERS.has(object['loader'] as SupportedModLoader)))
    || (object['channel'] !== undefined
      && object['channel'] !== 'stable-only' && object['channel'] !== 'allow-beta')
    || (object['ignored'] !== undefined
      && (!isStringArray(object['ignored'])
        || !object['ignored'].every((entry) => PROJECT_REFERENCE_PATTERN.test(entry))))
    || !validPinned) {
    throw new Error(
      `Cannot update ${configPath}: unsupported schema or invalid setting types. Fix the file or delete it and retry.`,
    );
  }
  return parseConfig(object);
}

async function readConfigForMutation(configPath: string): Promise<InstanceConfig> {
  try {
    const file = await stat(configPath);
    if (!file.isFile() || file.size > CONFIG_MAX_BYTES) {
      throw new Error(`settings file must be a regular file no larger than ${CONFIG_MAX_BYTES} bytes`);
    }
    const text = await readFile(configPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return validateConfigForMutation(parsed, configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG };
    if (error instanceof Error && error.message.startsWith(`Cannot update ${configPath}:`)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot update ${configPath}: ${message}. Fix the file or delete it and retry.`);
  }
}

export async function updateInstanceConfig(
  instanceDir: string,
  patch: InstanceConfigPatch,
): Promise<InstanceConfigUpdateResult> {
  const resolvedInstanceDir = path.resolve(instanceDir);
  const configPath = path.join(resolvedInstanceDir, INSTANCE_CONFIG_FILENAME);
  const current = await readConfigForMutation(configPath);
  const config = patchInstanceConfig(current, patch);
  await writeInstanceConfig(resolvedInstanceDir, config);
  return { configPath, config };
}

export async function getInstanceConfig(instanceDir: string): Promise<InstanceConfigUpdateResult> {
  const configPath = path.join(path.resolve(instanceDir), INSTANCE_CONFIG_FILENAME);
  return { configPath, config: await readConfigForMutation(configPath) };
}

function addSuggestion(
  target: InstanceSuggestion[],
  value: string | null,
  source: string,
  confidence: DetectionConfidence,
): void {
  if (!value) return;
  if (target.some((candidate) => candidate.value === value && candidate.source === source)) return;
  target.push({ value, source, confidence });
}

function suggestionRank(confidence: DetectionConfidence): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function chooseSuggestion(suggestions: InstanceSuggestion[]): { value: string | null; ambiguous: boolean } {
  const stored = suggestions.find((entry) => entry.source === INSTANCE_CONFIG_FILENAME);
  if (stored) return { value: stored.value, ambiguous: false };
  const sorted = [...suggestions].sort((a, b) => suggestionRank(b.confidence) - suggestionRank(a.confidence));
  const topRank = sorted[0] ? suggestionRank(sorted[0].confidence) : 0;
  const topValues = new Set(sorted.filter((entry) => suggestionRank(entry.confidence) === topRank).map((entry) => entry.value));
  return { value: topValues.size === 1 ? sorted[0]?.value ?? null : null, ambiguous: topValues.size > 1 };
}

async function hasJarFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && /\.jar(?:\.(?:disabled|old|bak))?$/i.test(entry.name));
  } catch {
    return false;
  }
}

async function detectKind(instanceDir: string, modsDir: string): Promise<InstanceKind> {
  if (path.resolve(instanceDir) === path.resolve(modsDir)) return 'mods-directory';
  if (await isFile(path.join(instanceDir, 'instance.cfg')) || await isFile(path.join(instanceDir, 'mmc-pack.json'))) return 'prism';
  if (await isFile(path.join(instanceDir, 'minecraftinstance.json'))) return 'curseforge';
  if (await isFile(path.join(instanceDir, 'profile.json')) || await isFile(path.join(instanceDir, 'instance.json'))) return 'modrinth';
  if (path.basename(instanceDir).toLowerCase() === '.minecraft' || await isFile(path.join(instanceDir, 'launcher_profiles.json'))) return 'minecraft';
  return 'unknown';
}

function collectComponentSuggestions(
  document: Record<string, unknown>,
  versions: InstanceSuggestion[],
  loaders: InstanceSuggestion[],
): void {
  const components = Array.isArray(document['components']) ? document['components'] : [];
  for (const raw of components) {
    if (!raw || typeof raw !== 'object') continue;
    const component = raw as Record<string, unknown>;
    const uid = typeof component['uid'] === 'string' ? component['uid'] : '';
    const version = typeof component['version'] === 'string' ? component['version'] : '';
    if (uid === 'net.minecraft') addSuggestion(versions, normalizeMinecraftVersion(version), 'mmc-pack.json', 'high');
    addSuggestion(loaders, normalizeLoader(uid), 'mmc-pack.json', 'high');
  }
}

function collectManifestSuggestions(
  document: Record<string, unknown>,
  source: string,
  versions: InstanceSuggestion[],
  loaders: InstanceSuggestion[],
): void {
  const minecraft = document['minecraft'];
  if (minecraft && typeof minecraft === 'object' && !Array.isArray(minecraft)) {
    const value = minecraft as Record<string, unknown>;
    addSuggestion(versions, normalizeMinecraftVersion(value['version']), source, 'high');
    const modLoaders = Array.isArray(value['modLoaders']) ? value['modLoaders'] : [];
    for (const raw of modLoaders) {
      if (!raw || typeof raw !== 'object') continue;
      addSuggestion(loaders, normalizeLoader((raw as Record<string, unknown>)['id']), source, 'high');
    }
  }
  addSuggestion(versions, normalizeMinecraftVersion(document['gameVersion'] ?? document['game_version']), source, 'high');
  addSuggestion(loaders, normalizeLoader(document['loader'] ?? document['modLoader']), source, 'high');
  const baseModLoader = document['baseModLoader'];
  if (baseModLoader && typeof baseModLoader === 'object' && !Array.isArray(baseModLoader)) {
    addSuggestion(loaders, normalizeLoader((baseModLoader as Record<string, unknown>)['name']), source, 'high');
  }
}

async function collectLauncherProfileSuggestions(
  filePath: string,
  versions: InstanceSuggestion[],
  loaders: InstanceSuggestion[],
): Promise<void> {
  const document = await readJsonObject(filePath);
  if (!document) return;
  const profiles = document['profiles'];
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return;
  const values = Object.values(profiles as Record<string, unknown>);
  if (values.length !== 1) return;
  const profile = values[0];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return;
  const versionId = (profile as Record<string, unknown>)['lastVersionId'];
  addSuggestion(versions, normalizeMinecraftVersion(versionId), 'launcher_profiles.json', 'medium');
  addSuggestion(loaders, normalizeLoader(versionId), 'launcher_profiles.json', 'medium');
}

export async function resolveInstance(inputDir: string): Promise<InstanceResolution> {
  const resolvedInput = path.resolve(inputDir);
  if (!await isDirectory(resolvedInput)) {
    throw new Error(`Instance path is not a directory: ${resolvedInput}. Pass a Minecraft instance root or its mods directory.`);
  }

  const directModsCandidates = [
    path.join(resolvedInput, 'mods'),
    path.join(resolvedInput, '.minecraft', 'mods'),
    path.join(resolvedInput, 'minecraft', 'mods'),
  ];
  const existingCandidates: string[] = [];
  for (const candidate of directModsCandidates) {
    if (await isDirectory(candidate)) existingCandidates.push(candidate);
  }

  if (existingCandidates.length > 1) {
    throw new Error(
      `Multiple mods directories were found under ${resolvedInput}: ${existingCandidates.join(', ')}. `
      + 'Pass the exact mods directory you want upmods to maintain.',
    );
  }

  const inputLooksLikeMods = path.basename(resolvedInput).toLowerCase() === 'mods'
    || (existingCandidates.length === 0 && await hasJarFiles(resolvedInput));
  const modsDir = inputLooksLikeMods ? resolvedInput : existingCandidates[0];
  if (!modsDir) {
    throw new Error(
      `Cannot find a mods directory under ${resolvedInput}. Create a mods folder or pass its exact path.`,
    );
  }

  let instanceDir = resolvedInput;
  if (inputLooksLikeMods) {
    const parent = path.dirname(resolvedInput);
    const parentName = path.basename(parent).toLowerCase();
    const grandparent = path.dirname(parent);
    const prismRoot = (parentName === '.minecraft' || parentName === 'minecraft')
      && (await isFile(path.join(grandparent, 'instance.cfg')) || await isFile(path.join(grandparent, 'mmc-pack.json')));
    instanceDir = prismRoot ? grandparent : parent;
  }
  const detectedKind = await detectKind(instanceDir, modsDir);
  const kind = detectedKind === 'unknown' && inputLooksLikeMods ? 'mods-directory' : detectedKind;
  const configPath = path.join(instanceDir, INSTANCE_CONFIG_FILENAME);
  const config = await readInstanceConfig(configPath);
  const minecraftVersions: InstanceSuggestion[] = [];
  const loaders: InstanceSuggestion[] = [];

  addSuggestion(minecraftVersions, config.minecraftVersion ?? null, INSTANCE_CONFIG_FILENAME, 'high');
  addSuggestion(loaders, config.loader ?? null, INSTANCE_CONFIG_FILENAME, 'high');

  const mmcPack = await readJsonObject(path.join(instanceDir, 'mmc-pack.json'));
  if (mmcPack) collectComponentSuggestions(mmcPack, minecraftVersions, loaders);

  for (const filename of ['minecraftinstance.json', 'manifest.json', 'profile.json', 'instance.json']) {
    const document = await readJsonObject(path.join(instanceDir, filename));
    if (document) collectManifestSuggestions(document, filename, minecraftVersions, loaders);
  }

  const instanceCfg = await readSmallText(path.join(instanceDir, 'instance.cfg'));
  if (instanceCfg) {
    for (const line of instanceCfg.split(/\r?\n/)) {
      const [key, ...rest] = line.split('=');
      if (!key || rest.length === 0) continue;
      if (/^(IntendedVersion|MinecraftVersion)$/i.test(key.trim())) {
        addSuggestion(minecraftVersions, normalizeMinecraftVersion(rest.join('=').trim()), 'instance.cfg', 'medium');
      }
    }
  }

  await collectLauncherProfileSuggestions(
    path.join(instanceDir, 'launcher_profiles.json'),
    minecraftVersions,
    loaders,
  );

  const selectedVersion = chooseSuggestion(minecraftVersions);
  const selectedLoader = chooseSuggestion(loaders);
  const warnings: string[] = [];
  if (selectedVersion.ambiguous) warnings.push('Minecraft version detection is ambiguous; confirm it before updating.');
  if (selectedLoader.ambiguous) warnings.push('Loader detection is ambiguous; confirm it before updating.');

  return {
    inputDir: resolvedInput,
    instanceDir,
    modsDir,
    kind,
    minecraftVersion: selectedVersion.value,
    loader: selectedLoader.value && KNOWN_LOADERS.has(selectedLoader.value as SupportedModLoader)
      ? selectedLoader.value as SupportedModLoader
      : null,
    suggestions: { minecraftVersions, loaders },
    ambiguous: selectedVersion.ambiguous || selectedLoader.ambiguous,
    configPath,
    config,
    warnings,
  };
}
