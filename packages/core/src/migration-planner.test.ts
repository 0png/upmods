import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModrinthClient, type ModrinthVersionResponse } from './modrinth.js';
import type { Mod } from './types.js';

vi.mock('undici', () => ({ request: vi.fn() }));

function makeMod(): Mod {
  return {
    file: { path: '/mods/example.jar', filename: 'example.jar', sha1: 'source-hash', sizeBytes: 10 },
    projectId: 'root-project',
    projectSlug: 'example',
    displayName: 'Example',
    installedVersionId: 'forge-version',
    installedVersionNumber: '1.0.0-forge',
    loaders: ['forge'],
    supportedMcVersions: ['1.21.1'],
  };
}

function makeVersion(overrides: Partial<ModrinthVersionResponse>): ModrinthVersionResponse {
  return {
    id: 'fabric-version',
    project_id: 'root-project',
    name: 'Example Fabric',
    version_number: '2.0.0-fabric',
    loaders: ['fabric'],
    game_versions: ['1.21.1'],
    dependencies: [],
    files: [{
      url: 'https://example.com/example-fabric.jar',
      filename: 'example-fabric.jar',
      primary: true,
      size: 10,
      hashes: { sha1: 'target-hash', sha512: 'target-sha512' },
    }],
    ...overrides,
  };
}

describe('Modrinth loader migration planner', () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let client: ModrinthClient;

  beforeEach(async () => {
    const { request } = await import('undici');
    requestMock = request as ReturnType<typeof vi.fn>;
    requestMock.mockReset();
    client = new ModrinthClient('test-agent');
  });

  it('filters and prioritizes mod loaders', async () => {
    requestMock.mockResolvedValue({
      statusCode: 200,
      body: { json: async () => [
        { name: 'custom', supported_project_types: ['mod'] },
        { name: 'forge', supported_project_types: ['mod'] },
        { name: 'fabric', supported_project_types: ['mod', 'modpack'] },
        { name: 'shader', supported_project_types: ['shader'] },
      ] },
    });

    const loaders = await client.getModLoaders();
    expect(loaders.map((loader) => loader.name)).toEqual(['fabric', 'forge', 'custom']);
  });

  it('plans a target version and recursively adds a required dependency', async () => {
    const dependencyVersion = makeVersion({
      id: 'fabric-api-version',
      project_id: 'fabric-api',
      name: 'Fabric API',
      version_number: '1.0.0',
      dependencies: [],
      files: [{
        url: 'https://example.com/fabric-api.jar',
        filename: 'fabric-api.jar',
        primary: true,
        size: 20,
        hashes: { sha1: 'fabric-api-hash', sha512: 'fabric-api-sha512' },
      }],
    });
    const targetVersion = makeVersion({
      dependencies: [{
        version_id: null,
        project_id: 'fabric-api',
        file_name: null,
        dependency_type: 'required',
      }],
    });

    requestMock
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => ({ 'source-hash': targetVersion }) },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => [dependencyVersion] },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => [{ id: 'fabric-api', slug: 'fabric-api', title: 'Fabric API' }] },
      });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');

    expect(plan.complete).toBe(true);
    expect(plan.entries.map((entry) => entry.status)).toEqual(['convertible', 'required']);
    expect(plan.entries[1]?.displayName).toBe('Fabric API');
    const requestBody = JSON.parse(requestMock.mock.calls[0]?.[1]?.body as string) as { loaders: string[] };
    expect(requestBody.loaders).toEqual(['fabric']);
  });

  it('marks a source mod unavailable when no target version exists', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { json: async () => ({}) },
    });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');

    expect(plan.complete).toBe(false);
    expect(plan.entries[0]?.status).toBe('unavailable');
    expect(plan.issues[0]?.kind).toBe('unavailable');
  });

  it('promotes a duplicated optional dependency to required', async () => {
    const dependencyVersion = makeVersion({
      id: 'shared-version',
      project_id: 'shared-project',
      dependencies: [],
    });
    const targetVersion = makeVersion({
      dependencies: [
        { version_id: null, project_id: 'shared-project', file_name: null, dependency_type: 'optional' },
        { version_id: null, project_id: 'shared-project', file_name: null, dependency_type: 'required' },
      ],
    });
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => ({ 'source-hash': targetVersion }) } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => [dependencyVersion] } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => [dependencyVersion] } })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => [{ id: 'shared-project', slug: 'shared', title: 'Shared' }] },
      });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');
    const dependency = plan.entries.find((entry) => entry.projectId === 'shared-project');

    expect(plan.entries).toHaveLength(2);
    expect(dependency?.status).toBe('required');
    expect(dependency?.activationKeys).toContain('root');
  });

  it('ignores embedded dependencies and reports incompatible ones', async () => {
    const targetVersion = makeVersion({
      dependencies: [
        { version_id: null, project_id: 'embedded', file_name: null, dependency_type: 'embedded' },
        { version_id: null, project_id: 'conflict', file_name: null, dependency_type: 'incompatible' },
      ],
    });
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { json: async () => ({ 'source-hash': targetVersion }) },
    });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');

    expect(plan.entries).toHaveLength(1);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]?.kind).toBe('incompatible');
    expect(plan.complete).toBe(false);
  });

  it('rejects an exact required version that does not support the target environment', async () => {
    const targetVersion = makeVersion({
      dependencies: [{
        version_id: 'forge-only-version',
        project_id: 'forge-only-project',
        file_name: null,
        dependency_type: 'required',
      }],
    });
    const forgeOnlyVersion = makeVersion({
      id: 'forge-only-version',
      project_id: 'forge-only-project',
      loaders: ['forge'],
    });
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => ({ 'source-hash': targetVersion }) } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => forgeOnlyVersion } });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');

    expect(plan.issues[0]?.kind).toBe('invalid-target');
    expect(plan.complete).toBe(false);
  });

  it('stops recursive dependency cycles', async () => {
    const targetVersion = makeVersion({
      dependencies: [{ version_id: 'dep-a-v1', project_id: 'dep-a', file_name: null, dependency_type: 'required' }],
    });
    const depA = makeVersion({
      id: 'dep-a-v1',
      project_id: 'dep-a',
      dependencies: [{ version_id: 'dep-b-v1', project_id: 'dep-b', file_name: null, dependency_type: 'required' }],
    });
    const depB = makeVersion({
      id: 'dep-b-v1',
      project_id: 'dep-b',
      dependencies: [{ version_id: 'dep-a-v1', project_id: 'dep-a', file_name: null, dependency_type: 'required' }],
    });
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => ({ 'source-hash': targetVersion }) } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => depA } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => depB } })
      .mockResolvedValueOnce({ statusCode: 200, body: { json: async () => depA } })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => [
          { id: 'dep-a', slug: 'dep-a', title: 'Dependency A' },
          { id: 'dep-b', slug: 'dep-b', title: 'Dependency B' },
        ] },
      });

    const plan = await client.planLoaderMigration([makeMod()], '1.21.1', 'forge', 'fabric');

    expect(plan.entries.map((entry) => entry.projectId)).toEqual(['root-project', 'dep-a', 'dep-b']);
    expect(requestMock).toHaveBeenCalledTimes(5);
  });
});
