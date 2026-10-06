# Design notes and brainstorming

This document records confirmed choices, proposals and open questions. It is not an additional agent instruction file. Follow root `AGENTS.md` for working rules and use these notes when discussing design.

## Evidence and document ownership

- README.md contains the original assignment.
- The supplied files in `data/` are the only evidence for hotel facts.
- AGENTS.md contains durable working instructions.
- This document records design discussion and decision status.
- AI_LOG.md records actual AI use, mistakes and corrections; UPDATE.md provides the executive status update.

## Confirmed user decisions

| Topic | Decision |
| --- | --- |
| Resource language | English for authored files; preserve original factual evidence in its original language. |
| Stack | TypeScript with Node.js only. This narrows the original assignment's language options. |
| Reusable agent asset | "Hotel provenance reviewer" prompt template in `prompts/review-hotel-profile.md`, selected by the user on 2026-10-07 for Part B.2. |
| Planning | Establish a shared source of truth and discuss design before further implementation. |
| First brainstorming topic | AI use and organization of the working process. |
| Repository name | hotel_ai_profile_assignment. |
| Repository visibility | Public, as explicitly requested by the user. The assignment itself accepts a private repo or ZIP. |
| Upload | Create only an empty repository; do not upload content before user review and a subsequent upload instruction. |

GitHub rejected repository creation for the connected account. No repository was created and no content was pushed. This is historical delivery status, not a coding convention.

## Current implementation status

Earlier discussion referenced a Python draft, but no Python application, tests or generated outputs are present in this checkout. The selected stack is TypeScript/Node.js; application tooling and implementation have not been created. The reusable review template is present, but an output review cannot be completed until the pipeline artifacts exist. Historical Python checks do not establish an approved or verified TypeScript implementation.

## Reusable agent asset (Part B.2)

Asset: [Hotel provenance reviewer](../prompts/review-hotel-profile.md). Invocation instructions are in root `AGENTS.md`; the prompt itself contains only review instructions.

[README.md, Part B.2](../README.md) requires a reusable agent asset and a 3-5-line explanation of the choice, but does not prescribe a file for that explanation. The rationale is kept here with the other design decisions.

### Why I chose it

- I chose a provenance review template because unsupported hotel facts are the project's main risk.
- It checks each published value against its original source and checks that conflicts reach human review.
- Its plain Markdown instructions can be reused across AI tools with a consistent, actionable findings format.
- Keeping it in the repository allows its checks to evolve alongside the data pipeline and publication policy.

## Brainstorming: AI use and working process

User's idea: keep a shared record of brainstorming and review the submission before upload.

Codex originally placed the whole discussion in AGENTS.md. After consulting official Codex guidance, the operational instructions are now separated from this design record. The shared source of truth consists of explicitly owned documents rather than one file containing everything.

Proposed responsibilities, not yet agreed in detail:

- User: set priorities, decide business policies and review design/results.
- Codex: explain options with evidence and tradeoffs, implement requested work, verify it and record actual events.
- Reusable review asset: the selected "Hotel provenance reviewer" template checks source grounding and publication rules, returns evidence-backed findings and makes no file changes. No independent reviewer agent or completed output review has been run.

Proposed process:

1. Understand requirements and list unresolved decisions.
2. Discuss publication policies using examples from the fixtures.
3. Implement requested parts with changes small enough to review.
4. Check outputs against evidence and test failure cases, as well as normal cases.
5. Complete the handoff and upload only when requested.

Review cadence remains open: review each part, or agree on a plan and review the completed implementation. Codex proposed reviewing small parts; the user has not selected a cadence.

## Design proposals awaiting user review

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
