import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ingest, parseRecords } from '../src/ingest.ts';
import { normalizeField } from '../src/normalize.ts';
import { build, runPipeline } from '../src/pipeline.ts';
import { factualLeaves, validateExport } from '../src/export.ts';
import { writeArtifacts } from '../src/write.ts';
import type { ExportedHotel, Inputs, Json, SourceRecord } from '../src/model.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await ingest(root);
const result = build(fixture);
const hotel = (id: string): ExportedHotel => {
  const value = result.exported.find(item => item.id === id);
  assert.ok(value, `Missing exported hotel ${id}`);
  return value;
};
function record(raw: Record<string, Json>, source: SourceRecord['source'] = 'official'): SourceRecord {
  return { id: 'H100', source, file: source === 'official' ? 'data/hotels_raw.json' : 'data/hotels_ota.json', index: 0, raw };
}
function pointer(value: Json, path: string): Json {
  let current = value;
  for (const part of path.slice(1).split('/')) {
    assert.ok(current !== null && typeof current === 'object');
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    const next = Array.isArray(current) ? current[Number(key)] : current[key];
    assert.notEqual(next, undefined, path);
    current = next!;
  }
  return current;
}
async function sandbox(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hotel-profile-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, 'data'), join(dir, 'data'), { recursive: true });
  return dir;
}
async function snapshot(dir: string): Promise<Record<string, string>> {
  const names = (await readdir(dir)).sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(join(dir, name), 'utf8')])));
}

test('all source IDs are accounted for; duplicate, closed and nameless records are handled', () => {
  assert.deepEqual(result.exported.map(item => item.id), ['H001', 'H002', 'H003', 'H005', 'H006', 'H007', 'H010', 'H011', 'H012']);
  assert.deepEqual(result.hotels.find(item => item.id === 'H001')!.aliases, ['H001', 'H004']);
  assert.equal(result.hotels.find(item => item.id === 'H008')!.disposition, 'held');
  assert.equal(result.hotels.find(item => item.id === 'H009')!.disposition, 'excluded');
  assert.equal(result.artifacts.has('H004.jsonld'), false);
  const report = result.artifacts.get('report.md')!;
  for (let i = 1; i <= 12; i++) assert.ok(report.includes(`## H${String(i).padStart(3, '0')}`));
});

test('every factual JSON-LD leaf has exact source pointers, raw evidence and input hashes', async () => {
  const sources: Record<string, Json> = {};
  for (const file of Object.keys(fixture.hashes)) {
    const text = await readFile(join(root, file), 'utf8');
    sources[file] = JSON.parse(text) as Json;
    assert.equal(createHash('sha256').update(text).digest('hex'), fixture.hashes[file]);
  }
  for (const output of result.exported) {
    const leaves = factualLeaves(output.profile);
    assert.deepEqual(Object.keys(leaves).sort(), Object.keys(output.provenance.fields).sort());
    assert.deepEqual(output.provenance.input_sha256, fixture.hashes);
    for (const [path, value] of Object.entries(leaves)) {
      const provenance = output.provenance.fields[path]!;
      assert.deepEqual(provenance.value, value);
      assert.ok(provenance.evidence.length, `${output.id}${path}`);
      for (const citation of provenance.evidence) {
        assert.deepEqual(pointer(sources[citation.file]!, citation.source_pointer), citation.raw_value);
        assert.ok(citation.transformations.length);
        const sourceRecord = pointer(sources[citation.file]!, citation.source_pointer.slice(0, citation.source_pointer.lastIndexOf('/')));
        assert.ok(sourceRecord !== null && typeof sourceRecord === 'object' && !Array.isArray(sourceRecord));
        assert.equal(sourceRecord[citation.source === 'official' ? 'id' : 'hotel_ref'], citation.record_id);
        if (citation.source !== 'official') assert.equal(sourceRecord['source'], citation.source);
      }
    }
  }
});

test('clock and telephone formatting preserve facts without inventing country codes', () => {
  assert.equal(hotel('H002').profile['checkinTime'], '15:00');
  assert.equal(hotel('H002').profile['checkoutTime'], '10:00');
  assert.equal(hotel('H002').profile['telephone'], '+81261000002');
  assert.equal(hotel('H001').profile['telephone'], '0450000001');
  assert.equal(hotel('H010').profile['telephone'], '+842800000010');
  assert.equal(hotel('H010').profile['alternateName'], undefined);
  for (const [input, expected] of [['3pm', '15:00'], ['12am', '00:00'], ['noon', '12:00'], ['9時', '09:00']]) {
    assert.equal(normalizeField(record({ checkin: input! }), 'checkin').value, expected);
  }
  assert.equal(normalizeField(record({ checkin: '25:00' }), 'checkin').state, 'invalid');
});

test('OTA fills genuinely missing name and room fields with OTA citations', () => {
  assert.equal(hotel('H002').profile['alternateName'], 'Yamagiri Ryokan');
  assert.equal(hotel('H003').profile['name'], 'さくらステーションイン');
  assert.equal(hotel('H003').profile['numberOfRooms'], 54);
  assert.equal(hotel('H006').profile['telephone'], '0136000006');
  for (const [id, path] of [['H002', '/alternateName'], ['H003', '/name'], ['H003', '/numberOfRooms'], ['H006', '/telephone']]) {
    assert.ok(hotel(id!).provenance.fields[path!]!.evidence.every(item => item.source !== 'official'));
  }
});

test('price qualifiers and explicit currency are preserved without a nightly-room assumption', () => {
  assert.equal(hotel('H005').profile['priceRange'], 'From yen 25000 per person');
  assert.equal(hotel('H010').profile['priceRange'], 'From VND 1800000');
  assert.equal(hotel('H003').profile['priceRange'], 'From JPY 8500');
  assert.equal(hotel('H011').profile['priceRange'], 'From ¥ 22000');
  assert.equal(hotel('H005').profile['offers'], undefined);
  const allArtifacts = [...result.artifacts.values()].join('\n');
  assert.ok(!allArtifacts.includes('tanaka@example.com'));
  assert.ok(!allArtifacts.includes('Contact manager Tanaka'));
});

test('uncertain or zero official prices are withheld despite plausible OTA replacements', () => {
  for (const id of ['H001', 'H002', 'H006', 'H012']) assert.equal(hotel(id).profile['priceRange'], undefined);
  for (const id of ['H006', 'H012']) {
    assert.ok(result.hotels.find(item => item.id === id)!.notices.some(item => item.kind === 'conflict' && item.field === 'price_from'));
  }
  assert.equal(normalizeField(record({ price_from: '0' }), 'price_from').state, 'invalid');
  assert.equal(normalizeField(record({ price_from: '6500' }), 'price_from').state, 'uncertain');
});

test('qualified check-in time is not replaced with an exact OTA time; suspect geo and URL are withheld', () => {
  const profile = hotel('H003').profile;
  assert.equal(profile['checkinTime'], undefined);
  assert.equal(profile['checkoutTime'], '12:00');
  assert.equal(profile['geo'], undefined);
  assert.equal(profile['url'], undefined);
  const conflict = result.hotels.find(item => item.id === 'H003')!.notices.find(item => item.kind === 'conflict' && item.field === 'checkin')!;
  assert.ok(conflict.evidence.some(item => item.raw_value === 'after 3pm'));
  assert.ok(conflict.evidence.some(item => item.raw_value === '15:00'));
});

test('ambiguous and invalid dates remain audit issues, never fabricated Hotel freshness', () => {
  const updates = hotel('H002').provenance.source_updates;
  assert.equal(updates[0]!.state, 'uncertain');
  assert.equal(updates[0]!.value, null);
  assert.equal(hotel('H007').provenance.source_updates[0]!.state, 'invalid');
  for (const output of result.exported) assert.equal(output.profile['dateModified'], undefined);
  assert.equal(normalizeField(record({ updated: '2024/02/29' }), 'updated').value, '2024-02-29');
  assert.equal(normalizeField(record({ updated: '2026-02-29' }), 'updated').state, 'invalid');
});

test('official conflicts remain visible and OTA amenities are not unioned into public facts', () => {
  assert.equal(hotel('H001').profile['checkinTime'], '15:00');
  assert.equal(hotel('H001').profile['numberOfRooms'], 120);
  assert.equal(hotel('H010').profile['numberOfRooms'], 90);
  assert.ok(hotel('H001').provenance.fields['/numberOfRooms']!.evidence.every(item => item.source === 'official'));
  for (const id of ['H001', 'H007', 'H010']) assert.equal(hotel(id).provenance.needs_human_review, true);
  assert.ok(!JSON.stringify(hotel('H007').profile).includes('Airport shuttle'));
  assert.ok(!JSON.stringify(hotel('H010').profile).includes('Spa'));
  assert.ok(!JSON.stringify(hotel('H002').profile).includes('Free Wi-Fi'));
});

test('unsafe amenity text is excluded while safe facts and exact audit evidence survive', () => {
  assert.ok(!JSON.stringify(hotel('H011').profile).includes('<script>'));
  assert.ok(JSON.stringify(hotel('H011').profile).includes('Mt. Fuji view'));
  assert.ok(hotel('H011').provenance.fields['/amenityFeature/0/name']!.evidence.some(item => String(item.raw_value).includes('<script>')));
  assert.ok(![...result.artifacts.values()].join('\n').includes('<script>'));
});

test('amenity deduplication ignores case but keeps paid/free qualifiers distinct', () => {
  const candidate = normalizeField(record({ amenities: 'Pool,pool,Wi-Fi,wifi,Parking,Parking (paid),Free Wi-Fi' }), 'amenities');
  assert.deepEqual(candidate.value, ['Free Wi-Fi', 'Parking', 'Parking (paid)', 'Pool', 'Wi-Fi']);
});

test('duplicate IDs and malformed source structures fail at ingestion', () => {
  for (const text of ['{}', '[null]', '[{"id":"../../out/report.md"}]', '[{"id":"H001"},{"id":"H001"}]']) {
    assert.throws(() => parseRecords(text, 'official.json', true));
  }
  assert.throws(() => parseRecords('[{"hotel_ref":"H001","source":"unknown"}]', 'ota.json', false));
  assert.throws(() => parseRecords('[{"hotel_ref":"H001","source":"ota_a"}]', 'ota.json', true), /"id" for official input.*Found "hotel_ref" instead; check --official and --ota/);
  assert.throws(() => parseRecords('[{"id":"H001"}]', 'official.json', false), /"hotel_ref" for OTA input.*Found "id" instead; check --official and --ota/);
});

test('duplicate grouping is stable under record reordering; conflicting official fields are withheld', () => {
  const reordered = build({ ...fixture, official: [...fixture.official].reverse() });
  assert.deepEqual(reordered.exported.map(item => item.profile), result.exported.map(item => item.profile));
  const changed: Inputs = structuredClone(fixture);
  changed.official.find(item => item.id === 'H004')!.raw['rooms'] = '121';
  const output = build(changed);
  assert.equal(output.exported.find(item => item.id === 'H001')!.profile['numberOfRooms'], undefined);
  assert.ok(output.hotels.find(item => item.id === 'H001')!.notices.some(item => item.kind === 'conflict' && item.field === 'rooms'));
});

test('conflicting OTA gap fills are withheld; unmatched references are not turned into invented hotels', () => {
  const changed: Inputs = structuredClone(fixture);
  changed.ota.push({ ...record({ hotel_ref: 'H003', source: 'ota_a', rooms: '55' }, 'ota_a'), id: 'H003', index: changed.ota.length });
  changed.ota.push({ ...record({ hotel_ref: 'H999', source: 'ota_a', name_en: 'Unknown property' }, 'ota_a'), id: 'H999', index: changed.ota.length });
  const output = build(changed);
  assert.equal(output.exported.find(item => item.id === 'H003')!.profile['numberOfRooms'], undefined);
  assert.equal(output.exported.some(item => item.id === 'H999'), false);
  assert.equal(output.orphanOta[0]!.record.id, 'H999');
  assert.ok(output.artifacts.get('report.md')!.includes('confirm the hotel reference'));
});

test('export validation rejects unsupported fields and mismatched or empty provenance', () => {
  const changed = structuredClone(hotel('H002'));
  changed.profile['description'] = 'Invented hotel description';
  assert.throws(() => validateExport(changed), /paths do not match/);
  delete changed.profile['description'];
  changed.provenance.fields['/name']!.value = 'Invented name';
  assert.throws(() => validateExport(changed), /invalid provenance/);
  changed.provenance.fields['/name']!.value = changed.profile['name']!;
  changed.provenance.fields['/name']!.evidence = [];
  assert.throws(() => validateExport(changed), /invalid provenance/);
});

test('reruns are byte-stable and preserve unrelated files', async t => {
  const dir = await sandbox(t);
  await runPipeline(dir);
  await writeFile(join(dir, 'out', 'ops-notes.txt'), 'Keep this user note.');
  const first = await snapshot(join(dir, 'out'));
  await runPipeline(dir);
  assert.deepEqual(await snapshot(join(dir, 'out')), first);
});

test('only unchanged generator-owned stale profiles are cleaned after an input change', async t => {
  const dir = await sandbox(t);
  await runPipeline(dir);
  await writeFile(join(dir, 'out', 'H999.jsonld'), 'Unrelated user-owned file.');
  const raw = fixture.official.filter(item => item.id !== 'H002').map(item => item.raw);
  await writeFile(join(dir, 'data', 'hotels_raw.json'), JSON.stringify(raw));
  await runPipeline(dir);
  const names = await readdir(join(dir, 'out'));
  assert.ok(!names.includes('H002.jsonld'));
  assert.ok(!names.includes('H002.provenance.json'));
  assert.equal(await readFile(join(dir, 'out', 'H999.jsonld'), 'utf8'), 'Unrelated user-owned file.');
});

test('edited generated files abort preflight and preserve the whole existing output', async t => {
  const dir = await sandbox(t);
  await runPipeline(dir);
  await writeFile(join(dir, 'out', 'report.md'), 'User edited this report.');
  const first = await snapshot(join(dir, 'out'));
  await assert.rejects(runPipeline(dir), /Generated file was edited/);
  assert.deepEqual(await snapshot(join(dir, 'out')), first);
});

test('unowned target collisions are preserved rather than overwritten', async t => {
  const dir = await sandbox(t);
  await mkdir(join(dir, 'out'));
  await writeFile(join(dir, 'out', 'report.md'), 'User report');
  await assert.rejects(runPipeline(dir), /unowned file/);
  assert.deepEqual(await snapshot(join(dir, 'out')), { 'report.md': 'User report' });
});

test('symlink output directories and symlink artifact files cannot modify external files', async t => {
  const dir = await sandbox(t);
  const target = join(dir, 'unrelated');
  await mkdir(target);
  await writeFile(join(target, 'report.md'), 'Keep external report');
  await symlink(target, join(dir, 'out'));
  await assert.rejects(runPipeline(dir), /symlink/);
  await rm(join(dir, 'out'));
  await mkdir(join(dir, 'out'));
  await symlink(join(target, 'report.md'), join(dir, 'out', 'report.md'));
  await assert.rejects(runPipeline(dir), /non-regular or linked/);
  assert.equal(await readFile(join(target, 'report.md'), 'utf8'), 'Keep external report');
});

test('a manifest cannot authorize path traversal cleanup', async t => {
  const dir = await sandbox(t);
  await mkdir(join(dir, 'out'));
  const original = await readFile(join(dir, 'data', 'hotels_raw.json'), 'utf8');
  await writeFile(join(dir, 'out', '.hotel-profile-manifest.json'), JSON.stringify({ generator: 'hotel-profile/v1', files: { '../data/hotels_raw.json': '0'.repeat(64) } }));
  await assert.rejects(writeArtifacts(dir, new Map([['report.md', 'new report']])), /unsafe names/);
  assert.equal(await readFile(join(dir, 'data', 'hotels_raw.json'), 'utf8'), original);
});

test('CLI runs without node_modules; unknown arguments and swapped sources preserve output', async t => {
  const dir = await sandbox(t);
  await cp(join(root, 'src'), join(dir, 'src'), { recursive: true });
  await cp(join(root, 'package.json'), join(dir, 'package.json'));
  const exec = promisify(execFile);
  const first = await exec(process.execPath, [join(dir, 'src', 'cli.ts')], { cwd: dir });
  assert.match(first.stdout, /Generated 9 Hotel profiles; 1 held, 1 excluded/);
  assert.equal(first.stderr, '');
  const before = await snapshot(join(dir, 'out'));
  await assert.rejects(exec(process.execPath, [join(dir, 'src', 'cli.ts'), '--unknown'], { cwd: dir }));
  await assert.rejects(exec(process.execPath, [join(dir, 'src', 'cli.ts'), '--official', './data/hotels_ota.json', '--ota', './data/hotels_raw.json'], { cwd: dir }), error => {
    assert.ok(error instanceof Error && 'stderr' in error);
    assert.match(String(error.stderr), /"id" for official input.*check --official and --ota for swapped input files/);
    return true;
  });
  assert.deepEqual(await snapshot(join(dir, 'out')), before);
});

test('custom filenames carry their actual paths, source pointers and hashes through the pipeline', async t => {
  const dir = await sandbox(t);
  const imported = join(dir, 'supplied files');
  await mkdir(imported);
  await cp(join(dir, 'data', 'hotels_raw.json'), join(imported, 'official feed.json'));
  await cp(join(dir, 'data', 'hotels_ota.json'), join(imported, 'ota feed.json'));
  await rm(join(dir, 'data'), { recursive: true });
  const inputs = { official: 'supplied files/official feed.json', ota: join(imported, 'ota feed.json') };
  const custom = await runPipeline(dir, inputs);
  const sources = await ingest(dir, inputs);
  assert.deepEqual(custom.exported.map(item => item.profile), result.exported.map(item => item.profile));
  assert.deepEqual(Object.keys(sources.hashes), ['supplied files/official feed.json', 'supplied files/ota feed.json']);
  for (const output of custom.exported) {
    assert.deepEqual(output.provenance.input_sha256, sources.hashes);
    for (const entry of Object.values(output.provenance.fields)) {
      for (const citation of entry.evidence) {
        assert.ok(citation.file.startsWith('supplied files/'));
        const sourceText = await readFile(join(dir, citation.file), 'utf8');
        assert.equal(createHash('sha256').update(sourceText).digest('hex'), sources.hashes[citation.file]);
        assert.deepEqual(pointer(JSON.parse(sourceText) as Json, citation.source_pointer), citation.raw_value);
      }
    }
  }
  const first = await snapshot(join(dir, 'out'));
  await runPipeline(dir, inputs);
  assert.deepEqual(await snapshot(join(dir, 'out')), first);
});

test('CLI accepts relative and absolute custom files from another working directory without default fixtures', async t => {
  const dir = await sandbox(t);
  await cp(join(root, 'src'), join(dir, 'src'), { recursive: true });
  await cp(join(root, 'package.json'), join(dir, 'package.json'));
  const imported = join(dir, 'new input');
  await mkdir(imported);
  await writeFile(join(imported, 'official feed.json'), JSON.stringify([{ id: 'H200', name_en: 'New supplied hotel', address: 'Supplied address', rooms: '' }]));
  await writeFile(join(imported, 'ota feed.json'), JSON.stringify([{ hotel_ref: 'H200', source: 'ota_a', rooms: '7' }]));
  await rm(join(dir, 'data'), { recursive: true });
  const exec = promisify(execFile);
  const run = await exec(process.execPath, [join(dir, 'src', 'cli.ts'), '--official', 'official feed.json', '--ota', join(imported, 'ota feed.json')], { cwd: imported });
  assert.match(run.stdout, /Generated 1 Hotel profiles; 0 held, 0 excluded/);
  const profile = JSON.parse(await readFile(join(dir, 'out', 'H200.jsonld'), 'utf8')) as Record<string, Json>;
  assert.equal(profile['name'], 'New supplied hotel');
  assert.equal(profile['numberOfRooms'], 7);
  const provenance = JSON.parse(await readFile(join(dir, 'out', 'H200.provenance.json'), 'utf8'));
  assert.equal(provenance.fields['/name'].evidence[0].file, 'new input/official feed.json');
  assert.equal(provenance.fields['/numberOfRooms'].evidence[0].file, 'new input/ota feed.json');
  const before = await snapshot(join(dir, 'out'));
  for (const args of [['--official'], ['--ota'], ['--official', '--ota', 'file.json']]) {
    await assert.rejects(exec(process.execPath, [join(dir, 'src', 'cli.ts'), ...args], { cwd: imported }));
  }
  assert.deepEqual(await snapshot(join(dir, 'out')), before);
  const help = await exec(process.execPath, [join(dir, 'src', 'cli.ts'), '--help'], { cwd: imported });
  assert.match(help.stdout, /--official <file>/);
});

test('one input override leaves the other default usable; missing inputs do not change existing output', async t => {
  const dir = await sandbox(t);
  await cp(join(dir, 'data', 'hotels_raw.json'), join(dir, 'renamed official.json'));
  const custom = await runPipeline(dir, { official: 'renamed official.json' });
  assert.deepEqual(custom.exported.map(item => item.profile), result.exported.map(item => item.profile));
  assert.deepEqual(Object.keys(custom.exported[0]!.provenance.input_sha256), ['renamed official.json', 'data/hotels_ota.json']);
  const before = await snapshot(join(dir, 'out'));
  await assert.rejects(runPipeline(dir, { official: 'does-not-exist.json' }), /ENOENT/);
  assert.deepEqual(await snapshot(join(dir, 'out')), before);
});

test('input roles cannot share a physical file or select a file inside output ownership', async t => {
  const dir = await sandbox(t);
  await assert.rejects(ingest(dir, { official: 'data/hotels_raw.json', ota: 'data/hotels_raw.json' }), /different files/);
  await symlink(join(dir, 'data', 'hotels_raw.json'), join(dir, 'official alias.json'));
  await assert.rejects(ingest(dir, { ota: 'official alias.json' }), /different files/);
  await mkdir(join(dir, 'out'));
  await cp(join(dir, 'data', 'hotels_raw.json'), join(dir, 'out', 'official feed.json'));
  const original = await readFile(join(dir, 'out', 'official feed.json'), 'utf8');
  await assert.rejects(runPipeline(dir, { official: 'out/official feed.json' }), /outside the output directory/);
  assert.equal(await readFile(join(dir, 'out', 'official feed.json'), 'utf8'), original);
  await symlink(join(dir, 'out', 'official feed.json'), join(dir, 'linked feed.json'));
  await assert.rejects(runPipeline(dir, { official: 'linked feed.json' }), /outside the output directory/);
});
