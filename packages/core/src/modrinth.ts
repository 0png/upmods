import { request } from 'undici';
import type { Mod, MCVersion, ModUpdate } from './types.js';

export interface ModrinthVersionResponse {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
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

  constructor(userAgent = 'upmods/0.1.0 (https://github.com/user/upmods)') {
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

      // We need to fetch project details to get the display name
      // For now, use version name as display name (will be enhanced in future)
      result.set(sha1, {
        file: {
          path: '', // Will be filled by caller
          filename: file.filename,
          sha1,
          sizeBytes: file.size,
        },
        projectId: versionData.project_id,
        projectSlug: '', // Will fetch separately if needed
        displayName: versionData.name,
        installedVersionId: versionData.id,
        installedVersionNumber: versionData.version_number,
        loaders: versionData.loaders,
        supportedMcVersions: versionData.game_versions,
      });
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

  /**
   * Check for available updates for a list of mods for a specific Minecraft version.
   * @param mods Array of identified mods
   * @param mcVersion Target Minecraft version (e.g., "1.21.1")
   * @returns Object with updates array (mods with newer versions) and upToDate array
   */
  async checkUpdates(
    mods: Mod[],
    mcVersion: string
  ): Promise<{ updates: ModUpdate[]; upToDate: Mod[] }> {
    if (mods.length === 0) {
      return { updates: [], upToDate: [] };
    }

    // Extract unique loaders from all mods
    const loaderSet = new Set<string>();
    for (const mod of mods) {
      for (const loader of mod.loaders) {
        loaderSet.add(loader);
      }
    }

    const response = await request(`${this.baseUrl}/version_files/update`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: mods.map((m) => m.file.sha1),
        algorithm: 'sha1',
        loaders: Array.from(loaderSet),
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
        // Find the primary file
        const primaryFile = updateData.files.find((f) => f.primary) || updateData.files[0];

        if (primaryFile) {
          updates.push({
            mod,
            latestVersionId: updateData.id,
            latestVersionNumber: updateData.version_number,
            downloadUrl: primaryFile.url,
            downloadFilename: primaryFile.filename,
            downloadSizeBytes: primaryFile.size,
            status: 'pending',
          });
        }
      } else {
        // No update available for this mod
        upToDate.push(mod);
      }
    }

    return { updates, upToDate };
  }
}
