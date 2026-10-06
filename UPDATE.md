# Week-one update: AI Profile

To: Chief AI Officer

Date: 7 October 2026

The offline hotel-data tool is ready for Ops review. Publication still requires factual decisions and human sign-off.

**Delivered:** A TypeScript/Node.js CLI that combines the two supplied sources, normalizes hotel facts and produces Hotel JSON-LD, per-field source evidence and an actionable Ops report. Input paths are configurable. Repository instructions, a reusable provenance reviewer and the AI work log are documented.

**Verified:** Strict type checking and all 26 tests pass, including source tracing, conflict handling and repeatable output. The 12 official records produce nine candidate profiles: H004 is grouped with H001, H008 is held over contradictory operating status, and H009 is excluded for missing names.

**Open work and risks:** Ops has not resolved the flagged facts or approved publication. Independent review and external schema validation are outstanding. Several profiles are partial because currency, qualified times or conflicting evidence cannot safely support a published value. AI consumers could repeat incorrect facts if these review steps are skipped.

**Decisions needed:**

- Approve retaining valid official values on conflict and withholding uncertain fields; decide when Ops may authorize OTA replacements.
- Approve the minimum publication criteria and duplicate-confirmation policy.
- Assign an Ops owner to confirm H001/H004 identity, resolve H008/H009 and verify price, time and amenity qualifiers.

**Next:** Work through the Ops report, apply confirmed source corrections, rerun verification and complete schema validation before requesting publication sign-off.
