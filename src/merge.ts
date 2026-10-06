import { FIELDS } from './model.ts';
import type { Candidate, Field, HotelResult, NormalizedRecord, Notice } from './model.ts';

function comparison(candidate: Candidate): string {
  if (candidate.field === 'amenities' && Array.isArray(candidate.value)) {
    return JSON.stringify(candidate.value.map(item => String(item).toLowerCase()).sort());
  }
  return JSON.stringify(candidate.value);
}

function notice(kind: Notice['kind'], field: string, message: string, action: string | null, candidates: Candidate[]): Notice {
  return { kind, field, message, action, evidence: candidates.flatMap(item => item.evidence) };
}

function resolve(field: Field, official: Candidate[], ota: Candidate[], notices: Notice[]): Candidate | undefined {
  const primary = official.filter(item => item.state !== 'missing');
  const secondary = ota.filter(item => item.state !== 'missing');
  const all = [...primary, ...secondary];
  if (primary.some(item => item.state !== 'valid')) {
    notices.push(notice(secondary.length ? 'conflict' : 'review', field,
      'Official evidence is invalid or uncertain. This field is withheld; OTA data cannot silently replace or reinterpret it.',
      secondary.length ? 'Confirm the original meaning and currency/qualifiers, then decide whether the OTA value may be used.'
        : 'Confirm the uncertain official evidence and approve the correct value before restoring this field.', all));
    return undefined;
  }
  const choices = primary.length ? primary : secondary;
  if (!choices.length) {
    if (field !== 'status') notices.push(notice('dropped', field, 'No source supplies this field; it is omitted without invention.', null, []));
    return undefined;
  }
  if (choices.some(item => item.state !== 'valid') || new Set(choices.map(comparison)).size !== 1) {
    notices.push(notice('conflict', field, primary.length
      ? 'Official records disagree. This field is withheld rather than choosing by record order or source date.'
      : 'OTA evidence is invalid, uncertain or conflicting. The missing official field remains withheld.',
    'Confirm the correct value and approve a source before restoring this field.', all));
    return undefined;
  }
  const first = choices[0]!;
  const selected: Candidate = { ...first, evidence: choices.flatMap(item => item.evidence) };
  if (!primary.length) {
    notices.push(notice('merged', field, 'Filled a genuinely missing official field from agreeing, valid OTA evidence.', null, choices));
  } else {
    for (const other of secondary) {
      if (other.state !== 'valid' || comparison(other) !== comparison(selected)) {
        notices.push(notice('conflict', field, field === 'amenities'
          ? 'Official and OTA amenity lists differ in wording, membership or qualifiers. Retained the official list; OTA extras were not automatically added.'
          : 'Official and OTA values differ or cannot be safely compared. Retained the valid official value.',
        'Confirm the differing values with the hotel. Decide whether wording is equivalent or facts need correction.', [selected, other]));
      } else {
        selected.evidence.push(...other.evidence);
        notices.push(notice('agreement', field, 'Official and OTA values agree after documented normalization.', null, [selected, other]));
      }
    }
  }
  return selected;
}

function identity(record: NormalizedRecord): string | null {
  const name = record.fields.name_en.state === 'valid' ? record.fields.name_en : record.fields.name_ja;
  const address = record.fields.address;
  const url = record.fields.url;
  if (name.state !== 'valid' || address.state !== 'valid' || url.state !== 'valid') return null;
  const parsed = new URL(String(url.value));
  const keyUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}${parsed.hash}`;
  return JSON.stringify([String(name.value).toLowerCase(), address.value, keyUrl]);
}

export function mergeHotels(official: NormalizedRecord[], ota: NormalizedRecord[]): HotelResult[] {
  const groups = new Map<string, NormalizedRecord[]>();
  for (const record of official) {
    const key = identity(record) ?? record.record.id;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map(records => {
    records.sort((a, b) => a.record.id.localeCompare(b.record.id, 'en'));
    const id = records[0]!.record.id;
    const aliases = records.map(record => record.record.id);
    const associated = ota.filter(record => aliases.includes(record.record.id));
    const notices = [...records, ...associated].flatMap(record => record.notices);
    const fields: HotelResult['fields'] = {};
    if (records.length > 1) {
      notices.push({ kind: 'review', field: 'identity',
        message: `Grouped records ${aliases.join(', ')} by matching name, address and explicit URL identity (ignoring a trailing URL slash only for duplicate detection). ${id} is a stable filename identifier, not a preferred factual source. No second Hotel file is emitted.`,
        action: 'Confirm these records describe the same property and approve the duplicate group.',
        evidence: records.flatMap(record => [record.fields.name_en, record.fields.name_ja, record.fields.address, record.fields.url].flatMap(item => item.evidence)) });
    }
    for (const field of FIELDS) {
      // Update dates describe individual source records, not a Hotel-level freshness claim.
      if (field === 'updated') continue;
      const candidate = resolve(field, records.map(record => record.fields[field]), associated.map(record => record.fields[field]), notices);
      if (candidate) fields[field] = candidate;
    }
    let disposition: HotelResult['disposition'] = 'generated';
    let reason = 'Source-backed partial profile generated; resolve the listed human-review actions before external publication.';
    if (!fields.name_ja && !fields.name_en) {
      disposition = 'excluded'; reason = 'No usable name in either source. An anonymous hotel identity is not invented.';
    } else if (!fields.address) {
      disposition = 'held'; reason = 'No usable address; confirm property identity before generating a public profile.';
    } else if (fields.status?.value === 'closed' || notices.some(item => item.field === 'status' && ['conflict', 'review'].includes(item.kind))) {
      disposition = 'held'; reason = 'Closed, conflicting or uncertain operating status. Confirm status before generating a public profile.';
    }
    if (disposition !== 'generated') notices.push({ kind: 'review', field: 'eligibility', message: reason,
      action: 'Confirm hotel identity or operating status, then decide whether this property can be published.',
      evidence: records.flatMap(record => [record.fields.name_ja, record.fields.name_en, record.fields.address, record.fields.status].flatMap(item => item.evidence)) });
    return { id, aliases, official: records, ota: associated, fields, notices, disposition, reason };
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
