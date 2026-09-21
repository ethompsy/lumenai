# Baseline snapshot: /synthex:write-implementation-plan (pre-notion-backend)

## Invocation
- Command: /synthex:write-implementation-plan
- Config: `documents.backend` NOT set (key does not exist); `notion` block absent
- Date: <YYYY-MM-DD redacted>

## Document path resolution
Every path below is resolved by direct filesystem substitution of the `@{param}`
placeholder. There is no indirection layer.

| Parameter | Resolution order | Access |
|-----------|-----------------|--------|
| `config_path` | invocation arg → `.synthex/config.yaml` | read |
| `requirements_path` | invocation arg → `documents.requirements` → `docs/reqs/main.md` | read |
| `specs_path` | invocation arg → `documents.specs` → `docs/specs` | read (directory scan) |
| `plan_path` | invocation arg → `documents.implementation_plan` → `docs/plans/main.md` | write |

Fallback when `.synthex/config.yaml` is absent: plugin `config/defaults.yaml` supplies
all `documents.*` values. No error, no prompt.

## Decision-flow log
- Step 1: Load configuration — `.synthex/config.yaml` absent; using plugin defaults (architect, design-system-agent, tech-lead; max_cycles: 3)
- Step 2: Read and understand requirements — PRD read from resolved `requirements_path`
- Step 3: Gather technical context — `specs_path`, CLAUDE.md, package.json scanned
- Step 4: User interview — Product Manager sub-agent conducts Q&A via AskUserQuestion
- Step 5: Product Manager drafts initial plan
- Step 5.5: plan-linter structural audit (Haiku) — runs once per draft cycle
- Step 6: Peer review loop — Architect, design-system-agent, Tech Lead in parallel
- Step 6a: findings-consolidator (Haiku) deduplicates and groups findings
- Step 6b: PM consumes consolidated findings; applies revisions via plan-scribe
- Step 6c: Review loop check (verdict: <<verdict>>; max_cycles: 3)
- Step 7: Write final plan to resolved `plan_path`

## Per-reviewer status table
| Reviewer | Verdict | Findings |
|----------|---------|----------|
| architect | <<verdict>> | <<count>> |
| design-system-agent | <<verdict>> | <<count>> |
| tech-lead | <<verdict>> | <<count>> |

## Plan document structure written
- `# Implementation Plan: <<task-name>>`
- `## Overview`
- `## Decisions` (table: `| # | Decision | Context | Rationale |`)
- `## Open Questions` (table: `| # | Question | Impact | Status |`)
- `## Phase N: <<milestone-name>>`
- `### Milestone N.M: <<milestone-name>>`
- task table header, verbatim: `| # | Task | Complexity | Dependencies | Status |`
- `**Task N Acceptance Criteria:**` block per task, criteria tagged `[T]` / `[H]` / `[O]`
- `**Parallelizable:**`, `**Milestone Value:**`, `**Observational Outcomes:**` lines

Task identity at baseline: per-milestone ordinal only (`1`, `2`, `3`). Not globally
unique. `Dependencies` cells hold free text referencing those ordinals.

## Consolidated findings

### Major
<<finding-body>>

### Minor
<<finding-body>>

### Summary
<<finding-body>>

## File writes
- resolved `plan_path` (single full-document write)
- no other file is created or modified

## Exit status: 0
