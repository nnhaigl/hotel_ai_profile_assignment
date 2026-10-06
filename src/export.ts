import type { Candidate, Evidence, ExportedHotel, HotelResult, Json, Provenance } from './model.ts';

export function exportHotel(hotel: HotelResult, hashes: Record<string, string>): ExportedHotel | null {
  if (hotel.disposition !== 'generated') return null;
  const profile: Record<string, Json> = { '@context': 'https://schema.org', '@type': 'Hotel' };
  const provenance: Provenance = { version: 1, hotel_id: hotel.id, source_record_ids: hotel.aliases,
    input_sha256: hashes, fields: {},
    source_updates: [...hotel.official, ...hotel.ota].map(item => item.fields.updated).filter(item => item.state !== 'missing'),
    needs_human_review: hotel.notices.some(item => item.action !== null) };
  const trace = (path: string, value: Json, candidates: Candidate[], transform?: string, sourceField?: string): void => {
    const citations = candidates.flatMap(item => item.evidence)
      .filter(item => sourceField === undefined || item.source_field === sourceField)
      .map((item): Evidence => ({ ...item, transformations: transform ? [...item.transformations, transform] : item.transformations }));
    if (!citations.length) throw new Error(`${hotel.id}${path}: cannot export an unsupported value`);
    // Repeated agreement evidence must not make the audit file noisy or ambiguous.
    const unique = [...new Map(citations.map(item => [JSON.stringify(item), item])).values()];
    provenance.fields[path] = { value, evidence: unique };
  };
  const add = (name: string, candidate: Candidate | undefined): void => {
    if (candidate) { profile[name] = candidate.value; trace(`/${name}`, candidate.value, [candidate]); }
  };
  const ja = hotel.fields.name_ja;
  const en = hotel.fields.name_en;
  const name = ja ?? en;
  if (!name) throw new Error(`${hotel.id}: generated profile has no name`);
  profile['name'] = name.value;
  trace('/name', name.value, ja && en && ja.value === en.value ? [ja, en] : [name]);
  if (ja && en && ja.value !== en.value) add('alternateName', en);
  add('address', hotel.fields.address);
  add('telephone', hotel.fields.tel);
  add('checkinTime', hotel.fields.checkin);
  add('checkoutTime', hotel.fields.checkout);
  add('numberOfRooms', hotel.fields.rooms);
  add('priceRange', hotel.fields.price_from);
  add('url', hotel.fields.url);
  const geo = hotel.fields.geo;
  if (geo && geo.value !== null && typeof geo.value === 'object' && !Array.isArray(geo.value)) {
    profile['geo'] = { '@type': 'GeoCoordinates', ...geo.value };
    trace('/geo/latitude', geo.value['latitude']!, [geo], undefined, 'lat');
    trace('/geo/longitude', geo.value['longitude']!, [geo], undefined, 'lng');
  }
  const amenities = hotel.fields.amenities;
  if (amenities && Array.isArray(amenities.value)) {
    profile['amenityFeature'] = amenities.value.map((value, index) => {
      trace(`/amenityFeature/${index}/name`, value, [amenities], 'Select this normalized amenity item from the source list.');
      trace(`/amenityFeature/${index}/value`, true, [amenities], 'An explicitly listed amenity establishes its presence, not whether it is free.');
      return { '@type': 'LocationFeatureSpecification', name: value, value: true };
    });
  }
  return { id: hotel.id, profile, provenance };
}

export function factualLeaves(value: Json, path = ''): Record<string, Json> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map((item, index) => factualLeaves(item, `${path}/${index}`)));
  if (value !== null && typeof value === 'object') {
    return Object.assign({}, ...Object.entries(value).filter(([key]) => key !== '@context' && key !== '@type')
      .map(([key, item]) => factualLeaves(item, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)));
  }
  return { [path]: value };
}

export function validateExport(hotel: ExportedHotel): void {
  const leaves = factualLeaves(hotel.profile);
  if (JSON.stringify(Object.keys(leaves).sort()) !== JSON.stringify(Object.keys(hotel.provenance.fields).sort())) {
    throw new Error(`${hotel.id}: published facts and provenance paths do not match`);
  }
  for (const [path, value] of Object.entries(leaves)) {
    const entry = hotel.provenance.fields[path]!;
    if (JSON.stringify(value) !== JSON.stringify(entry.value) || !entry.evidence.length) {
      throw new Error(`${hotel.id}${path}: invalid provenance coverage`);
    }
  }
}
