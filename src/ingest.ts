import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Inputs, Json, SourceRecord } from './model.ts';

export const DEFAULT_INPUT_FILES = { official: 'data/hotels_raw.json', ota: 'data/hotels_ota.json' } as const;
export interface InputFiles {
  official?: string;
  ota?: string;
}

function inside(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return typeof value === 'object' && Object.values(value).every(isJson);
}

export function parseRecords(text: string, file: string, official: boolean): SourceRecord[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected a JSON array`);
  const seen = new Set<string>();
  return parsed.map((item: unknown, index: number) => {
    if (!isJson(item) || item === null || Array.isArray(item) || typeof item !== 'object') {
      throw new Error(`${file}[${index}]: expected a JSON object`);
    }
    const idField = official ? 'id' : 'hotel_ref';
    const id = item[idField];
    if (typeof id !== 'string' || !/^H\d{3,}$/.test(id)) {
      const otherField = official ? 'hotel_ref' : 'id';
      const hint = !Object.hasOwn(item, idField) && Object.hasOwn(item, otherField)
        ? ` Found "${otherField}" instead; check --official and --ota for swapped input files.` : '';
      throw new Error(`${file}[${index}]: invalid hotel identifier in "${idField}" for ${official ? 'official' : 'OTA'} input; expected H followed by at least three digits (for example H001).${hint}`);
    }
    const source = official ? 'official' : item['source'];
    if (source !== 'official' && source !== 'ota_a' && source !== 'ota_b') {
      throw new Error(`${file}[${index}]: unknown OTA source`);
    }
    if (!official && source === 'official') throw new Error(`${file}[${index}]: invalid OTA source`);
    if (official && seen.has(id)) throw new Error(`${file}: duplicate official ID ${id}`);
    seen.add(id);
    return { id, source, file, index, raw: item };
  });
}

export async function ingest(root: string, inputs: InputFiles = {}): Promise<Inputs> {
  const configured = [inputs.official ?? DEFAULT_INPUT_FILES.official, inputs.ota ?? DEFAULT_INPUT_FILES.ota];
  if (configured.some(file => !file.trim())) throw new Error('Input file paths must not be empty.');
  const paths = configured.map(file => resolve(root, file));
  const physicalPaths = await Promise.all(paths.map(file => realpath(file)));
  const physicalRoot = await realpath(root);
  if (physicalPaths[0] === physicalPaths[1]) throw new Error('Official and OTA inputs must be different files.');
  const output = resolve(root, 'out');
  const physicalOutput = resolve(physicalRoot, 'out');
  if (paths.some(file => inside(output, file)) || physicalPaths.some(file => inside(physicalOutput, file))) {
    throw new Error('Input files must be outside the output directory so generation cannot overwrite or delete its sources.');
  }
  const files = physicalPaths.map(file => relative(physicalRoot, file).split(sep).join('/'));
  const texts = await Promise.all(paths.map(file => readFile(file, 'utf8')));
  return {
    official: parseRecords(texts[0]!, files[0]!, true),
    ota: parseRecords(texts[1]!, files[1]!, false),
    hashes: Object.fromEntries(files.map((file, i) => [file, createHash('sha256').update(texts[i]!).digest('hex')])),
  };
}
