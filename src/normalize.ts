import { evidence, FIELDS } from './model.ts';
import type { Candidate, Field, Json, NormalizedRecord, Notice, SourceRecord } from './model.ts';

const missing = (value: Json | undefined): boolean => value === undefined || value === null || value === ''
  || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
const unsafe = (value: string): boolean => /[<>]|\b(?:javascript|data):/i.test(value);
const labels: Record<string, string> = { 'wifi': 'Wi-Fi', 'wi-fi': 'Wi-Fi', 'onsen': 'Onsen', 'parking': 'Parking' };

export function normalizeField(record: SourceRecord, field: Field): Candidate {
  const raw = record.raw[field];
  const candidate: Candidate = { field, state: 'missing', value: null,
    evidence: field === 'geo' ? [...evidence(record, 'lat'), ...evidence(record, 'lng')] : evidence(record, field),
    reason: 'No value supplied.', changes: [] };
  const reject = (reason: string, state: 'invalid' | 'uncertain' = 'invalid'): Candidate => {
    candidate.state = state;
    candidate.reason = reason;
    return candidate;
  };
  const accept = (value: Json, transformation: string): Candidate => {
    candidate.state = 'valid';
    candidate.value = value;
    candidate.reason = '';
    candidate.evidence = candidate.evidence.map(item => ({ ...item, transformations: [transformation] }));
    if (JSON.stringify(raw) !== JSON.stringify(value) || field === 'geo') candidate.changes.push(transformation);
    return candidate;
  };
  if (field === 'geo') {
    const lat = record.raw['lat'];
    const lng = record.raw['lng'];
    if (missing(lat) && missing(lng)) return candidate;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return reject('Coordinates are incomplete or out of range. Confirm the pair; no automatic swap or geocoding.');
    }
    return accept({ latitude: lat, longitude: lng }, 'Map source lat/lng to latitude/longitude without changing their values.');
  }
  if (missing(raw)) return candidate;
  if (field === 'rooms') {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    return Number.isSafeInteger(value) && value > 0
      ? accept(value, 'Parse a positive integer room count.') : reject('Room count must be a positive integer.');
  }
  if (field === 'amenities') {
    const parts = typeof raw === 'string' ? raw.split(/[,;]/) : Array.isArray(raw) ? raw : null;
    if (!parts || parts.some(item => typeof item !== 'string')) return reject('Amenities must be text or an array of text.');
    const values = parts.filter((item): item is string => typeof item === 'string')
      .map(item => item.trim()).filter(Boolean).filter(item => !unsafe(item))
      .map(item => labels[item.toLowerCase()] ?? item);
    if (values.length === 0) return reject('No safe, non-empty amenities remain.');
    const unique = new Map<string, string>();
    for (const value of values) if (!unique.has(value.toLowerCase())) unique.set(value.toLowerCase(), value);
    return accept([...unique.values()].sort(), 'Split the list; trim and deduplicate items ignoring case; normalize Wi-Fi/Onsen/Parking spelling; discard unsafe markup; preserve qualifiers.');
  }
  if (typeof raw !== 'string') return reject('Expected a text value.');
  const text = raw.trim();
  if (unsafe(text)) return reject('Unsafe markup or executable-looking content is withheld.');
  if (field === 'name_ja' || field === 'name_en' || field === 'address') {
    return accept(text, 'Trim outer whitespace; preserve source language and spelling.');
  }
  if (field === 'tel') {
    if (!/^\+?[\d\s()-]+$/.test(text)) return reject('Telephone contains unsupported characters.');
    const value = text.replace(/[\s()-]/g, '');
    if (!/^\+?\d{7,15}$/.test(value)) return reject('Telephone has an invalid digit count.');
    return accept(value, 'Remove telephone separators; preserve an explicit + and domestic leading zero; do not infer a country code.');
  }
  if (field === 'checkin' || field === 'checkout') {
    if (/\b(after|before|from|until|about)\b|[~〜-]/i.test(text)) {
      return reject('Qualified or ranged time is not an exact time. Preserve the source statement for Ops; do not replace it with an exact OTA time.', 'uncertain');
    }
    const hour = /^(\d{1,2})時$/.exec(text);
    const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
    const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(text);
    let h: number; let m: number;
    if (text.toLowerCase() === 'noon') { h = 12; m = 0; }
    else if (text.toLowerCase() === 'midnight') { h = 0; m = 0; }
    else if (hour) { h = Number(hour[1]); m = 0; }
    else if (clock) { h = Number(clock[1]); m = Number(clock[2]); }
    else if (ampm && Number(ampm[1]) >= 1 && Number(ampm[1]) <= 12) {
      h = Number(ampm[1]) % 12 + (ampm[3]!.toLowerCase() === 'pm' ? 12 : 0); m = Number(ampm[2] ?? 0);
    } else return reject('Unrecognized time format.');
    if (h > 23 || m > 59) return reject('Time is outside the 24-hour clock.');
    return accept(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'Convert an unqualified clock time to HH:mm.');
  }
  if (field === 'url') {
    if (!/^https?:\/\//i.test(text)) return reject('URL has no explicit HTTP(S) scheme; do not assume HTTP or HTTPS.', 'uncertain');
    try {
      const url = new URL(text);
      if (!url.hostname || url.username || url.password) return reject('URL is not a safe public HTTP(S) URL.');
      return accept(text, 'Trim the URL; retain the explicitly supplied scheme and path.');
    } catch { return reject('Malformed URL.'); }
  }
  if (field === 'status') {
    const value = text.toLowerCase();
    return value === 'open' || value === 'closed'
      ? accept(value, 'Normalize explicit operating status to lowercase.') : reject('Unknown operating status.', 'uncertain');
  }
  if (field === 'updated') {
    const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(text);
    if (!match) return reject('Date order is ambiguous or unsupported; do not guess day/month order.', 'uncertain');
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return reject('Invalid calendar date.');
    return accept(iso, 'Normalize an unambiguous year-first source date to YYYY-MM-DD; use only for source audit, not hotel freshness authority.');
  }
  // Preserve the explicit currency token: the yen sign is not expanded to a guessed ISO currency.
  if (field === 'price_from') {
    const match = /^(from\s+)?(?:(JPY|VND|¥)\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(yen))?\s*([~〜])?(\s+per person)?$/i.exec(text);
    if (!match) return reject('Unsupported price format; confirm currency and pricing basis.', 'uncertain');
    const amount = Number(match[3]!.replaceAll(',', ''));
    if (!Number.isSafeInteger(amount) || amount <= 0) return reject('Zero, negative or invalid price is withheld; it does not establish free accommodation.');
    const currency = match[2] ? (match[2] === '¥' ? '¥' : match[2].toUpperCase()) : match[4] ? 'yen' : null;
    if (!currency) return reject('Price has no explicit currency. Confirm it instead of inferring from location or OTA.', 'uncertain');
    const value = `From ${currency} ${amount}${match[6] ? ' per person' : ''}`;
    return accept(value, 'Normalize price formatting and thousands separators; preserve the explicit currency token, lower bound from price_from and per-person basis; do not assume a nightly room rate.');
  }
  return reject('Unsupported field.');
}

export function normalize(record: SourceRecord): NormalizedRecord {
  const fields = Object.fromEntries(FIELDS.map(field => [field, normalizeField(record, field)])) as Record<Field, Candidate>;
  const notices: Notice[] = [];
  for (const candidate of Object.values(fields)) {
    if (candidate.state === 'valid' && candidate.changes.length) {
      notices.push({ kind: 'fixed', field: candidate.field, message: `${record.source} ${record.id}: ${candidate.changes.join(' ')} Normalized value: ${JSON.stringify(candidate.value)}.`,
        action: null, evidence: candidate.evidence });
    } else if (candidate.state === 'invalid' || candidate.state === 'uncertain') {
      notices.push({ kind: 'dropped', field: candidate.field, message: `${record.source} ${record.id}: ${candidate.reason}`,
        action: 'Confirm the original value with the hotel before restoring this field.', evidence: candidate.evidence });
    }
  }
  const amenities = record.raw['amenities'];
  const parts = typeof amenities === 'string' ? amenities.split(/[,;]/) : Array.isArray(amenities) ? amenities : [];
  if (parts.some(item => typeof item === 'string' && unsafe(item))) {
    notices.push({ kind: 'dropped', field: 'amenities', message: 'Unsafe amenity items were excluded; safe items were retained.',
      action: 'Confirm the intended amenity text in the source.', evidence: evidence(record, 'amenities') });
  }
  const supported = new Set([...FIELDS, 'id', 'hotel_ref', 'source', 'lat', 'lng']);
  for (const field of Object.keys(record.raw).sort()) {
    if (!supported.has(field as Field) && !missing(record.raw[field])) {
      notices.push({ kind: 'dropped', field, message: field === 'notes'
        ? 'Internal contact notes are excluded from public facts and output evidence.'
        : 'Field is not mapped to public Hotel facts; no rating scale or unsupported property is invented.',
      action: null, evidence: field === 'notes' ? [] : evidence(record, field) });
    }
  }
  return { record, fields, notices };
}
