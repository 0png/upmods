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
} from './types.js';

export interface ModrinthVersionResponse {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
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

export class ModrinthClient {
  readonly baseUrl = 'https://api.modrinth.com/v2';
  readonly userAgent: string;
  private cachedGameVersions: MCVersion[] | null = null;
  private cachedModLoaders: ModLoader[] | null = null;

  constructor(userAgent = 'upmods/0.1.0 (https://github.com/0png/upmods)') {
    this.userAgent = userAgent;
  }

  /**
   * Identify mods by their SHA-1 hashes using Modrinth's bulk endpoint.
   * @param sha1s Array of lowercase hex SHA-1 hashes
   * @returns Map of sha1 → Mod (hashes not found in Modrinth are absent from map)
   */
  async identifyMods(sha1s: string[]): Promise<Map<string, Mod>> {
    if (sha1s.length === 0) {
      return new Map();
    }

    const response = await request(`${this.baseUrl}/version_files`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: sha1s,
        algorithm: 'sha1',
      }),
    });

    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }

    const data = (await response.body.json()) as Record<string, ModrinthVersionResponse>;
    const result = new Map<string, Mod>();

    for (const [sha1, versionData] of Object.entries(data)) {
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
      });
    }

    // Batch-fetch project titles so displayName shows the mod name, not the version name.
    // GET /v2/projects?ids=["id1","id2",...] returns all projects in one request.
    const projectIds = [...new Set([...result.values()].map((m) => m.projectId))];
    if (projectIds.length > 0) {
      const projectsResponse = await request(
        `${this.baseUrl}/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`,
        { headers: { 'User-Agent': this.userAgent } },
      );
      if (projectsResponse.statusCode === 200) {
        const projects = (await projectsResponse.body.json()) as ModrinthProjectResponse[];
        const projectMap = new Map(projects.map((p) => [p.id, p]));
        for (const [sha1, mod] of result.entries()) {
          const project = projectMap.get(mod.projectId);
          if (project) {
            result.set(sha1, {
              ...mod,
              displayName: project.title,
              projectSlug: project.slug,
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Get all Minecraft release versions from Modrinth.
   * Results are cached after the first call.
   * @returns Array of MCVersion objects, sorted newest-first by release date
   */
  async getGameVersions(): Promise<MCVersion[]> {
    if (this.cachedGameVersions) {
      return this.cachedGameVersions;
    }

    const response = await request(`${this.baseUrl}/tag/game_version`, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
      },
    });

    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }

    const data = (await response.body.json()) as ModrinthGameVersionResponse[];

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

  async getModLoaders(): Promise<ModLoader[]> {
    if (this.cachedModLoaders) return this.cachedModLoaders;

    const response = await request(`${this.baseUrl}/tag/loader`, {
      headers: { 'User-Agent': this.userAgent },
    });
    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }

    const priority = ['fabric', 'forge', 'neoforge', 'quilt'];
    const data = (await response.body.json()) as ModrinthLoaderResponse[];
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

  private async getVersion(versionId: string): Promise<ModrinthVersionResponse | null> {
    const response = await request(`${this.baseUrl}/version/${encodeURIComponent(versionId)}`, {
      headers: { 'User-Agent': this.userAgent },
    });
    if (response.statusCode === 404) {
      response.body.resume();
      return null;
    }
    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }
    return await response.body.json() as ModrinthVersionResponse;
  }

  private async getCompatibleProjectVersion(
    projectId: string,
    loader: string,
    mcVersion: string,
  ): Promise<ModrinthVersionResponse | null> {
    const query = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      game_versions: JSON.stringify([mcVersion]),
      include_changelog: 'false',
    });
    const response = await request(
      `${this.baseUrl}/project/${encodeURIComponent(projectId)}/version?${query.toString()}`,
      { headers: { 'User-Agent': this.userAgent } },
    );
    if (response.statusCode === 404) {
      response.body.resume();
      return null;
    }
    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }
    const versions = await response.body.json() as ModrinthVersionResponse[];
    return versions.find((version) =>
      version.loaders.includes(loader) && version.game_versions.includes(mcVersion)) ?? null;
  }

  private async getProjects(projectIds: string[]): Promise<Map<string, ModrinthProjectResponse>> {
    if (projectIds.length === 0) return new Map();
    const uniqueIds = [...new Set(projectIds)];
    const response = await request(
      `${this.baseUrl}/projects?ids=${encodeURIComponent(JSON.stringify(uniqueIds))}`,
      { headers: { 'User-Agent': this.userAgent } },
    );
    if (response.statusCode !== 200) return new Map();
    const projects = await response.body.json() as ModrinthProjectResponse[];
    return new Map(projects.map((project) => [project.id, project]));
  }

  async planLoaderMigration(
    mods: Mod[],
    mcVersion: string,
    sourceLoader: string,
    targetLoader: string,
  ): Promise<LoaderMigrationPlan> {
    if (mods.length === 0) {
      return { sourceLoader, targetLoader, mcVersion, entries: [], issues: [], complete: true };
    }

    const response = await request(`${this.baseUrl}/version_files/update`, {
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
    });
    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
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
      for (const dependency of dependencies) {
        if (dependency.dependencyType === 'embedded') continue;
        const label = dependency.projectId ?? dependency.fileName ?? 'Unknown dependency';

        if (dependency.dependencyType === 'incompatible') {
          addIssue('incompatible', label, dependency.projectId, `Incompatible dependency declared: ${label}`);
          continue;
        }

        let version: ModrinthVersionResponse | null = null;
        if (dependency.versionId) {
          version = await this.getVersion(dependency.versionId);
        } else if (dependency.projectId) {
          version = await this.getCompatibleProjectVersion(dependency.projectId, targetLoader, mcVersion);
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
    const projects = await this.getProjects(dependencyProjectIds);
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
  ): Promise<{ updates: ModUpdate[]; upToDate: Mod[] }> {
    if (mods.length === 0) {
      return { updates: [], upToDate: [] };
    }

    // Detect the dominant loader across all installed mods.
    // Sending ALL unique loaders (e.g. ['fabric','neoforge'] from one dual-loader
    // jar) causes Modrinth to return NeoForge-specific builds for other mods.
    // Using only the most common loader keeps results on the user's actual loader.
    const loaderCount = new Map<string, number>();
    for (const mod of mods) {
      for (const loader of mod.loaders) {
        loaderCount.set(loader, (loaderCount.get(loader) ?? 0) + 1);
      }
    }
    const primaryLoader = selectedLoader ?? (
      loaderCount.size > 0
        ? [...loaderCount.entries()].sort((a, b) => b[1] - a[1])[0]![0]
        : null
    );

    const response = await request(`${this.baseUrl}/version_files/update`, {
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
    });

    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }

    const data = (await response.body.json()) as Record<string, ModrinthVersionResponse>;
    const updates: ModUpdate[] = [];
    const upToDate: Mod[] = [];

    for (const mod of mods) {
      const updateData = data[mod.file.sha1];

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
}
