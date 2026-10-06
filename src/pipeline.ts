import { ingest } from './ingest.ts';
import type { InputFiles } from './ingest.ts';
import { normalize } from './normalize.ts';
import { mergeHotels } from './merge.ts';
import { exportHotel, validateExport } from './export.ts';
import { renderReport } from './report.ts';
import { writeArtifacts } from './write.ts';
import type { ExportedHotel, HotelResult, Inputs, NormalizedRecord } from './model.ts';

export interface BuildResult {
  hotels: HotelResult[];
  exported: ExportedHotel[];
  orphanOta: NormalizedRecord[];
  artifacts: Map<string, string>;
}

function json(value: unknown): string {
  // Audit evidence remains exact after JSON parsing, including untrusted source text.
  return `${JSON.stringify(value, null, 2).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')}\n`;
}

export function build(inputs: Inputs): BuildResult {
  const official = inputs.official.map(normalize);
  const ota = inputs.ota.map(normalize);
  const ids = new Set(official.map(item => item.record.id));
  const orphanOta = ota.filter(item => !ids.has(item.record.id));
  const hotels = mergeHotels(official, ota);
  const exported = hotels.map(item => exportHotel(item, inputs.hashes)).filter((item): item is ExportedHotel => item !== null);
  const artifacts = new Map<string, string>();
  for (const hotel of exported) {
    validateExport(hotel);
    artifacts.set(`${hotel.id}.jsonld`, json(hotel.profile));
    artifacts.set(`${hotel.id}.provenance.json`, json(hotel.provenance));
  }
  artifacts.set('report.md', renderReport(hotels, orphanOta));
  artifacts.set('review.json', json({ policy_version: 1, input_sha256: inputs.hashes,
    hotels: hotels.map(item => ({ hotel_id: item.id, source_record_ids: item.aliases,
      disposition: item.disposition, reason: item.reason, notices: item.notices })),
    unmatched_ota: orphanOta.map(item => ({ hotel_ref: item.record.id, source: item.record.source,
      file: item.record.file, source_pointer: `/${item.record.index}`, reason: 'No matching official hotel ID; withheld for human review.' })) }));
  return { hotels, exported, orphanOta, artifacts };
}

export async function runPipeline(root: string, inputs: InputFiles = {}): Promise<BuildResult> {
  const result = build(await ingest(root, inputs));
  await writeArtifacts(root, result.artifacts);
  return result;
}
