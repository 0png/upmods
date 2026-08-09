import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releaseDir = path.resolve('release');
const tarballs = (await readdir(releaseDir))
  .filter((filename) => filename.endsWith('.tgz'))
  .sort();

if (tarballs.length === 0) {
  throw new Error(`No release tarball found in ${releaseDir}`);
}

for (const filename of tarballs) {
  const contents = await readFile(path.join(releaseDir, filename));
  const sha256 = createHash('sha256').update(contents).digest('hex');
  await writeFile(
    path.join(releaseDir, `${filename}.sha256`),
    `${sha256}  ${filename}\n`,
  );
  console.log(`${filename}: ${sha256}`);
}
