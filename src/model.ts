export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Source = 'official' | 'ota_a' | 'ota_b';
export interface SourceRecord {
  id: string;
  source: Source;
  file: string;
  index: number;
  raw: Record<string, Json>;
}
export interface Evidence {
  file: string;
  source: Source;
  record_id: string;
  source_field: string;
  source_pointer: string;
  raw_value: Json;
  transformations: string[];
}
export const FIELDS = ['name_ja', 'name_en', 'address', 'tel', 'checkin', 'checkout',
  'price_from', 'rooms', 'amenities', 'geo', 'url', 'status', 'updated'] as const;
export type Field = typeof FIELDS[number];
export interface Candidate {
  field: Field;
  state: 'valid' | 'missing' | 'invalid' | 'uncertain';
  value: Json;
  evidence: Evidence[];
  reason: string;
  changes: string[];
}
export interface Notice {
  kind: 'fixed' | 'merged' | 'conflict' | 'dropped' | 'review' | 'agreement';
  field: string;
  message: string;
  action: string | null;
  evidence: Evidence[];
}
export interface NormalizedRecord {
  record: SourceRecord;
  fields: Record<Field, Candidate>;
  notices: Notice[];
}
export interface HotelResult {
  id: string;
  aliases: string[];
  official: NormalizedRecord[];
  ota: NormalizedRecord[];
  fields: Partial<Record<Field, Candidate>>;
  notices: Notice[];
  disposition: 'generated' | 'held' | 'excluded';
  reason: string;
}
export interface Inputs {
  official: SourceRecord[];
  ota: SourceRecord[];
  hashes: Record<string, string>;
}
export interface Provenance {
  version: 1;
  hotel_id: string;
  source_record_ids: string[];
  input_sha256: Record<string, string>;
  fields: Record<string, { value: Json; evidence: Evidence[] }>;
  source_updates: Candidate[];
  needs_human_review: boolean;
}
export interface ExportedHotel {
  id: string;
  profile: Record<string, Json>;
  provenance: Provenance;
}
export function evidence(record: SourceRecord, field: string, transformations: string[] = []): Evidence[] {
  if (!Object.hasOwn(record.raw, field)) return [];
  return [{ file: record.file, source: record.source, record_id: record.id,
    source_field: field, source_pointer: `/${record.index}/${field}`,
    raw_value: record.raw[field]!, transformations }];
}
