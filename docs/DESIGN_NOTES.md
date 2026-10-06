# Design notes and brainstorming

This document records confirmed choices, proposals and open questions. It is not an additional agent instruction file. Follow root `AGENTS.md` for working rules and use these notes when discussing design.

## Evidence and document ownership

- README.md is the project guide for setup, CLI usage, outputs and tests.
- ASSIGNMENT.md preserves the previous assignment README locally and remains ignored by Git.
- The supplied files in `data/` are the only evidence for hotel facts.
- AGENTS.md contains durable working instructions.
- This document records design discussion and decision status.
- AI_LOG.md records actual AI use, mistakes and corrections; UPDATE.md provides the executive status update.

## Confirmed user decisions

| Topic | Decision |
| --- | --- |
| Resource language | English for authored files; preserve original factual evidence in its original language. |
| Stack | TypeScript with Node.js only. This narrows the original assignment's language options. |
| Project README | On 2026-10-07 the user requested a normal project README covering purpose, startup and test cases, then requested committing and pushing the changes. The project README is now tracked; the previous assignment README is preserved in local, ignored `ASSIGNMENT.md`. |
| Reusable agent asset | "Hotel provenance reviewer" prompt template in `prompts/review-hotel-profile.md`, selected by the user on 2026-10-07 for Part B.2. |
| Planning | Establish a shared source of truth and discuss design before further implementation. |
| First brainstorming topic | AI use and organization of the working process. |
| Repository name | hotel_ai_profile_assignment. |
| Repository visibility | Public, as explicitly requested by the user. The assignment itself accepts a private repo or ZIP. |
| Upload | User authorized committing and pushing code/documentation on 2026-10-07. The subsequent request to push the project README supersedes its earlier exclusion when it contained the assignment. Keep root `data/` and the preserved `ASSIGNMENT.md` local and ignored; generated `out/` remains ignored. This supersedes the earlier empty-repository-only request. |

An earlier GitHub repository-creation attempt was rejected and pushed no content. The current checkout has an `origin` remote configured; the subsequent user instruction authorizes a normal push within the exclusions above. This is delivery history, not a coding convention.

## Current implementation status

Part A is implemented in TypeScript/Node.js, as requested by the user on 2026-10-07. `npm start` generates nine source-backed Hotel/provenance pairs, the Ops report and a machine-readable review file from the supplied fixtures. H001/H004 form one reviewable duplicate group; H008 is held and H009 excluded. Input paths are configurable through `--official` and `--ota`, following the user's correction that the tool should not require fixed filenames; the supplied fixtures remain the defaults. Implementation defaults, output contracts and remaining business decisions are documented in [PART_A.md](PART_A.md). The reusable review template is present. [AI_LOG.md](../AI_LOG.md) records collaboration, actual mistakes and verified progress through this stage; [UPDATE.md](../UPDATE.md) contains the Part D week-one executive handoff. Historical Python checks do not establish any verification of this implementation.

## Reusable agent asset (Part B.2)

Asset: [Hotel provenance reviewer](../prompts/review-hotel-profile.md). Invocation instructions are in root `AGENTS.md`; the prompt itself contains only review instructions.

Part B.2 of the local `ASSIGNMENT.md` requires a reusable agent asset and a 3-5-line explanation of the choice, but does not prescribe a file for that explanation. The rationale is kept here with the other design decisions.

### Why I chose it

- I chose a provenance review template because unsupported hotel facts are the project's main risk.
- It checks each published value against its original source and checks that conflicts reach human review.
- Its plain Markdown instructions can be reused across AI tools with a consistent, actionable findings format.
- Keeping it in the repository allows its checks to evolve alongside the data pipeline and publication policy.

## Personal workspace skills

I have configured Solution Architect, Business Analytics, QC and Developer skills in my personal workspace. They give agents reusable guidance for different responsibilities, while I retain ownership of scope, business decisions and review of the results. I select the relevant skills for the task.

| Skill | Responsibility | Review focus |
| --- | --- | --- |
| Solution Architect | Evaluate technical options, component boundaries, dependencies and change impact. | Identify affected components and contracts that must remain stable; explain tradeoffs before implementation. |
| Business Analytics | Turn the request into business scope, acceptance criteria and unresolved decisions. | Establish expected behavior and evidence; identify questions that require a human decision. |
| Developer | Implement the scoped change with appropriate source tracing and tests. | Keep the change focused, preserve existing contracts and add regression coverage for the behavior being changed. |
| QC | Verify changes against scope and acceptance criteria; review affected components, test results and generated output. | Identify scope drift, regressions, unsupported facts and gaps in the available evidence. |

For example, adding a supported input format can involve Business Analytics defining the expected cases, Solution Architect checking the impact on normalization, merging, export and provenance, Developer implementing the focused change and regression tests, and QC comparing the diff and results with the acceptance criteria. I review the findings, direct corrections and leave unresolved business choices explicit.

The skill definitions live in my personal workspace and are not bundled with this repository. The CLI runs without them. Shared repository guidance is in [AGENTS.md](../AGENTS.md), and the handover asset for Part B.2 is the [Hotel provenance reviewer](../prompts/review-hotel-profile.md). This section describes configured roles and an example handoff; actual corrections and checks for the assignment are recorded in [AI_LOG.md](../AI_LOG.md).

## Brainstorming: AI use and working process

User's idea: keep a shared record of brainstorming and review the submission before upload.

Codex originally placed the whole discussion in AGENTS.md. After consulting official Codex guidance, the operational instructions are now separated from this design record. The shared source of truth consists of explicitly owned documents rather than one file containing everything.

Proposed responsibilities, not yet agreed in detail:

- User: set priorities, decide business policies and review design/results.
- Codex: explain options with evidence and tradeoffs, implement requested work, verify it and record actual events.
- Reusable review asset: the selected "Hotel provenance reviewer" template checks source grounding and publication rules, returns evidence-backed findings and makes no file changes. No independent reviewer agent has been run; output review and human approval must be reported separately.

Proposed process:

1. Understand requirements and list unresolved decisions.
2. Discuss publication policies using examples from the fixtures.
3. Implement requested parts with changes small enough to review.
4. Check outputs against evidence and test failure cases, as well as normal cases.
5. Complete the handoff and upload only when requested.

Review cadence remains open: review each part, or agree on a plan and review the completed implementation. Codex proposed reviewing small parts; the user has not selected a cadence.

## Design proposals awaiting user review

The table preserves the earlier proposals. The current implementation uses the explicit defaults in [PART_A.md](PART_A.md), including withholding invalid/uncertain official fields instead of automatically replacing them, and combining agreeing duplicate evidence instead of treating the first record as a factual winner. Business approval remains open; implementation is not evidence of confirmation.

| Topic | Current draft choice | Question to consider |
| --- | --- | --- |
| Conflicts | Keep valid official values and flag differences | Should any fields be withheld when sources conflict? |
| OTA gap filling | Fill missing or invalid fields | How should qualifiers or meaning from withheld official values be preserved? |
| Normalization | Do not infer country codes, currency, date order, URL scheme or coordinate swaps | How do we distinguish evidence-supported formatting from business assumptions? |
| Duplicates | Match normalized name, address and URL; retain the first record | Should freshness, combined provenance or withholding both candidates determine the result? |
| Amenities | Compare lists, retain official values, do not automatically add OTA extras | When is a difference merely a synonym or a level of detail? |
| Export eligibility | Exclude closed, nameless or probable duplicate properties | What minimum criteria make a profile publishable? |
| Provenance | JSON Pointer per value, raw evidence and input hashes | What level of detail makes review easiest? |

## Open brainstorming questions

1. What should the submission primarily demonstrate: data reliability, pipeline design or collaboration with AI?
2. How should the TypeScript/Node.js project be structured for explanation and live extension during the interview?
3. Which fields can be normalized automatically, and which require review? Decide using fixture examples.
4. How should missing, invalid, conflicting and uncertain values be distinguished?
5. How should duplicate identity and newer source dates be handled?

## How to update this record

Record who proposed a choice, whether the user confirmed it, and its rationale. Move confirmed choices out of proposal tables. Promote a decision to AGENTS.md only when it becomes a durable operational rule; keep alternatives and historical reasoning here. Do not treat an existing implementation as evidence of user approval.
