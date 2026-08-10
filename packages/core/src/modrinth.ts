import { request } from 'undici';
import type {
  DependencyType,
  LoaderMigrationPlan,
  MCVersion,
  MigrationEntry,
  MigrationIssue,
  Mod,
  ModDependency,
  ModLoader,
  ModUpdate,
  UpdatePlan,
  UpdatePlanItem,
  UpdatePolicy,
} from './types.js';
import {
  abortableDelay,
  isOperationCancelledError,
  normalizeCancellation,
  throwIfAborted,
} from './abort.js';

export interface ModrinthVersionResponse {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
  version_type?: 'release' | 'beta' | 'alpha';
  dependencies?: Array<{
    version_id: string | null;
    project_id: string | null;
    file_name: string | null;
    dependency_type: DependencyType;
  }>;
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    hashes: {
      sha1: string;
      sha512: string;
    };
  }>;
}

export interface ModrinthProjectResponse {
  id: string;
  slug: string;
  title: string;
}

export interface ModrinthLoaderResponse {
  name: string;
  supported_project_types: string[];
}

export interface ModrinthGameVersionResponse {
  version: string;
  version_type: 'release' | 'snapshot' | 'beta' | 'alpha';
  date: string;
  major: boolean;
}

type RequestOptions = NonNullable<Parameters<typeof request>[1]>;
type RequestResult = Awaited<ReturnType<typeof request>>;

export interface ModrinthClientOptions {
  baseUrl?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function retryAfterMs(value: string | string[] | undefined): number | null {
  if (Array.isArray(value)) value = value[0];
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export class ModrinthClient {
  readonly baseUrl: string;
  readonly userAgent: string;
  private cachedGameVersions: MCVersion[] | null = null;
  private cachedModLoaders: ModLoader[] | null = null;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly headersTimeoutMs: number;
  private readonly bodyTimeoutMs: number;

  constructor(
    userAgent = 'upmods/0.2.0 (https://github.com/0png/upmods)',
    options: ModrinthClientOptions = {},
  ) {
    this.userAgent = userAgent;
    let baseUrl: URL;
    try {
      baseUrl = new URL(options.baseUrl ?? 'https://api.modrinth.com/v2');
    } catch {
      throw new Error('Modrinth API base URL must be a valid absolute HTTP(S) URL.');
    }
    if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
      throw new Error('Modrinth API base URL must use HTTP(S) without embedded credentials.');
    }
    this.baseUrl = baseUrl.href.replace(/\/+$/, '');
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 200);
    this.headersTimeoutMs = Math.max(1, options.headersTimeoutMs ?? 10_000);
    this.bodyTimeoutMs = Math.max(1, options.bodyTimeoutMs ?? 30_000);
  }

  private async apiRequest(url: string, options: RequestOptions = {}): Promise<RequestResult> {
    const signal = options.signal as AbortSignal | undefined;
    throwIfAborted(signal);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await request(url, {
          ...options,
          headersTimeout: this.headersTimeoutMs,
          bodyTimeout: this.bodyTimeoutMs,
        });
        if (!RETRYABLE_STATUS_CODES.has(response.statusCode) || attempt === this.maxRetries) {
          return response;
        }

        const requestedDelay = retryAfterMs(response.headers['retry-after']);
        response.body.resume();
        await abortableDelay(
          Math.min(requestedDelay ?? this.retryBaseDelayMs * 2 ** attempt, 2_000),
          signal,
        );
      } catch (error) {
        const normalized = normalizeCancellation(error, signal);
        if (isOperationCancelledError(normalized)) throw normalized;
        lastError = normalized;
        if (attempt === this.maxRetries) throw normalized;
        await abortableDelay(Math.min(this.retryBaseDelayMs * 2 ** attempt, 2_000), signal);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Modrinth request failed');
  }

  private apiError(response: RequestResult): Error {
    response.body.resume();
    return new Error(`Modrinth API error: ${response.statusCode}`);
  }

  /**
   * Identify mods by their SHA-1 hashes using Modrinth's bulk endpoint.
   * @param sha1s Array of lowercase hex SHA-1 hashes
   * @returns Map of sha1 → Mod (hashes not found in Modrinth are absent from map)
   */
  async identifyMods(sha1s: string[], signal?: AbortSignal): Promise<Map<string, Mod>> {
    throwIfAborted(signal);
    if (sha1s.length === 0) {
      return new Map();
    }

    const response = await this.apiRequest(`${this.baseUrl}/version_files`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: sha1s,
        algorithm: 'sha1',
      }),
      signal,
    });

    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }

    const data = (await response.body.json()) as Record<string, ModrinthVersionResponse>;
    throwIfAborted(signal);
    const result = new Map<string, Mod>();

    for (const [sha1, versionData] of Object.entries(data)) {
      throwIfAborted(signal);
      // Find the file in the version that matches this hash
      const file = versionData.files.find((f) => f.hashes.sha1 === sha1);
      if (!file) continue;

      result.set(sha1, {
        file: {
          path: '', // Will be filled by caller
          filename: file.filename,
          sha1,
          sizeBytes: file.size,
        },
        projectId: versionData.project_id,
        projectSlug: '',
        displayName: versionData.name, // Temporary — replaced by project title below
        installedVersionId: versionData.id,
        installedVersionNumber: versionData.version_number,
        loaders: versionData.loaders,
        supportedMcVersions: versionData.game_versions,
        dependencies: this.mapDependencies(versionData),
      });
    }

    // Batch-fetch project titles so displayName shows the mod name, not the version name.
    // GET /v2/projects?ids=["id1","id2",...] returns all projects in one request.
    const projectIds = [...new Set([...result.values()].map((m) => m.projectId))];
    if (projectIds.length > 0) {
      const projectsResponse = await this.apiRequest(
        `${this.baseUrl}/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`,
        { headers: { 'User-Agent': this.userAgent }, signal },
      );
      if (projectsResponse.statusCode === 200) {
        const projects = (await projectsResponse.body.json()) as ModrinthProjectResponse[];
        const projectMap = new Map(projects.map((p) => [p.id, p]));
        for (const [sha1, mod] of result.entries()) {
          throwIfAborted(signal);
          const project = projectMap.get(mod.projectId);
          if (project) {
            result.set(sha1, {
              ...mod,
              displayName: project.title,
              projectSlug: project.slug,
            });
          }
        }
      } else {
        projectsResponse.body.resume();
      }
    }

    return result;
  }

  /**
   * Get all Minecraft release versions from Modrinth.
   * Results are cached after the first call.
   * @returns Array of MCVersion objects, sorted newest-first by release date
   */
  async getGameVersions(signal?: AbortSignal): Promise<MCVersion[]> {
    throwIfAborted(signal);
    if (this.cachedGameVersions) {
      return this.cachedGameVersions;
    }

    const response = await this.apiRequest(`${this.baseUrl}/tag/game_version`, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
      },
      signal,
    });

    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }

    const data = (await response.body.json()) as ModrinthGameVersionResponse[];
    throwIfAborted(signal);

    // Filter to release versions only and map to MCVersion
    const versions = data
      .filter((v) => v.version_type === 'release')
      .map((v) => ({
        version: v.version,
        versionType: v.version_type,
        releaseDate: v.date,
        major: v.major,
      }))
      .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

    this.cachedGameVersions = versions;
    return versions;
  }

  async getModLoaders(signal?: AbortSignal): Promise<ModLoader[]> {
    throwIfAborted(signal);
    if (this.cachedModLoaders) return this.cachedModLoaders;

    const response = await this.apiRequest(`${this.baseUrl}/tag/loader`, {
      headers: { 'User-Agent': this.userAgent },
      signal,
    });
    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }

    const priority = ['fabric', 'forge', 'neoforge', 'quilt'];
    const data = (await response.body.json()) as ModrinthLoaderResponse[];
    throwIfAborted(signal);
    this.cachedModLoaders = data
      .filter((loader) => loader.supported_project_types.includes('mod'))
      .map((loader) => ({
        name: loader.name,
        supportedProjectTypes: loader.supported_project_types,
      }))
      .sort((a, b) => {
        const aPriority = priority.indexOf(a.name);
        const bPriority = priority.indexOf(b.name);
        if (aPriority !== bPriority) {
          if (aPriority === -1) return 1;
          if (bPriority === -1) return -1;
          return aPriority - bPriority;
        }
        return a.name.localeCompare(b.name);
      });
    return this.cachedModLoaders;
  }

  private mapDependencies(version: ModrinthVersionResponse): ModDependency[] {
    return (version.dependencies ?? []).map((dependency) => ({
      versionId: dependency.version_id,
      projectId: dependency.project_id,
      fileName: dependency.file_name,
      dependencyType: dependency.dependency_type,
    }));
  }

  private createUpdate(mod: Mod, version: ModrinthVersionResponse): ModUpdate | null {
    const primaryFile = version.files.find((file) => file.primary) ?? version.files[0];
    if (!primaryFile) return null;

    return {
      mod,
      latestVersionId: version.id,
      latestVersionNumber: version.version_number,
      downloadUrl: primaryFile.url,
      downloadFilename: primaryFile.filename,
      downloadSizeBytes: primaryFile.size,
      downloadSha1: primaryFile.hashes.sha1,
      downloadSha512: primaryFile.hashes.sha512,
      dependencies: this.mapDependencies(version),
      status: 'pending',
    };
  }

  private async getVersion(versionId: string, signal?: AbortSignal): Promise<ModrinthVersionResponse | null> {
    const response = await this.apiRequest(`${this.baseUrl}/version/${encodeURIComponent(versionId)}`, {
      headers: { 'User-Agent': this.userAgent },
      signal,
    });
    if (response.statusCode === 404) {
      response.body.resume();
      return null;
    }
    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }
    return await response.body.json() as ModrinthVersionResponse;
  }

  private async getCompatibleProjectVersion(
    projectId: string,
    loader: string,
    mcVersion: string,
    signal?: AbortSignal,
  ): Promise<ModrinthVersionResponse | null> {
    const query = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      game_versions: JSON.stringify([mcVersion]),
      include_changelog: 'false',
    });
    const response = await this.apiRequest(
      `${this.baseUrl}/project/${encodeURIComponent(projectId)}/version?${query.toString()}`,
      { headers: { 'User-Agent': this.userAgent }, signal },
    );
    if (response.statusCode === 404) {
      response.body.resume();
      return null;
    }
    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }
    const versions = await response.body.json() as ModrinthVersionResponse[];
    return versions.find((version) =>
      version.loaders.includes(loader) && version.game_versions.includes(mcVersion)) ?? null;
  }

  private async getCompatibleProjectVersions(
    projectId: string,
    loader: string,
    mcVersion: string,
    channel: UpdatePolicy['channel'],
    signal?: AbortSignal,
  ): Promise<ModrinthVersionResponse[]> {
    const query = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      game_versions: JSON.stringify([mcVersion]),
      include_changelog: 'false',
    });
    const response = await this.apiRequest(
      `${this.baseUrl}/project/${encodeURIComponent(projectId)}/version?${query.toString()}`,
      { headers: { 'User-Agent': this.userAgent }, signal },
    );
    if (response.statusCode === 404) {
      response.body.resume();
      return [];
    }
    if (response.statusCode !== 200) throw this.apiError(response);
    const versions = await response.body.json() as ModrinthVersionResponse[];
    return versions.filter((version) => this.channelAllows(version, channel));
  }

  private channelAllows(version: ModrinthVersionResponse, channel: UpdatePolicy['channel']): boolean {
    // Older/mocked responses can omit version_type. Modrinth's current v2 response includes it.
    if (!version.version_type) return true;
    return version.version_type === 'release' || (channel === 'allow-beta' && version.version_type === 'beta');
  }

  private async getProjects(
    projectIds: string[],
    signal?: AbortSignal,
  ): Promise<Map<string, ModrinthProjectResponse>> {
    throwIfAborted(signal);
    if (projectIds.length === 0) return new Map();
    const uniqueIds = [...new Set(projectIds)];
    const response = await this.apiRequest(
      `${this.baseUrl}/projects?ids=${encodeURIComponent(JSON.stringify(uniqueIds))}`,
      { headers: { 'User-Agent': this.userAgent }, signal },
    );
    if (response.statusCode !== 200) {
      response.body.resume();
      return new Map();
    }
    const projects = await response.body.json() as ModrinthProjectResponse[];
    return new Map(projects.map((project) => [project.id, project]));
  }

  async planLoaderMigration(
    mods: Mod[],
    mcVersion: string,
    sourceLoader: string,
    targetLoader: string,
    signal?: AbortSignal,
  ): Promise<LoaderMigrationPlan> {
    throwIfAborted(signal);
    if (mods.length === 0) {
      return { sourceLoader, targetLoader, mcVersion, entries: [], issues: [], complete: true };
    }

    const response = await this.apiRequest(`${this.baseUrl}/version_files/update`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: mods.map((mod) => mod.file.sha1),
        algorithm: 'sha1',
        loaders: [targetLoader],
        game_versions: [mcVersion],
      }),
      signal,
    });
    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }

    const versionsByHash = await response.body.json() as Record<string, ModrinthVersionResponse>;
    const entries: MigrationEntry[] = [];
    const issues: MigrationIssue[] = [];
    const entriesByProject = new Map<string, MigrationEntry>();
    const rootProjectIds = new Set(mods.map((mod) => mod.projectId));
    const visitedContexts = new Set<string>();

    const addIssue = (
      kind: MigrationIssue['kind'],
      displayName: string,
      projectId: string | null,
      message: string,
    ) => {
      const id = `${kind}:${projectId ?? displayName}:${message}`;
      if (!issues.some((issue) => issue.id === id)) {
        issues.push({ id, kind, displayName, projectId, message });
      }
    };

    const resolveDependencies = async (
      dependencies: ModDependency[],
      activationKey: string,
      ancestry: Set<string>,
    ): Promise<void> => {
      throwIfAborted(signal);
      for (const dependency of dependencies) {
        throwIfAborted(signal);
        if (dependency.dependencyType === 'embedded') continue;
        const label = dependency.projectId ?? dependency.fileName ?? 'Unknown dependency';

        if (dependency.dependencyType === 'incompatible') {
          addIssue('incompatible', label, dependency.projectId, `Incompatible dependency declared: ${label}`);
          continue;
        }

        let version: ModrinthVersionResponse | null = null;
        if (dependency.versionId) {
          version = await this.getVersion(dependency.versionId, signal);
        } else if (dependency.projectId) {
          version = await this.getCompatibleProjectVersion(
            dependency.projectId,
            targetLoader,
            mcVersion,
            signal,
          );
        }

        const isRequired = dependency.dependencyType === 'required';
        if (!version) {
          if (isRequired) {
            addIssue('unresolved-required', label, dependency.projectId, `Required dependency cannot be resolved: ${label}`);
          }
          continue;
        }

        if (!version.loaders.includes(targetLoader) || !version.game_versions.includes(mcVersion)) {
          if (isRequired) {
            addIssue('invalid-target', label, version.project_id, `Required dependency is not compatible with ${targetLoader} ${mcVersion}`);
          }
          continue;
        }

        if (rootProjectIds.has(version.project_id)) continue;
        const entryId = `dependency:${version.project_id}`;
        const nextActivationKey = isRequired ? activationKey : entryId;
        let entry = entriesByProject.get(version.project_id);

        if (!entry) {
          const dependencyMod: Mod = {
            file: {
              path: '',
              filename: '',
              sha1: version.files.find((file) => file.primary)?.hashes.sha1
                ?? version.files[0]?.hashes.sha1
                ?? version.id,
              sizeBytes: 0,
            },
            projectId: version.project_id,
            projectSlug: version.project_id,
            displayName: label,
            installedVersionId: '',
            installedVersionNumber: '',
            loaders: [targetLoader],
            supportedMcVersions: [mcVersion],
          };
          const update = this.createUpdate(dependencyMod, version);
          if (!update) {
            if (isRequired) {
              addIssue('unresolved-required', label, version.project_id, `Required dependency has no downloadable file: ${label}`);
            }
            continue;
          }
          entry = {
            id: entryId,
            displayName: label,
            projectId: version.project_id,
            projectSlug: version.project_id,
            sourceLoader,
            targetLoader,
            targetVersionId: version.id,
            targetVersionNumber: version.version_number,
            status: isRequired ? 'required' : 'optional',
            dependencyType: isRequired ? 'required' : 'optional',
            locked: isRequired,
            activationKeys: [nextActivationKey],
            update,
          };
          entries.push(entry);
          entriesByProject.set(version.project_id, entry);
        } else {
          if (!entry.activationKeys.includes(nextActivationKey)) entry.activationKeys.push(nextActivationKey);
          if (isRequired && entry.status === 'optional') {
            entry.status = 'required';
            entry.dependencyType = 'required';
            entry.locked = true;
          }
        }

        const contextId = `${version.id}:${nextActivationKey}`;
        if (ancestry.has(version.id) || visitedContexts.has(contextId)) continue;
        visitedContexts.add(contextId);
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(version.id);
        await resolveDependencies(this.mapDependencies(version), nextActivationKey, nextAncestry);
      }
    };

    for (const mod of mods) {
      throwIfAborted(signal);
      const version = versionsByHash[mod.file.sha1];
      if (!version || !version.loaders.includes(targetLoader) || !version.game_versions.includes(mcVersion)) {
        const entry: MigrationEntry = {
          id: `root:${mod.projectId}`,
          displayName: mod.displayName,
          projectId: mod.projectId,
          projectSlug: mod.projectSlug,
          sourceMod: mod,
          sourceLoader,
          targetLoader,
          status: 'unavailable',
          dependencyType: 'root',
          locked: true,
          activationKeys: ['root'],
        };
        entries.push(entry);
        entriesByProject.set(mod.projectId, entry);
        addIssue('unavailable', mod.displayName, mod.projectId, `No ${targetLoader} version for Minecraft ${mcVersion}`);
        continue;
      }

      const compatible = version.id === mod.installedVersionId
        && mod.loaders.includes(targetLoader)
        && mod.supportedMcVersions.includes(mcVersion);
      const update = compatible ? undefined : this.createUpdate(mod, version) ?? undefined;
      if (!compatible && !update) {
        addIssue('invalid-target', mod.displayName, mod.projectId, 'Target version has no downloadable file');
      }
      const entry: MigrationEntry = {
        id: `root:${mod.projectId}`,
        displayName: mod.displayName,
        projectId: mod.projectId,
        projectSlug: mod.projectSlug,
        sourceMod: mod,
        sourceLoader,
        targetLoader,
        targetVersionId: version.id,
        targetVersionNumber: version.version_number,
        status: compatible ? 'compatible' : update ? 'convertible' : 'unavailable',
        dependencyType: 'root',
        locked: true,
        activationKeys: ['root'],
        update,
      };
      entries.push(entry);
      entriesByProject.set(mod.projectId, entry);
      await resolveDependencies(this.mapDependencies(version), 'root', new Set([version.id]));
    }

    const dependencyProjectIds = entries
      .filter((entry) => entry.dependencyType !== 'root' && entry.projectId)
      .map((entry) => entry.projectId!);
    const projects = await this.getProjects(dependencyProjectIds, signal);
    for (const entry of entries) {
      if (!entry.projectId || entry.dependencyType === 'root') continue;
      const project = projects.get(entry.projectId);
      if (!project) continue;
      entry.displayName = project.title;
      entry.projectSlug = project.slug;
      if (entry.update) {
        entry.update.mod.displayName = project.title;
        entry.update.mod.projectSlug = project.slug;
      }
    }

    return {
      sourceLoader,
      targetLoader,
      mcVersion,
      entries,
      issues,
      complete: issues.length === 0 && entries.every((entry) => entry.status !== 'unavailable'),
    };
  }

  /**
   * Check for available updates for a list of mods for a specific Minecraft version.
   * @param mods Array of identified mods
   * @param mcVersion Target Minecraft version (e.g., "1.21.1")
   * @returns Object with updates array (mods with newer versions) and upToDate array
   */
  async checkUpdates(
    mods: Mod[],
    mcVersion: string,
    selectedLoader?: string,
    channel: 'stable-only' | 'allow-beta' = 'stable-only',
    signal?: AbortSignal,
  ): Promise<{ updates: ModUpdate[]; upToDate: Mod[] }> {
    throwIfAborted(signal);
    if (mods.length === 0) {
      return { updates: [], upToDate: [] };
    }

    // Detect the dominant loader across all installed mods.
    // Sending ALL unique loaders (e.g. ['fabric','neoforge'] from one dual-loader
    // jar) causes Modrinth to return NeoForge-specific builds for other mods.
    // Using only the most common loader keeps results on the user's actual loader.
    const loaderCount = new Map<string, number>();
    for (const mod of mods) {
      throwIfAborted(signal);
      for (const loader of mod.loaders) {
        loaderCount.set(loader, (loaderCount.get(loader) ?? 0) + 1);
      }
    }
    const primaryLoader = selectedLoader ?? (
      loaderCount.size > 0
        ? [...loaderCount.entries()].sort((a, b) => b[1] - a[1])[0]![0]
        : null
    );

    const response = await this.apiRequest(`${this.baseUrl}/version_files/update`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: mods.map((m) => m.file.sha1),
        algorithm: 'sha1',
        loaders: primaryLoader ? [primaryLoader] : [],
        game_versions: [mcVersion],
      }),
      signal,
    });

    if (response.statusCode !== 200) {
      throw this.apiError(response);
    }

    const data = (await response.body.json()) as Record<string, ModrinthVersionResponse>;
    const updates: ModUpdate[] = [];
    const upToDate: Mod[] = [];

    for (const mod of mods) {
      throwIfAborted(signal);
      let updateData = data[mod.file.sha1];
      if (updateData && !this.channelAllows(updateData, channel) && primaryLoader) {
        updateData = (await this.getCompatibleProjectVersions(
          mod.projectId,
          primaryLoader,
          mcVersion,
          channel,
          signal,
        ))[0];
      }

      if (updateData) {
        // Only treat as a real update if:
        // 1. It's a different version (not already the latest)
        // 2. The returned version supports the user's primary loader
        //    (per-mod intersection is wrong for dual-loader mods — a mod with
        //     ['fabric','neoforge'] would accept a neoforge-only update)
        // 3. The returned version actually supports the requested MC version
        const isNewer = updateData.id !== mod.installedVersionId;
        const loaderOk = primaryLoader
          ? updateData.loaders.includes(primaryLoader)
          : updateData.loaders.some((l) => mod.loaders.includes(l));
        const versionOk = updateData.game_versions.includes(mcVersion);

        if (isNewer && loaderOk && versionOk) {
          const update = this.createUpdate(mod, updateData);
          if (update) {
            updates.push(update);
            continue;
          }
        }
      }

      upToDate.push(mod);
    }

    return { updates, upToDate };
  }

  async planUpdates(
    mods: Mod[],
    mcVersion: string,
    loader: string,
    policy: UpdatePolicy,
    signal?: AbortSignal,
  ): Promise<UpdatePlan> {
    throwIfAborted(signal);
    const ignored = new Set(policy.ignored.map((key) => key.toLowerCase()));
    const pinnedEntries = Object.entries(policy.pinned);
    const items: UpdatePlanItem[] = [];
    const ordinaryMods: Mod[] = [];

    const matchesKey = (mod: Mod, key: string) => (
      mod.projectId.toLowerCase() === key.toLowerCase()
      || mod.projectSlug.toLowerCase() === key.toLowerCase()
    );

    for (const mod of mods) {
      throwIfAborted(signal);
      if ([mod.projectId, mod.projectSlug].some((key) => ignored.has(key.toLowerCase()))) {
        items.push({ mod, action: 'ignored', reason: 'Ignored by instance settings.' });
        continue;
      }

      const pin = pinnedEntries.find(([key]) => matchesKey(mod, key))?.[1];
      if (!pin) {
        ordinaryMods.push(mod);
        continue;
      }
      if (pin === mod.installedVersionId || pin === mod.installedVersionNumber) {
        items.push({ mod, action: 'pinned', pinnedVersion: pin, reason: `Pinned at installed version ${pin}.` });
        continue;
      }

      const versions = await this.getCompatibleProjectVersions(
        mod.projectId,
        loader,
        mcVersion,
        policy.channel,
        signal,
      );
      const pinnedVersion = versions.find((version) => version.id === pin || version.version_number === pin);
      const update = pinnedVersion ? this.createUpdate(mod, pinnedVersion) : null;
      if (!update) {
        items.push({
          mod,
          action: 'incompatible',
          pinnedVersion: pin,
          reason: `Pinned version ${pin} is unavailable for ${loader} Minecraft ${mcVersion}.`,
        });
      } else {
        items.push({ mod, action: 'update', update, pinnedVersion: pin, reason: `Pinned to version ${pin}.` });
      }
    }

    const ordinary = await this.checkUpdates(ordinaryMods, mcVersion, loader, policy.channel, signal);
    const updatesByProject = new Map(ordinary.updates.map((update) => [update.mod.projectId, update]));
    for (const mod of ordinaryMods) {
      const update = updatesByProject.get(mod.projectId);
      if (update) {
        items.push({ mod, action: 'update', update, reason: `Newest ${policy.channel} compatible version.` });
      } else if (!mod.loaders.includes(loader) || !mod.supportedMcVersions.includes(mcVersion)) {
        items.push({
          mod,
          action: 'incompatible',
          reason: `Installed version does not declare support for ${loader} Minecraft ${mcVersion}, and no replacement was found.`,
        });
      } else {
        items.push({ mod, action: 'up-to-date', reason: 'Already at the newest compatible version.' });
      }
    }

    const ordered = mods.map((mod) => items.find((item) => item.mod.file.sha1 === mod.file.sha1)!).filter(Boolean);
    return {
      minecraftVersion: mcVersion,
      loader,
      channel: policy.channel,
      items: ordered,
      updates: ordered.flatMap((item) => item.update ? [item.update] : []),
    };
  }
}
