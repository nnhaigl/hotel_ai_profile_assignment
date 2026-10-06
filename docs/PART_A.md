# Part A: offline Hotel profile tool

## Run and verify

Use Node.js 24.12.0 or newer; this checkout was run with Node.js 24.12.0 and npm 11.6.2. The version in `.nvmrc` is the tested runtime.

The Git repository intentionally excludes the supplied `data/` folder, the original assignment `README.md` and generated `out/`. After cloning, restore the assignment files locally. Fixture-based tests require the original two JSON files at their default `data/` paths; the CLI can instead receive the supplied inputs from another location using the flags below. These files remain ignored by Git.

From the repository root:

```sh
npm start
```

This one command reads both supplied JSON files and regenerates `out/`. Runtime and tests use Node's built-in TypeScript support and standard library, with no runtime dependencies or network calls. No `node_modules` installation is needed to run the tool or tests. The JSON-LD context is written as a string; the tool does not fetch it.

Input paths are configurable:

```sh
npm start -- --official "./inputs/official feed.json" --ota "./inputs/ota feed.json"
npm start -- --help
```

`--official` and `--ota` accept absolute paths or paths relative to the shell's current working directory. Each omitted flag independently defaults to the corresponding fixture (`data/hotels_raw.json` or `data/hotels_ota.json`) relative to the repository. The two inputs must be distinct files outside the repository's `out/` directory; symlink aliases into `out/` are also rejected. Output remains in the repository's `out/` directory. Missing/unreadable files or invalid arguments fail before any output is changed.

Custom filenames do not change the expected record structure: JSON arrays with official `id` values, OTA `hotel_ref` values and OTA `source` labels (`ota_a` or `ota_b`). Identifiers use the existing `H` followed by at least three digits format. Hotel counts and facts come from the selected input records.

`--official` selects the official feed (default `data/hotels_raw.json`); `--ota` selects the OTA feed (default `data/hotels_ota.json`). Reversing these flags makes the expected ID field absent. Identifier errors name the expected field and input role, with a swapped-file hint when the other role's field is present. The tool does not automatically swap sources or reinterpret their authority.

For developer verification:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
```

The lockfile pins TypeScript and Node type definitions as development dependencies. Initial installation can use npm's registry; once cached, `npm ci --offline --ignore-scripts --no-audit --no-fund` works. `npm test` itself requires no third-party packages. Type stripping executes the code without type checking, so the separate strict type-check command remains required. There is no compilation/build step in this implementation.

## Pipeline and responsibilities

`src/cli.ts` parses `--official`, `--ota` and `--help`/`-h` using Node's argument parser, then runs `src/pipeline.ts` with the repository root derived from the entry file. Unknown options and missing option values are rejected. Programmatic callers can pass `runPipeline(root, { official, ota })`; relative paths in that API are resolved against `root`.

- `ingest.ts`: validate array/record structure, safe unique official IDs and known OTA source labels; compute SHA-256 hashes of the actual input bytes.
- `normalize.ts`: normalize candidates while retaining original file, source, record ID, JSON Pointer, raw value and transformation descriptions. Keep missing, invalid, uncertain and valid states distinct.
- `merge.ts`: identify duplicate groups, resolve fields and retain review notices. Match OTA records by `hotel_ref`, including duplicate aliases.
- `export.ts`: map selected candidates to Schema.org Hotel values and ensure every factual leaf has matching provenance before writing.
- `report.ts`: explain fixes, source merges, conflicts, omissions and actions for Ops, including withheld properties and duplicate aliases.
- `write.ts`: preflight output ownership, write individual files atomically and clean only unchanged, previously owned artifacts.

## Implementation defaults and business decisions

The user requested implementation of Part A. The defaults below were selected for this reviewable implementation; the individual business choices were not separately approved by the user or Ops. Unresolved choices are explicit in `out/report.md` and `out/review.json`. Generating files does not publish them or establish human approval.

| Topic | Current behavior | Remaining human decision |
| --- | --- | --- |
| Official versus OTA | Keep valid official values and report disagreements with both sources. | Confirm contradictory facts before publication. |
| Gap filling | Fill only genuinely missing official fields from valid, agreeing OTA values. Invalid or uncertain official evidence blocks automatic substitution. | Approve replacing an invalid/uncertain official value after checking its meaning. |
| Official duplicates | Group records only when trimmed name, address and explicit URL identity match. English name is used for identity when available; otherwise the supplied Japanese-name field is used. URL identity ignores a trailing slash only for grouping. Use the lowest source ID as a stable filename. Combine agreeing official evidence; withhold differing or uncertain fields. | Confirm duplicate identity. H001/H004 are candidates, not an approved identity mapping. Dates and input order do not choose a factual winner. |
| Operating status | Hold the entire property if explicitly closed or if operating status is conflicting/uncertain. Missing status does not create an `open` claim. | Resolve H008's official `closed` versus OTA `open`. |
| Minimum eligibility | Require a usable sourced name and address. Partial profiles can omit uncertain optional fields. No usable name means exclusion; no usable address means hold. | Agree the final business minimum for publication. H009 needs identity confirmation. |
| Amenities | Deduplicate spelling/case, keep meaningful qualifiers and retain the official list. OTA-only additions or wording differences are reported. Only Wi-Fi/Onsen/Parking spelling variants are canonicalized; “Hot spring” and “Kaiseki” are not silently equated with fuller official descriptions. | Confirm equivalent wording, extra amenities and paid/free conditions. |
| Prices | Parse supported positive integer amounts with explicit `JPY`, `VND`, `yen` or `¥` tokens. Preserve the token as text: `¥` is not expanded to an assumed ISO currency. `price_from` denotes a lower bound; preserve `per person`. Do not assume a room/night basis. Missing currency, zero price and unsupported formats are withheld. | Confirm currency and rate basis. H006's official zero and H012's unspecified currency are not automatically replaced by OTA prices. |
| Times | Normalize exact clocks, Japanese hour notation, am/pm, noon and midnight. Withhold qualifiers/ranges such as `after 3pm`, even if OTA gives an exact clock. | Confirm whether an exact published check-in time is justified for H003. |
| Coordinates and URLs | Require a complete numeric coordinate pair in range and an explicitly supplied HTTP(S) URL. Keep paths/schemes as supplied. No swapping, geocoding, HTTPS upgrades or invented schemes. | Confirm H003's suspect pair and scheme; H001/H004's URL variants remain withheld until resolved. |
| Source dates | Normalize valid year-first dates; withhold ambiguous or impossible dates. Retain dates only in source audit/provenance and report, not as a Hotel-level `dateModified` or freshness priority. | Confirm H002's date ordering and H007's invalid date. |
| Internal/unsafe content | Exclude contact notes, unrecognized fields and unsafe amenity fragments from Hotel facts. Contact-note raw values are also excluded from output evidence. Escape untrusted text in Markdown and JSON serialization; never execute it. | Correct unsafe amenity text in the source if needed. |

## Output contract

For the supplied fixtures, the tool generates nine Hotel/provenance pairs. H004 is grouped with H001; H008 is held and H009 is excluded. Every one of the twelve official IDs has a report entry.

```text
out/
  H001.jsonld
  H001.provenance.json
  ...
  report.md
  review.json
  .hotel-profile-manifest.json
```

### Hotel JSON-LD

| Input | Output | Notes |
| --- | --- | --- |
| `name_ja`, `name_en` | `name`, `alternateName` | Prefer the usable supplied `name_ja` field as primary, otherwise `name_en`. Do not infer language from field labels or translate. Omit identical alternate names and cite both agreeing name fields. |
| `address` | `address` | Preserve the source's full address as text; do not invent structured address components. |
| `tel` | `telephone` | Strip formatting separators; preserve an explicit `+` or domestic leading zero. |
| `checkin`, `checkout` | `checkinTime`, `checkoutTime` | Publish only exact, supported `HH:mm` values. |
| `rooms` | `numberOfRooms` | Positive integer. |
| `price_from` | `priceRange` | Text preserving the lower bound, explicit currency token and any per-person basis. No inferred Offer/nightly rate. |
| `lat`, `lng` | `geo.latitude`, `geo.longitude` | Numeric pair; per-coordinate source tracing. |
| `amenities` | `amenityFeature[]` | `LocationFeatureSpecification` entries; trace each name and presence Boolean separately. Presence does not establish that an amenity is free. |
| `url` | `url` | Preserve an explicit valid HTTP(S) URL. |
| `updated`, `status`, extra fields | Audit/eligibility/report only | Do not attach unsupported Schema.org Hotel properties. |

`@context` and `@type` are structural Schema.org constants. All other scalar Hotel values, including nested array elements and Booleans, require provenance. No generated Hotel `@id` or factual description is introduced.

### Provenance

Each `Hxxx.provenance.json` contains:

- Format version, canonical source ID and duplicate source IDs as audit identifiers.
- SHA-256 hashes of both input file snapshots.
- A `fields` map keyed by output JSON Pointer, for example `/numberOfRooms` or `/amenityFeature/0/name`.
- For every value, its exact output value and evidence entries containing `file`, `source`, `record_id`, `source_field`, `source_pointer`, `raw_value` and `transformations`.
- Per-source update-date candidates, including invalid/uncertain states and original evidence.
- A derived `needs_human_review` indicator, which is workflow metadata rather than human approval.

For OTA records, `record_id` is the supplied `hotel_ref`; `source` and the input-array JSON Pointer identify the precise listing. Dissenting evidence and withheld-property decisions are retained in `review.json` and `report.md`, not mislabeled as evidence for the selected published value.

Evidence `file` paths and `input_sha256` keys identify the resolved source files relative to the resolved repository root, with `/` separators. Symlink aliases are resolved to their targets; this also handles macOS `/var` versus `/private/var` aliases consistently. Files outside the repository use relative paths containing `..`; default fixture names are not substituted for custom filenames. Read these citations against the explicitly selected source files.

`review.json` provides all group dispositions and notices with source evidence, plus unmatched OTA references. The Markdown report presents the same actions for Ops. An unmatched OTA listing is withheld rather than creating a new hotel from its name.

### Ownership and reruns

The hidden manifest records hashes of generator-owned files. Identical input bytes and repository-relative input paths yield byte-identical final artifacts, including the manifest; wall-clock times, random IDs and absolute machine paths do not enter output. Changing input paths changes the source citations even when the bytes agree. Individual artifacts are written atomically, not as a transaction covering the entire directory.

Before writing, the tool checks the manifest, target collisions and current file hashes. It refuses symlink/linked targets, unsafe manifest paths, user-edited generated files and unowned target collisions. Unrelated output files remain intact. Stale files are removed only if their manifest ownership and unchanged content are verified. If a generated file was edited, preserve/move that file before rerunning; do not remove ownership checks to force an overwrite.

## Verification and limits

Automated tests cover exact source citations for every factual output leaf, critical normalization and qualifier handling, visible conflicts, OTA gap filling, duplicate identity, operating-status exclusion, malformed input, unsafe content, byte-stable reruns and safe ownership/cleanup. Clean-copy CLI tests run without `node_modules`, including renamed inputs, a different working directory, paths with spaces, new hotel records and absence of the default fixtures. Custom-input tests verify actual source paths, hashes and JSON Pointers, partial overrides, argument errors and input/output separation.

On 2026-10-07, `npm ci --offline --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, all 26 automated tests and `npm start` passed with the tested runtime. Tests verified byte-stable reruns, source pointers and clean-copy CLI execution without development dependencies, including configurable inputs.

The implementation agent applied `prompts/review-hotel-profile.md` to both source files, all nine Hotel/provenance pairs, all 133 factual output values and the Ops report. Source-grounding result: `PASS`, with the human decisions listed in the report still open. No unsupported factual values were found in that scope. This was not an independently delegated review or Ops publication approval; no external website or schema-validator execution was performed.

Known scope limits: fixture-focused integer-price parsing, no general international telephone validator, no live website checks, no external JSON-LD processor/schema-validator execution, and no human-approved business policies. Future formats are withheld with explanations rather than guessed. Part C is recorded in [AI_LOG.md](../AI_LOG.md). The Part D week-one executive handoff is in [UPDATE.md](../UPDATE.md).

One actual implementation correction worth retaining for Part C: the first strict type-check caught `url` missing from the shared field union before any output was generated. The field was added, and coverage tests now check the generated factual paths and source evidence.

## Technical references

- [Node.js TypeScript support](https://nodejs.org/api/typescript.html): native type stripping, explicit `.ts` imports and separate type checking.
- [Schema.org Hotel](https://schema.org/Hotel), [priceRange](https://schema.org/priceRange) and [amenityFeature](https://schema.org/amenityFeature): the selected vocabulary and expected value types. These are implementation references, not additional hotel evidence.
