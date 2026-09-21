# Redaction Strategy — Notion Backend Baselines

## Purpose
These baseline snapshots capture the deterministic decision-flow envelope of every
document-centric command **before** the Notion backend refactor, so the FR-NB
regression contract ("behavior is byte-identical when `notion.enabled: false`") can be
verified by comparison rather than by assertion.

They were captured in Phase 0, before any command was modified. A baseline captured
after the refactor proves nothing.

## What gets redacted
- Finding / analysis body text → `<<finding-body>>`
- Verdict values → `<<verdict>>`
- Numeric counts → `<<count>>`
- Task, milestone, and phase names → `<<task-name>>`, `<<milestone-name>>`
- ISO dates → `<YYYY-MM-DD redacted>`
- Commit SHAs and branch suffixes → `<<sha>>`, `<<slug>>`

## What is preserved (deterministic envelope)
- **Document path resolution order** — which config key resolves to which path, and the
  fallback order when the project config is absent. This is the single most important
  thing these baselines lock down, because it is exactly what the backend contract
  changes.
- Decision-flow log line text and ordering
- Sub-agent invocation order and parallelism
- File-write paths (paths only, never content)
- Read-vs-write classification per path
- Exit status

## Why path resolution is the focus
The Notion backend replaces direct `@{path}` filesystem resolution with a
document-store contract. Every other aspect of these commands is meant to stay
untouched. Locking the resolution order and the resulting file-write set means a
regression in the disabled path shows up as a snapshot diff instead of as a silent
behavior change in someone's repo.

## Used by
- `tests/schemas/notion-baseline-snapshots.test.ts` — existence, redaction, and
  no-leak assertions (zero LLM cost)
- The FR-NB regression contract verification step in Phase 1 and Phase 2

## Assertion method
Snapshot tests load each `.snapshot.md` via `readFileSync` and assert:
1. The file exists and is non-empty.
2. `<<finding-body>>` is present (confirming redaction was applied).
3. No unredacted date, SHA, or absolute-path patterns appear (negative scan).
4. Each snapshot documents a `## Document path resolution` section, since that is the
   surface under test.
