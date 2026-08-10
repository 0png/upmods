import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'cli.js');

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createJar(entryName, content) {
  const filename = Buffer.from(entryName);
  const data = Buffer.from(content);
  const compressed = deflateRawSync(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);

  const centralOffset = local.length + filename.length + compressed.length;
  const directory = Buffer.concat([central, filename]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, compressed, directory, eocd]);
}

function hashes(content) {
  return {
    sha1: createHash('sha1').update(content).digest('hex'),
    sha512: createHash('sha512').update(content).digest('hex'),
  };
}

function versionFixture({ id, version, filename, fileHashes, size, baseUrl, dependencies = [] }) {
  return {
    id,
    project_id: 'demo-project',
    name: `Demo ${version}`,
    version_number: version,
    version_type: 'release',
    loaders: ['fabric'],
    game_versions: ['1.21.1'],
    dependencies,
    files: [{
      url: `${baseUrl}/downloads/${filename}`,
      filename,
      primary: true,
      size,
      hashes: fileHashes,
    }],
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function startFakeModrinth(installedJar) {
  const installedHashes = hashes(installedJar);
  const updateContent = createJar('fabric.mod.json', JSON.stringify({
    schemaVersion: 1,
    id: 'demo',
    name: 'Demo Mod',
    version: '2.0.0',
    depends: { minecraft: '1.21.1', fabricloader: '>=0.16.0' },
  }));
  const updateHashes = hashes(updateContent);
  const requests = [];
  let baseUrl = '';
  let corruptDownloads = false;
  let updateDependencies = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await readBody(request);
    requests.push({ method: request.method, pathname: url.pathname, body });
    const installedVersion = versionFixture({
      id: 'demo-v1',
      version: '1.0.0',
      filename: 'demo-1.0.0.jar',
      fileHashes: installedHashes,
      size: installedJar.length,
      baseUrl,
    });
    const updateVersion = versionFixture({
      id: 'demo-v2',
      version: '2.0.0',
      filename: 'demo-2.0.0.jar',
      fileHashes: updateHashes,
      size: updateContent.length,
      baseUrl,
      dependencies: updateDependencies,
    });

    if (request.method === 'POST' && url.pathname === '/v2/version_files') {
      const input = JSON.parse(body);
      const matches = {};
      if (input.hashes.includes(installedHashes.sha1)) matches[installedHashes.sha1] = installedVersion;
      if (input.hashes.includes(updateHashes.sha1)) matches[updateHashes.sha1] = updateVersion;
      sendJson(response, 200, matches);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/v2/projects') {
      sendJson(response, 200, [{ id: 'demo-project', slug: 'demo', title: 'Demo Mod' }]);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v2/version_files/update') {
      const input = JSON.parse(body);
      assert.deepEqual(input.loaders, ['fabric']);
      assert.deepEqual(input.game_versions, ['1.21.1']);
      const matches = {};
      if (input.hashes.includes(installedHashes.sha1)) matches[installedHashes.sha1] = updateVersion;
      if (input.hashes.includes(updateHashes.sha1)) matches[updateHashes.sha1] = updateVersion;
      sendJson(response, 200, matches);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/downloads/demo-2.0.0.jar') {
      const payload = corruptDownloads ? Buffer.alloc(updateContent.length, 0x78) : updateContent;
      response.writeHead(200, {
        'content-type': 'application/java-archive',
        'content-length': payload.length,
      });
      response.end(payload);
      return;
    }
    sendJson(response, 404, { error: `Unexpected fake Modrinth route: ${request.method} ${url.pathname}` });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    requests,
    installedHashes,
    updateContent,
    setCorruptDownloads(value) { corruptDownloads = value; },
    setUpdateDependencies(value) { updateDependencies = value; },
  };
}

async function runCli(args, apiBaseUrl, expectedCode = 0, integrationTest = true) {
  const env = {
    ...process.env,
    UPMODS_TEST_MODRINTH_API_BASE_URL: `${apiBaseUrl}/v2`,
    NO_COLOR: '1',
  };
  if (integrationTest) env.UPMODS_INTEGRATION_TEST = '1';
  else delete env.UPMODS_INTEGRATION_TEST;
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 15_000);
  const [code] = await once(child, 'close');
  clearTimeout(timer);
  assert.equal(
    code,
    expectedCode,
    `CLI exited ${code}, expected ${expectedCode}\nargs: ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  return { stdout, stderr };
}

function parseJson(result, command) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${command} did not produce valid JSON: ${error.message}\n${result.stdout}`);
  }
}

async function createFixtures(root) {
  const prism = path.join(root, 'Prism Instance');
  const prismMods = path.join(prism, '.minecraft', 'mods');
  await mkdir(prismMods, { recursive: true });
  await writeFile(path.join(prism, 'mmc-pack.json'), JSON.stringify({
    components: [
      { uid: 'net.minecraft', version: '1.21.1' },
      { uid: 'net.fabricmc.fabric-loader', version: '0.16.9' },
    ],
  }));

  const installedJar = createJar('fabric.mod.json', JSON.stringify({
    schemaVersion: 1,
    id: 'demo',
    name: 'Demo Mod',
    version: '1.0.0',
    depends: { minecraft: '1.21.1', fabricloader: '>=0.16.0' },
  }));
  await writeFile(path.join(prismMods, 'demo-1.0.0.jar'), installedJar);
  await writeFile(path.join(prismMods, 'local-forge.jar'), createJar(
    'META-INF/mods.toml',
    '[[mods]]\nmodId="localforge"\nversion="1.0.0"\ndisplayName="Local Forge"\n'
      + '[[dependencies.localforge]]\nmodId="minecraft"\nmandatory=true\nversionRange="[1.20,1.22)"\n'
      + '[[dependencies.localforge]]\nmodId="missinglib"\nmandatory=true\nversionRange="[2,)"\n',
  ));
  await writeFile(path.join(prismMods, 'old-addon.jar.disabled'), createJar(
    'fabric.mod.json',
    JSON.stringify({ id: 'oldaddon', name: 'Old Addon', version: '0.1.0', depends: { minecraft: '1.21.1' } }),
  ));

  const curseforge = path.join(root, 'CurseForge Instance');
  await mkdir(path.join(curseforge, 'mods'), { recursive: true });
  await writeFile(path.join(curseforge, 'minecraftinstance.json'), JSON.stringify({
    gameVersion: '1.20.1',
    baseModLoader: { name: 'forge-47.2.0' },
  }));

  const writeCleanPrism = async (name) => {
    const instance = path.join(root, name);
    const mods = path.join(instance, '.minecraft', 'mods');
    await mkdir(mods, { recursive: true });
    await writeFile(path.join(instance, 'mmc-pack.json'), JSON.stringify({
      components: [
        { uid: 'net.minecraft', version: '1.21.1' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.16.9' },
      ],
    }));
    await writeFile(path.join(mods, 'demo-1.0.0.jar'), installedJar);
    return { instance, mods };
  };
  const transactional = await writeCleanPrism('Transactional Instance');
  const failedUpdate = await writeCleanPrism('Failed Update Instance');
  const projectedDependency = await writeCleanPrism('Projected Dependency Instance');
  return { prism, prismMods, curseforge, installedJar, transactional, failedUpdate, projectedDependency };
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'upmods-offline-integration-'));
  let server;
  try {
    const fixture = await createFixtures(root);
    const fake = await startFakeModrinth(fixture.installedJar);
    server = fake.server;

    const rejectedOverride = await runCli(['scan', fixture.prism, '--json'], fake.baseUrl, 1, false);
    assert.match(rejectedOverride.stderr, /restricted to the integration test harness/);

    const scan = parseJson(await runCli(['scan', fixture.prism, '--json', '--no-cache'], fake.baseUrl), 'scan');
    assert.equal(scan.totalFiles, 3);
    assert.equal(scan.identifiedCount, 1);
    assert.equal(scan.unidentifiedCount, 2);
    assert.equal(scan.identified[0].displayName, 'Demo Mod');
    assert.equal(scan.unidentified.find((file) => file.filename === 'local-forge.jar').metadata.format, 'forge');

    const check = parseJson(await runCli(['check', fixture.prism, '--json'], fake.baseUrl), 'check');
    assert.equal(check.mcVersion, '1.21.1');
    assert.equal(check.loader, 'fabric');
    assert.equal(check.updates[0].latestVersionId, 'demo-v2');

    const audit = parseJson(await runCli(['audit', fixture.prism, '--json'], fake.baseUrl), 'audit');
    assert.equal(audit.instance.kind, 'prism');
    assert(audit.report.issues.some((issue) => issue.kind === 'missing-required-dependency'));
    assert(audit.report.issues.some((issue) => issue.kind === 'disabled-or-legacy-jar'));
    await runCli(['audit', fixture.prism, '--strict'], fake.baseUrl, 2);

    const lockfile = parseJson(await runCli(['lock', fixture.prism, '--json'], fake.baseUrl), 'lock');
    assert.equal(lockfile.mods.length, 1);
    assert.equal(lockfile.unidentified.length, 2);
    const verified = parseJson(await runCli(['verify', fixture.prism, '--json'], fake.baseUrl), 'verify');
    assert.equal(verified.valid, true);

    const dryRun = parseJson(
      await runCli(['update', fixture.prism, '--dry-run', '--json'], fake.baseUrl),
      'update --dry-run',
    );
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.plan.updates[0].latestVersionId, 'demo-v2');
    assert.equal(dryRun.plan.items[0].action, 'update');
    const downloadsBeforeSafetyRefusal = fake.requests.filter(
      (entry) => entry.pathname.startsWith('/downloads/'),
    ).length;
    const blockedUpdate = await runCli([
      'update', fixture.prism, '--yes', '--json',
    ], fake.baseUrl, 1);
    assert.match(blockedUpdate.stderr, /Update refused: .* Fix:/);
    assert.equal(fake.requests.filter(
      (entry) => entry.pathname.startsWith('/downloads/'),
    ).length, downloadsBeforeSafetyRefusal);

    const curseAudit = parseJson(await runCli(['audit', fixture.curseforge, '--json'], fake.baseUrl), 'CurseForge audit');
    assert.equal(curseAudit.instance.kind, 'curseforge');
    assert.equal(curseAudit.instance.minecraftVersion, '1.20.1');
    assert.equal(curseAudit.instance.loader, 'forge');
    const configured = parseJson(await runCli([
      'config', fixture.curseforge, '--json', '--channel=allow-beta',
      '--ignore=example', '--pin=demo=demo-v1',
    ], fake.baseUrl), 'config');
    assert.equal(configured.config.channel, 'allow-beta');
    assert.deepEqual(configured.config.ignored, ['example']);
    assert.equal(configured.config.pinned.demo, 'demo-v1');

    fake.setUpdateDependencies([{
      version_id: null,
      project_id: 'missing-update-library',
      file_name: null,
      dependency_type: 'required',
    }]);
    const projectedPreview = parseJson(await runCli([
      'update', fixture.projectedDependency.instance, '--dry-run', '--json',
    ], fake.baseUrl), 'projected dependency dry-run');
    assert.equal(projectedPreview.safety.safe, false);
    assert(projectedPreview.safety.blockers.some((blocker) => (
      blocker.source === 'update-dependency' && blocker.message.includes('missing-update-library')
    )));
    const projectedDownloadsBefore = fake.requests.filter(
      (entry) => entry.pathname.startsWith('/downloads/'),
    ).length;
    const projectedDependency = await runCli([
      'update', fixture.projectedDependency.instance, '--yes', '--json',
    ], fake.baseUrl, 1);
    assert.match(projectedDependency.stderr, /missing-update-library/);
    assert.equal(fake.requests.filter(
      (entry) => entry.pathname.startsWith('/downloads/'),
    ).length, projectedDownloadsBefore);
    assert.deepEqual(await readFile(
      path.join(fixture.projectedDependency.mods, 'demo-1.0.0.jar'),
    ), fixture.installedJar);
    fake.setUpdateDependencies([]);

    fake.setCorruptDownloads(true);
    const failedUpdate = parseJson(await runCli([
      'update', fixture.failedUpdate.instance, '--yes', '--json',
    ], fake.baseUrl, 1), 'update --yes checksum failure');
    assert.equal(failedUpdate.execution.applied, false);
    assert.match(failedUpdate.execution.failureReason, /nothing was applied/);
    assert.deepEqual(await readFile(
      path.join(fixture.failedUpdate.mods, 'demo-1.0.0.jar'),
    ), fixture.installedJar);
    await assert.rejects(readFile(path.join(fixture.failedUpdate.mods, 'demo-2.0.0.jar')));
    assert.deepEqual(await readdir(path.join(fixture.failedUpdate.mods, '.upmods-stage')), []);

    fake.setCorruptDownloads(false);
    const applied = parseJson(await runCli([
      'update', fixture.transactional.instance, '--yes', '--json',
    ], fake.baseUrl), 'update --yes');
    assert.equal(applied.execution.applied, true);
    assert.equal(applied.execution.applyResult.appliedCount, 1);
    assert.deepEqual(await readFile(
      path.join(fixture.transactional.mods, 'demo-2.0.0.jar'),
    ), fake.updateContent);
    await assert.rejects(readFile(path.join(fixture.transactional.mods, 'demo-1.0.0.jar')));
    const manifestPath = applied.execution.applyResult.session.manifestPath;
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).status, 'applied');

    const postUpdateCheck = parseJson(await runCli([
      'check', fixture.transactional.instance, '--json',
    ], fake.baseUrl), 'post-update check');
    assert.equal(postUpdateCheck.updates.length, 0);
    assert.equal(postUpdateCheck.upToDate[0].installedVersionId, 'demo-v2');

    const rollback = await runCli(['rollback', fixture.transactional.instance], fake.baseUrl);
    assert.match(rollback.stdout, /Rolled back 1 mods/);
    assert.deepEqual(await readFile(
      path.join(fixture.transactional.mods, 'demo-1.0.0.jar'),
    ), fixture.installedJar);
    await assert.rejects(readFile(path.join(fixture.transactional.mods, 'demo-2.0.0.jar')));
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).status, 'rolled-back');

    await writeFile(path.join(fixture.prismMods, 'drift.jar'), createJar(
      'quilt.mod.json',
      JSON.stringify({ quilt_loader: { id: 'drift', version: '1.0.0', metadata: { name: 'Drift' } } }),
    ));
    const drift = parseJson(await runCli(['verify', fixture.prism, '--json'], fake.baseUrl, 2), 'verify drift');
    assert.equal(drift.valid, false);
    assert(drift.changes.some((change) => change.kind === 'added' && change.displayName === 'drift.jar'));

    assert(fake.requests.some((entry) => entry.pathname === '/v2/version_files/update'));
    assert.equal(fake.requests.filter((entry) => entry.pathname.startsWith('/downloads/')).length, 2);
    console.log(
      `Offline CLI integration passed: scan, check, audit, audit --strict, lock, verify, update dry-run/Apply, `
      + `safety refusal, projected dependency refusal, checksum failure, rollback, config, Prism/CurseForge detection, `
      + `local JAR metadata, and lockfile drift `
      + `(${fake.requests.length} local API requests).`,
    );
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

await main();
