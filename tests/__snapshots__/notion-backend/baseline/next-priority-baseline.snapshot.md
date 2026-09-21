# Baseline snapshot: /synthex:next-priority (pre-notion-backend)

## Invocation
- Command: /synthex:next-priority
- Config: `documents.backend` NOT set (key does not exist); `notion` block absent
- Date: <YYYY-MM-DD redacted>

## Document path resolution
| Parameter | Resolution order | Access |
|-----------|-----------------|--------|
| `implementation_plan_path` | invocation arg → `documents.implementation_plan` → `docs/plans/main.md` | read **and write** |
| `concurrent_tasks` | invocation arg → `next_priority.concurrent_tasks` → `3` | — |
| `worktrees.base_path` | config → `.claude/worktrees` | write (git worktree) |

The plan document is the **sole source of task state**. There is no database, no state
file, and no task index. Reading the queue and writing status both operate on this one
markdown file via generic Read/Edit tool calls.

## Task-state model at baseline
- Status lives in the `Status` cell of the task table row. Free text, not an enum.
- Observed values: `pending` (default) → `in progress` → `done`, with `blocked` off-path.
- Task identity is the per-milestone ordinal. `plan-scribe` renumbers these on
  insert/removal, so identity is **not stable** across edits.
- Milestone membership is determined purely by document position — which
  `### Milestone` heading's table the row sits under. There is no milestone field.

## Decision-flow log
- Step 1: Analyze the implementation plan — read resolved `implementation_plan_path`; select top N tasks by priority, dependency chain, business value, current milestone
- Step 1a: Plan-complete check — scan **every** task row across all phases; if all `Status` cells equal `done`, report completion and exit
- Step 1b: No-actionable-tasks check — non-`done` tasks exist but none actionable; report and do not emit promise
- Step 2: Pre-work search — sub-agents scan codebase for existing implementations
- Step 3: Mark tasks in progress — write `in progress` into each selected task's Status cell
- Step 4: Set up work environments — `git worktree add` per task
- Step 5: Delegate to Tech Lead — one sub-agent per task, in parallel
- Step 5a: commit-message-author (Haiku) authors each commit message
- Step 6: Monitor progress
- Step 7: Validate completion — `[T]` test linkage verified; `[H]` approval via AskUserQuestion (unconditional); `[O]` deferred
- Step 8: Merge results — `git merge --ff-only`, then immediate `git worktree remove`
- Step 9: Update the plan — write `done` into Status cells, annotate acceptance criteria in place
- Step 9a: Update CLAUDE.md with build/test insights
- Step 9b: Emission-point check when under `--loop`

## Plan mutations performed
Three distinct in-place edits to the single plan file:

1. `Status` cell → `in progress` (Step 3)
2. `Status` cell → `done` (Step 9)
3. Acceptance-criteria bullets rewritten in place (Step 9), appending:
   - `[T]` test linkage in the form `[T] <<finding-body>> → <path>: "<test name>"`
   - `[H]` approval note
   - autonomous decision record, when `--auto-decide` was set
   - completion notes, learnings, follow-up tasks

Off-path: `Status` cell → `blocked` with detail, on persistent blocker.

## Tech Lead completion summary (per task)
<<finding-body>>

## File writes
- resolved `implementation_plan_path` (multiple in-place edits, per above)
- `CLAUDE.md` (append-only, build/test insights)
- worktree paths under `worktrees.base_path` (created then removed)

## Exit status: 0
