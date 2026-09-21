# Baseline snapshot: /synthex:retrospective (pre-notion-backend)

## Invocation
- Command: /synthex:retrospective
- Config: `documents.backend` NOT set (key does not exist); `notion` block absent
- Date: <YYYY-MM-DD redacted>

## Document path resolution
| Parameter | Resolution order | Access |
|-----------|-----------------|--------|
| `config_path` | invocation arg → `.synthex/config.yaml` | read |
| `implementation_plan_path` | invocation arg → `documents.implementation_plan` → `docs/plans/main.md` | read |
| `retrospective.output_path` | config → `docs/retros` | read (prior retros) **and write** (new retro) |

`output_path` is the one directory this command both scans and writes into: it reads the
most recent prior retrospective to compute follow-through, then writes the new document
alongside it. Directory listing order determines "most recent".

## Decision-flow log
- Step 1: Load configuration — resolve `retrospective.output_path` (`docs/retros`), `format` (`start-stop-continue`), `max_improvement_items` (`3`)
- Step 2: Determine retrospective scope — explicit arg, else read resolved `implementation_plan_path` and identify most recently completed phase or milestone
- Step 3: Gather quantitative data — Metrics Analyst sub-agent; receives plan, git history, CI/CD data
- Step 4: Review previous retrospective — scan `output_path` for prior documents; load improvement items; compute follow-through rate
- Step 5: Launch Retrospective Facilitator — interactive session in configured format
- Step 6: Write retrospective document to `output_path`

## Sub-agent invocation order
| Order | Agent | Mode |
|-------|-------|------|
| 1 | metrics-analyst | sequential (feeds step 5) |
| 2 | retrospective-facilitator | sequential, interactive |

## Metrics Analyst output
<<finding-body>>

## Retrospective Facilitator output
<<finding-body>>

- Improvement items produced: <<count>> (cap: 3)
- Previous-cycle follow-through rate: <<count>>

## File writes
- one new document under resolved `retrospective.output_path`
- prior retrospective documents are read, never modified

## Exit status: 0
