import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MANIFEST = '.hotel-profile-manifest.json';
const GENERATOR = 'hotel-profile/v1';
const allowed = (name: string): boolean => /^(?:H\d{3,}\.(?:jsonld|provenance\.json)|report\.md|review\.json)$/.test(name);
const digest = (content: string): string => createHash('sha256').update(content).digest('hex');

async function regularContent(path: string): Promise<string | null> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Refusing non-regular or linked output: ${path}`);
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseManifest(text: string): Record<string, string> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || !('generator' in value) || value.generator !== GENERATOR
    || !('files' in value) || value.files === null || typeof value.files !== 'object' || Array.isArray(value.files)) {
    throw new Error('Output manifest is not owned by this generator; no files were changed.');
  }
  const entries = Object.entries(value.files);
  if (entries.some(([name, hash]) => !allowed(name) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Output manifest has unsafe names or invalid hashes; no files were changed.');
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

async function atomicWrite(dir: string, name: string, content: string): Promise<void> {
  const temporary = join(dir, `.${name}.tmp-${process.pid}`);
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try { await rename(temporary, join(dir, name)); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function writeArtifacts(root: string, artifacts: Map<string, string>): Promise<void> {
  if ([...artifacts.keys()].some(name => !allowed(name))) throw new Error('Unsafe artifact filename.');
  const dir = join(root, 'out');
  try {
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Refusing a symlink or non-directory output path.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    await mkdir(dir);
  }
  const existingManifest = await regularContent(join(dir, MANIFEST));
  const owned = existingManifest === null ? {} : parseManifest(existingManifest);
  // Complete preflight before overwriting or removing any artifacts.
  for (const [name, hash] of Object.entries(owned)) {
    const content = await regularContent(join(dir, name));
    if (content !== null && digest(content) !== hash) throw new Error(`Generated file was edited: out/${name}. Preserve or move it before rerunning.`);
  }
  for (const name of artifacts.keys()) {
    if (!Object.hasOwn(owned, name) && await regularContent(join(dir, name)) !== null) {
      throw new Error(`Refusing to overwrite an unowned file: out/${name}`);
    }
  }
  const ordered = [...artifacts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  for (const [name, content] of ordered) {
    if (await regularContent(join(dir, name)) !== content) await atomicWrite(dir, name, content);
  }
  for (const name of Object.keys(owned).sort()) {
    if (!artifacts.has(name)) await unlink(join(dir, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const manifest = `${JSON.stringify({ generator: GENERATOR, files: Object.fromEntries(ordered.map(([name, content]) => [name, digest(content)])) }, null, 2)}\n`;
  if (manifest !== existingManifest) await atomicWrite(dir, MANIFEST, manifest);
}
