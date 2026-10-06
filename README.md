# Hotel AI Profile

An offline TypeScript/Node.js CLI that turns hotel records from official websites and OTA listings into source-backed Schema.org Hotel JSON-LD.

The tool ingests two JSON files, normalizes supported formats, merges evidence per property and generates profiles, per-field provenance and an Ops review report. Every published factual value must trace back to an input record and field. Conflicting or uncertain evidence is retained for review instead of being silently replaced or guessed.

## Requirements

- Node.js **24.12.0 or newer**; `.nvmrc` records the tested version.
- npm; the project was verified with npm **11.6.2**.
- The supplied official and OTA JSON files.

Runtime and tests use Node's standard library with no external dependencies or network calls. No install or build step is needed to run the CLI. Development dependencies are needed only for strict TypeScript checking.

## Quick start

From the repository root, place the supplied files at:

```text
data/
  hotels_raw.json
  hotels_ota.json
```

Then run:

```sh
npm start
```

The supplied fixtures produce:

```text
Generated 9 Hotel profiles; 1 held, 1 excluded. Review out/report.md before publishing.
```

H004 is grouped with H001, H008 is held for operating-status confirmation and H009 is excluded because it has no usable name. Generated profiles are candidates for review; they are not human-approved publications.

The supplied `data/` files are excluded from Git. Restore them after cloning before running the default command or tests. The previous assignment README is preserved locally as `ASSIGNMENT.md`, also excluded from Git. This project README is versioned with the code and documentation.

## Select input files

```sh
npm start -- --official "./inputs/official feed.json" --ota "./inputs/ota feed.json"
npm start -- --help
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--official <file>` | Official hotel records | `data/hotels_raw.json` |
| `--ota <file>` | OTA listing records | `data/hotels_ota.json` |
| `--help`, `-h` | Show usage without generating output | — |

Explicit paths can be absolute or relative to the current working directory. Omitted options use the corresponding fixture relative to the repository. Output always goes to the repository's `out/` directory. The two inputs must be distinct files outside `out/`.

Inputs must be JSON arrays with the expected record structure: official records use `id`; OTA records use `hotel_ref` and a `source` of `ota_a` or `ota_b`. Identifiers follow `H` plus at least three digits, such as `H001`. Custom filenames do not change source roles. See [Part A notes](docs/PART_A.md#run-and-verify) for validation and path behavior.

## Generated output

```text
out/
  H001.jsonld
  H001.provenance.json
  ...
  report.md
  review.json
  .hotel-profile-manifest.json
```

| Artifact | Contents |
| --- | --- |
| `Hxxx.jsonld` | One Schema.org Hotel profile per eligible property, including supported names, address, telephone, times, rooms, price, coordinates, amenities and URL. Unsupported or uncertain optional fields are omitted. |
| `Hxxx.provenance.json` | Evidence for every factual output value: actual source filename, source label, record ID, JSON Pointer, raw value, transformations and input SHA-256 hashes. |
| `report.md` | Per-hotel fixes, merges, conflicts, omissions, exclusions and human-review actions for Ops. |
| `review.json` | Machine-readable property dispositions, notices, dissenting evidence and unmatched OTA references. |
| `.hotel-profile-manifest.json` | Hashes identifying generator-owned artifacts for safe reruns and cleanup. |

Identical input bytes and source paths produce byte-identical artifacts. Reruns preserve unrelated files and remove only unchanged, previously owned artifacts that are no longer needed. Edited generated files or unowned target collisions stop generation during preflight. Writes are atomic per file; the whole output directory is not a single transaction.

## Merge and publication rules

- Retain valid official values when OTA evidence disagrees, and show both sides in the review report.
- Fill genuinely missing official fields only from agreeing, valid OTA evidence. Invalid or uncertain official evidence blocks automatic substitution under the current policy.
- Combine agreeing duplicate evidence; withhold conflicting fields. Confirm duplicate identity with Ops.
- Preserve meaningful price and amenity qualifiers. Withhold qualified times, unspecified currencies, invalid coordinates and URLs without an explicit HTTP(S) scheme.
- Require a usable sourced name and address. Hold explicitly closed properties and uncertain or conflicting operating status.
- Keep internal contact notes out of public facts and output evidence; exclude unsafe content.

These are implementation defaults, not approved business policies. Review [the policy table](docs/PART_A.md#implementation-defaults-and-business-decisions) and [design decisions](docs/DESIGN_NOTES.md) before changing them. Known input edge cases are listed below.

## Tests and type checking

Run all **26 automated tests**:

```sh
npm test
```

Tests use Node's test runner and need both original fixtures at their default `data/` paths, including when selecting a test subset. They create temporary directories for CLI and output-ownership checks.

| Test group | Count | Representative cases and expected behavior |
| --- | ---: | --- |
| Record coverage, merging and review decisions | 5 | Account for every official ID; handle duplicates, closed and nameless records; trace OTA gap fills; expose conflicts; withhold conflicting OTA fills and unmatched references. |
| Normalization and qualifiers | 6 | Normalize supported clocks and phone separators; retain explicit currency and `per person`; withhold uncertain prices/times/coordinates/URLs; reject ambiguous or impossible dates; keep simple paid/free amenity distinctions. |
| Provenance and export validation | 2 | Resolve every factual leaf to exact source pointers and raw values; verify input hashes; reject missing, empty or mismatched provenance. |
| Unsafe amenity content | 1 | Exclude the supplied unsafe amenity fragment from public facts while preserving escaped audit evidence. |
| Ingestion validation | 1 | Reject malformed arrays/records, unsafe or duplicate official IDs, unknown OTA labels and swapped source roles. |
| Deterministic reruns and output ownership | 6 | Preserve identical output bytes and unrelated files; clean only owned stale files; refuse edited files, collisions, symlinks and manifest path traversal. |
| CLI and configurable inputs | 5 | Run without `node_modules`; support renamed inputs, paths with spaces and another working directory; retain actual citations/hashes; reject invalid arguments, missing inputs, shared files and inputs inside `out/`. |
| **Total** | **26** | Full assertions are in [tests/profile.test.ts](tests/profile.test.ts). |

To run OTA-related tests only:

```sh
node --test --test-name-pattern="OTA" tests/profile.test.ts
```

Install locked development tools and check strict types:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
```

Add `--offline` to `npm ci` when the required packages are already cached. Native TypeScript execution strips types; the separate type-check command validates them.

## Review with an AI coding agent

Generate the output first, then use [the reusable Hotel provenance reviewer](prompts/review-hotel-profile.md) with an agent that can read this repository:

```text
Read AGENTS.md, then follow prompts/review-hotel-profile.md to review
the generated Hotel JSON-LD, provenance and out/report.md against
data/hotels_raw.json and data/hotels_ota.json.
Return findings without changing files.
```

For custom inputs, name the two files actually used to generate the output. Restore `ASSIGNMENT.md` locally if it is missing; the reviewer requires the assignment, source files and generated artifacts. It returns `PASS`, `FAIL` or `INCOMPLETE` with evidence-backed findings and remaining human decisions. It does not generate output or run tests. A grounding `PASS` does not establish human approval to publish.

## Project layout

```text
src/
  cli.ts          CLI options and errors
  ingest.ts       Input validation and hashes
  normalize.ts    Supported transformations and source evidence
  merge.ts        Duplicate groups, field selection and review decisions
  export.ts       Hotel JSON-LD and per-field provenance
  report.ts       Ops report
  write.ts        Output ownership and safe cleanup
  pipeline.ts     Pipeline orchestration
  model.ts        Shared strict TypeScript types
tests/            Automated behavior and CLI tests
prompts/          Reusable review instructions
docs/             Implementation notes and design decisions
data/             Supplied fixtures; local and ignored
out/              Generated artifacts; ignored
```

## Known limits

- Normalization supports the exercise's formats, including positive integer prices with explicit currency tokens. Telephone handling checks formatting and digit counts, not general international validity.
- Custom amenity strings with commas inside parentheses or unsafe blocks can be split incorrectly. Empty arrays in scalar fields can be treated as missing and allow an OTA fill. These are known parser/validation defects identified during review and are not yet fixed or covered by regression tests.
- No live website verification, external data enrichment or external JSON-LD/schema-validator execution is included.
- Duplicate identity, minimum eligibility and source-replacement policy still require business approval before publication.

See [Part A verification and limits](docs/PART_A.md#verification-and-limits) for details.

## Documentation

- [AGENTS.md](AGENTS.md): operating rules for contributors and AI agents.
- [Part A notes](docs/PART_A.md): output contract, policies, provenance, ownership and limits.
- [Design notes](docs/DESIGN_NOTES.md): confirmed decisions, proposals and the reviewer rationale.
- [AI work log](AI_LOG.md): tools, collaboration, agent mistakes and corrections.
- [Executive update](UPDATE.md): delivery, risks and decisions for the Chief AI Officer.
- `ASSIGNMENT.md`: previous assignment README; local and excluded from Git, so it is not included in a clone.
