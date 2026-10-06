import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_INPUT_FILES } from './ingest.ts';
import { runPipeline } from './pipeline.ts';

try {
  const { values } = parseArgs({ options: {
    official: { type: 'string' }, ota: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log(`Usage: npm start -- [--official <file>] [--ota <file>]\n\n`
      + `Defaults: ${DEFAULT_INPUT_FILES.official} and ${DEFAULT_INPUT_FILES.ota}.\n`
      + 'Explicit paths are absolute or relative to your current working directory.\n'
      + 'Output is written to the repository out/ directory. Input files must be outside out/.');
  } else {
    const result = await runPipeline(fileURLToPath(new URL('../', import.meta.url)), {
      ...(values.official !== undefined ? { official: resolve(values.official) } : {}),
      ...(values.ota !== undefined ? { ota: resolve(values.ota) } : {}),
    });
    const held = result.hotels.filter(item => item.disposition === 'held').length;
    const excluded = result.hotels.filter(item => item.disposition === 'excluded').length;
    console.log(`Generated ${result.exported.length} Hotel profiles; ${held} held, ${excluded} excluded. Review out/report.md before publishing.`);
  }
} catch (error) {
  console.error(`hotel-profile: ${error instanceof Error ? error.message : 'Unexpected error'}\nUse --help for usage.`);
  process.exitCode = 1;
}
