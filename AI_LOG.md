# AI work log

Snapshot: 2026-10-07, through Part A implementation and configurable-input correction.

## Tools and division of work

**Codex (GPT-6 in this session)** interpreted requirements, maintained instructions, implemented the CLI and checked outputs. One repository context kept corrections reviewable. Shell/Git inspected changes; Node's test runner and TypeScript checked behavior and types. Official documentation informed technical choices; only supplied JSON files supported hotel facts.

The user chose TypeScript/Node.js and the reviewer template, directed documentation placement and challenged fixed input paths. Business decisions remained with the user.

**Work split described by the user:** “I used sub-agents for implementation and documentation updates while I continued developing ideas and checking assumptions and results in the main chat. The main agent worked with me to coordinate tasks and review progress.”

## Work completed in order

1. Reviewed requirements and outputs; separated operating rules in `AGENTS.md` from discussion in `docs/DESIGN_NOTES.md` and corrected stale references.
2. Created `prompts/review-hotel-profile.md`, linked its invocation and documented a four-line rationale separately.
3. Implemented ingestion, normalization, merging, JSON-LD, per-field provenance, Ops reporting and safe reruns. Default fixtures produce nine profiles: H004 joins H001, H008 is held and H009 excluded. Checked all 133 factual output values against sources.
4. Added configurable inputs after feedback; updated instructions and review guidance. Created this log; `UPDATE.md` remains outstanding.

## Agent mistakes and corrections

- **Prompt mixed review instructions with rationale.** The user requested separation. Moved rationale to the design notes and invocation guidance to `AGENTS.md`; the template now contains review instructions only.
- **Missing URL field in the shared type.** Strict type checking caught missing `url` before output generation. Added it and kept checks covering every published factual path and its evidence.
- **Fixed input filenames.** The user identified two required paths. Added `--official`/`--ota` and a configurability rule in `AGENTS.md`. Regression tests use renamed files, another working directory and new records without default fixtures, and check actual provenance paths and hashes.

## Verified state and remaining work

Strict type checking, all 26 tests, the default CLI and help command passed. Coverage includes source tracing, conflicts, qualifiers, custom inputs and byte-stable reruns. Source hashes and default output bytes remained unchanged after the input correction. Business approval and external schema validation remain open. The user authorized a code/documentation push on 2026-10-07, excluding `data/` and `README.md`; generated `out/` stays ignored.
