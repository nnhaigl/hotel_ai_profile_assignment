# AGENTS.md design rationale and references

Reviewed online on 2026-10-06. The sources below are the live pages retrieved for this revision, not a claim that this repository has a particular Codex version installed.

## Primary sources

1. [OpenAI: Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md), which redirected to [the current documentation page](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
2. [OpenAI: Codex best practices](https://developers.openai.com/codex/learn/best-practices), which redirected to [the current best-practices page](https://learn.chatgpt.com/guides/best-practices).
3. [AGENTS.md open format](https://agents.md/).

The open format specifies plain Markdown with no required fields. OpenAI recommends practical repository guidance rather than a mandatory section template. Its best-practices page states: "A short, accurate AGENTS.md is more useful than a long file full of vague rules."

## What the sources recommend

- Include repository layout, actual setup/run/build/test/lint commands, engineering conventions, constraints and a verifiable definition of done.
- Keep durable instructions in AGENTS.md. Link longer planning, architecture and review documents rather than placing everything in the automatically loaded context.
- Improve guidance based on observed mistakes. Keep instructions accurate as the repository changes.
- Use root instructions for shared rules and nested instructions only where local behavior differs.
- For Codex GitHub review, a `Code Review Rules` section can state concise behaviors to flag and safe alternatives. Keep mechanical lint and formatting checks in tooling.

## Corrections in this repository

| Previous issue | Correction |
| --- | --- |
| Conversation history and brainstorming dominated the instruction file. | Move them to `docs/DESIGN_NOTES.md`; keep operational guidance at the root. |
| Draft business policies appeared as rules despite lacking user confirmation. | Link unresolved policies and explicitly distinguish them from required data-integrity constraints. |
| Stack selection remained mixed with earlier Python instructions. | State TypeScript/Node.js only and describe the implementation actually present in this checkout. |
| The reusable review asset was referenced but absent. | Add the "Hotel provenance reviewer" template at `prompts/review-hotel-profile.md` for review instructions, keep invocation guidance in `AGENTS.md`, and keep the four-line Part B.2 rationale in `docs/DESIGN_NOTES.md`. |
| Typical npm commands could be mistaken for implemented tooling. | State that Node.js tooling is absent; require actual commands to be documented and verified when implemented. |
| Completion criteria were spread across narrative sections. | Consolidate verification, reporting and data-focused review rules. |

These section names and the split into two supporting documents are repository design choices, not requirements imposed by Codex. Neither choosing a package manager nor migrating application code is part of this documentation revision.

## Codex discovery details

According to the current OpenAI guide:

- Codex builds its instruction chain at the start of a run; in the TUI, this normally means a launched session.
- At global scope, it uses the first non-empty `AGENTS.override.md` or `AGENTS.md` in the Codex home directory.
- At project scope, it walks from the project root to the current working directory. In each directory it checks `AGENTS.override.md`, then `AGENTS.md`, then configured fallback names, including at most one file per directory.
- Instructions are combined from root to deeper directories; later, more local guidance overrides earlier conflicting guidance. Discovery stops at the current working directory, not every directory in the repository.
- The default combined project-document limit is 32 KiB, controlled by `project_doc_max_bytes`. This is a loading limit, not a recommended file length.
- Restart a run/session after changing instructions if the active client still shows stale guidance. Follow explicit current user instructions; the repository file does not override them.

This small repository needs only one root AGENTS.md. No global configuration, overrides or alternative filename configuration were changed.

## Optional loading check

In an installed Codex CLI, start a fresh session from the repository root and ask:

```sh
codex --ask-for-approval never "List the instruction files you loaded and summarize the repository rules. Do not modify files or run the application."
```

Check that the root file is listed, TypeScript/Node.js, source-grounding rules and the repository upload hold are recognized, the "Hotel provenance reviewer" template is identified, and missing Node.js tooling is acknowledged. This interactive Codex loading check was not executed during this revision; local document consistency checks were performed instead.
