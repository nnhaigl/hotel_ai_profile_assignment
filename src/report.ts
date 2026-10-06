import type { Evidence, HotelResult, NormalizedRecord, Notice } from './model.ts';

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('*', '\\*').replaceAll('_', '\\_')
    .replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function citations(items: Evidence[]): string {
  return [...new Map(items.map(item => [`${item.file}#${item.source_pointer}`, item])).values()]
    .map(item => `${escape(item.source)} ${escape(item.record_id)} — ${escape(item.file)}#${escape(item.source_pointer)} = ${escape(JSON.stringify(item.raw_value))}`).join('; ');
}

function section(title: string, notices: Notice[]): string[] {
  const lines = [`### ${title}`, ''];
  if (!notices.length) return [...lines, 'None.', ''];
  for (const item of notices) {
    lines.push(`- **${escape(item.field)}:** ${escape(item.message)}`);
    if (item.evidence.length) lines.push(`  - Source: ${citations(item.evidence)}`);
    if (item.action) lines.push(`  - **Ops action:** ${escape(item.action)}`);
  }
  return [...lines, ''];
}

export function renderReport(hotels: HotelResult[], orphanOta: NormalizedRecord[]): string {
  const generated = hotels.filter(item => item.disposition === 'generated').length;
  const lines = ['# Hotel data review report', '',
    `Processed ${hotels.reduce((sum, item) => sum + item.aliases.length, 0)} official records into ${hotels.length} property groups. Generated ${generated} Hotel profiles; ${hotels.length - generated} groups are held or excluded.`, '',
    'Generated files are review candidates. Generation is not human approval or external publication. Work through the Ops actions before publishing.', '',
    'Implementation defaults: retain valid official values; fill only genuinely missing fields from agreeing OTA evidence; withhold uncertain official fields and disagreements among official duplicates. Preserve qualifiers. Do not infer currency, country codes, ambiguous dates, URL schemes or coordinate swaps.', '',
    'Duplicate identity and eligibility are business choices: the conservative defaults and remaining decisions are documented in docs/PART_A.md.', '',
    '## Property summary', '', '| Source IDs | Output | State | Human review |', '| --- | --- | --- | --- |'];
  for (const hotel of hotels) {
    lines.push(`| ${hotel.aliases.join(', ')} | ${hotel.disposition === 'generated' ? `${hotel.id}.jsonld` : 'No public profile'} | ${hotel.disposition} | ${hotel.notices.some(item => item.action !== null) ? 'Required' : 'No flagged actions'} |`);
  }
  lines.push('');
  for (const hotel of hotels) {
    for (const sourceId of hotel.aliases) {
      lines.push(`## ${sourceId}${sourceId !== hotel.id ? ` — grouped with ${hotel.id}` : ''}`, '',
        `**State:** ${hotel.disposition}. ${escape(hotel.reason)}`, '',
        `**Source group:** ${hotel.aliases.join(', ')}. ${hotel.disposition === 'generated' ? `Output: ${hotel.id}.jsonld and ${hotel.id}.provenance.json.` : 'No public Hotel file is generated.'}`, '');
      if (sourceId !== hotel.id) {
        const local = hotel.notices.filter(item => item.evidence.some(citation => citation.source === 'official' && citation.record_id === sourceId));
        lines.push(...section('Fixed or normalized in this record', local.filter(item => item.kind === 'fixed')),
          ...section('Dropped or excluded in this record', local.filter(item => item.kind === 'dropped')),
          `Shared merge decisions, conflicting evidence and Ops actions are listed under [${hotel.id}](#${hotel.id.toLowerCase()}). No separate Hotel file is generated for ${sourceId}.`, '');
        continue;
      }
      const notices = hotel.notices;
      lines.push(...section('Fixed or normalized', notices.filter(item => item.kind === 'fixed')),
        ...section('Merged from OTA or corroborated', notices.filter(item => item.kind === 'merged' || item.kind === 'agreement')),
        ...section('Conflicts — human review required', notices.filter(item => item.kind === 'conflict')),
        ...section('Dropped or excluded and why', notices.filter(item => item.kind === 'dropped')),
        ...section('Other decisions for human review', notices.filter(item => item.kind === 'review')));
      const sourceDates = [...hotel.official, ...hotel.ota].filter(item => item.fields.updated.state === 'valid');
      if (sourceDates.length) {
        lines.push('### Source update dates (audit only)', '');
        for (const record of sourceDates) lines.push(`- ${record.record.source} ${record.record.id}: ${String(record.fields.updated.value)}. Source: ${citations(record.fields.updated.evidence)}.`);
        lines.push('');
      }
    }
  }
  lines.push('## Unmatched OTA records', '');
  if (!orphanOta.length) lines.push('None.');
  else for (const record of orphanOta) lines.push(`- ${escape(record.record.source)} ${record.record.id} at ${escape(record.record.file)}#/${record.record.index}: no matching official ID; withheld. **Ops action:** confirm the hotel reference.`);
  return `${lines.join('\n')}\n`;
}
