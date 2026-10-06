# AI work log

Snapshot: 2026-10-07, through Part A implementation, input corrections and the Part D draft.

## Tools and division of work

**Codex (GPT-6 in this session)** handled implementation and documentation through sub-agents coordinated in the main chat. One repository context kept corrections reviewable. Shell/Git inspected changes; Node's test runner and TypeScript checked behavior and types.

I chose TypeScript/Node.js and the reviewer template, directed documentation placement and challenged fixed input paths. I developed ideas, checked assumptions and reviewed results while the agent implemented changes. Business decisions remained with me. Official documentation informed technical choices; only supplied JSON files supported hotel facts.

My personal workspace includes Solution Architect, Business Analytics, QC and Developer skills; their [roles and handoff](docs/DESIGN_NOTES.md#personal-workspace-skills) are documented separately.

## Work completed in order

1. Reviewed requirements and outputs; separated operating rules in `AGENTS.md` from discussion in `docs/DESIGN_NOTES.md` and corrected stale references.
2. Created `prompts/review-hotel-profile.md`, linked its invocation and documented a four-line rationale separately.
3. Implemented ingestion, normalization, merging, JSON-LD, per-field provenance, Ops reporting and safe reruns. Default fixtures produce nine profiles: H004 joins H001, H008 is held and H009 excluded. Checked all 133 factual output values against sources.
4. Added configurable inputs after feedback; updated instructions and review guidance. Created this log.
5. Initially pushed code/documentation with `data/` and the assignment README excluded; drafted the week-one executive update in `UPDATE.md`.

## Agent mistakes and corrections

I used a verification skill to compare changes with the agreed scope and review their impact on other components. Unit and regression tests checked both the correction and existing behavior; passing tests do not guarantee every input is covered.

- **Prompt mixed instructions with rationale.** I spotted the mismatch and directed moving the rationale to design notes and invocation guidance to `AGENTS.md`, keeping the reviewer template focused.
- **Missing URL field in the shared type.** Strict type checking caught the missing `url` field before output generation. I reviewed the failure and correction; the agent added the field, and provenance tests check every published factual path.
- **Fixed input filenames.** I identified the configurability gap and kept the correction focused on input selection and source tracing. Tests cover renamed inputs, another working directory and actual paths/hashes; default-output comparisons and existing normalization/merge tests check for regressions.

## Verified state and remaining work

Strict type checking, all 26 tests, the default CLI and help command passed. Coverage includes source tracing, conflicts, qualifiers, custom inputs and byte-stable reruns. Source hashes and default output bytes remained unchanged after the input correction. Business approval and external schema validation remain open. Supplied data, the preserved assignment and generated output remain ignored.
