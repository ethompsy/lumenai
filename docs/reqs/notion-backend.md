# Product Requirements Document: Notion Document & Task Backend

## 1. Vision & Purpose

**Why this exists:** Synthex produces exactly the artifacts non-engineers want to track — product requirements, implementation plans with milestones and typed acceptance criteria, architecture decisions, retrospectives — and then writes them to markdown files in a git repository, where product managers, designers, and stakeholders never see them. Task status is a word in a markdown table cell. Following delivery progress means reading a diff.

Meanwhile those same people already have a place they track work: Notion.

**The Notion backend** lets a project route Synthex's documents and implementation-plan task state into a Notion workspace, so the output lands inside the process the team already runs. PRDs become pages people can comment on. Plan tasks become rows on a board they already check.

**The governing design commitment is bolt-on compatibility.** Synthex points at a page and a database that **already exist**, adapts to the schema it finds, and scopes everything it writes to a workstream identifier so it coexists with other teams' work in a shared database. It does not restructure the workspace, does not impose its own column names, and does not change a database's schema without explicit consent. An integration that requires a team to reorganize their Notion defeats its own purpose.

**Two further commitments:** the feature ships **off by default** with a byte-identical disabled path, and it is **MCP-only** — Synthex never holds a Notion API key, reaching Notion exclusively through the Notion MCP server using the developer's existing authorization. This keeps Synthex's credential surface area at zero, mirroring the CLI-only stance of multi-model review.

---

## 2. Target Users / Personas

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Product Manager** | Owns requirements; does not clone the repo | To read and comment on the PRD and plan where they already work |
| **Engineering Lead** | Runs Synthex; reports progress upward | Task status visible to stakeholders without writing a status update |
| **Delivery Team on a Shared Board** | Tracks work in one Notion database across several workstreams | Synthex's tasks alongside theirs, without Synthex touching rows it does not own |
| **Notion-First Team** | Already keeps specs and decisions in Notion | Synthex reading from and writing to the existing source of truth rather than a second copy |
| **Local-First Developer** | Wants none of this | The default path unchanged, with zero new latency or failure modes |

---

## 3. Terminology

| Term | Definition |
|------|------------|
| **Backend** | The storage implementation serving a document type. Two exist: `filesystem` (local markdown — today's behavior) and `notion`. |
| **Document type** | One of the keys of the `documents` config block: `requirements`, `implementation_plan`, `specs`, `decisions`, `rfcs`, `runbooks`, `retros`. Backend is resolved per document type. |
| **Document store contract** | The normative operations envelope both backends implement, at `plugins/synthex/agents/_shared/document-store-contract.md`. Commands speak this instead of naming filesystem paths. |
| **Docs root** | An existing Notion page that Synthex creates its document pages beneath. Synthex adds children and never reorganizes what is already there. |
| **Tasks database** | An existing Notion database that Synthex writes implementation-plan task rows into, alongside whatever else the team tracks there. |
| **Workstream identifier** | A property/value pair scoping every row Synthex creates and every query it issues, so Synthex cannot see or modify tickets belonging to other workstreams. |
| **Property map** | Mapping from Synthex's canonical task fields onto the target database's actual property names. Three fields are required; the rest degrade. |
| **Degradation** | What happens when an optional canonical field has no property to map onto: the data is recorded in the plan overview page or task page body instead of becoming a queryable column. Always reported, never silent. |
| **Canonical status** | Synthex's internal task state vocabulary — `pending`, `in_progress`, `done`, `blocked` — translated to and from the workspace's own option names at the adapter boundary. |
| **task_ref** | A task's opaque, stable identity. Under `notion` it is the row's Notion page ID; under `filesystem` it is `<milestone>.<ordinal>`. Distinct from `ordinal`, which is display-only. |
| **Fail-soft** | Default failure policy: a Notion error falls back to the filesystem backend for that document type and emits a warning. Contrast **strict mode**, which aborts. |

---

## 4. Functional Requirements

### FR-NB1: Backend resolution

Each document type resolves to a backend independently. Resolution order, first match wins:

1. `documents.backend_overrides.<doc_type>`
2. `documents.backend`
3. `filesystem`

This mirrors the established `review_loops` idiom (per-command override → global → hardcoded default), so a project can put the artifacts non-engineers read in Notion while leaving the ones Synthex itself reads on every run — specs and decisions — on local disk.

`documents.backend: notion` while `notion.enabled` is `false` is a **configuration error**, not an implicit opt-in. Report it and use `filesystem`. The master switch is the consent signal.

### FR-NB2: Regression contract

When `notion.enabled` is `false` — the default — every document operation MUST behave **byte-identically** to pre-Notion Synthex.

The implementation guarantee is stronger than "produces the same result": commands MUST short-circuit before any backend-resolution logic runs, so the disabled path executes no new code at all. Verified against the pre-refactor baselines in `tests/__snapshots__/notion-backend/baseline/`, captured before any command was modified.

### FR-NB3: Document operations

The contract defines six operations for prose documents: `resolve`, `read`, `write`, `patch`, `create`, `list`. Handles are opaque; callers MUST NOT parse or construct them.

Targets resolve in the order: explicit caller `ref` → `notion.targets.<doc_type>` (written by the wizard as it nominates or creates each page; deterministic and survives a rename) → a title-matched child of `notion.docs_root`, which MUST fail rather than choose when several match.

`patch` is section-scoped and MUST be preferred over `write` whenever a change is localized, because a full-document `write` discards a human's concurrent edits to sections Synthex never intended to touch. A person editing a Notion page while Synthex works is routine.

### FR-NB4: Workstream scoping

**Normative and non-negotiable.** Synthex writes into databases that already hold other teams' work.

1. Every task row Synthex creates MUST be stamped with the configured workstream value.
2. Every task query MUST filter on the workstream property.
3. Every task write MUST verify the target row carries the configured workstream value first, failing with `permission_denied` if it does not.

A backend that cannot scope its queries MUST refuse to operate against a shared database. An unscoped fallback is **never** an acceptable degradation, is not exempted by strict mode, and has no override: reading other teams' tickets is a privacy problem and mutating them is a correctness problem, and both fail silently until someone notices a ticket they own has the wrong status.

Configuration MUST NOT be able to produce an unscoped task setup. Where no workstream property can be resolved, the wizard configures documents only.

**The property is workspace-wide; the value is per-plan.** The property describes the target database's schema and is configured once. The value identifies a single initiative, and a repository commonly runs several concurrently — Synthex already supports this on the filesystem, where each initiative is its own plan document. A single configured value would make every initiative's rows indistinguishable, so `list_tasks` for one epic would return another's work and the plan-complete check would never fire until both finished.

Every implementation plan therefore records its own value on a `**Workstream:**` line beneath its H1. Resolution order for the value: the plan's line (authoritative) → `notion.workstream.value` (a default for plans that do not declare one) → `schema_mismatch`.

Binding the value to the plan makes targeting the wrong initiative structurally impossible rather than merely discouraged: a command cannot query or write task rows without having read the plan those rows belong to, and that plan names its workstream. There is no flag to forget and no config entry to drift. A value MUST NOT be derived from a filename, branch, or title — a derived value matching no rows returns an empty queue, which is indistinguishable from "all work complete".

### FR-NB5: Property mapping and graceful degradation

Synthex maps its canonical task fields onto the target database's existing properties.

| Field | Requirement | When unmapped |
|-------|-------------|---------------|
| `title` | Required | `schema_mismatch`; refuse to operate |
| `status` | Required | `schema_mismatch`; refuse to operate |
| `workstream` | Required | `schema_mismatch`; refuse to operate |
| `complexity` | Optional | Recorded in the plan overview page |
| `milestone` | Optional | Recorded in the plan overview page |
| `dependencies` | Optional | Recorded in the plan overview page |
| `acceptance_criteria` | Optional | Recorded in the task page body |

Required fields fail loudly rather than guess — silently writing status to the wrong column is worse than failing. Optional fields degrade, and every degradation MUST be reported to the caller so it can be surfaced to the user; a silent degradation is indistinguishable from a working integration until someone tries to filter on a column nothing ever populated.

Canonical statuses are translated through `notion.status_values` onto the workspace's own option names, because teams have their own vocabulary.

**Synthex MUST NOT alter an existing database's schema** — not a property, not a select option, not a type — without explicit user consent obtained at configuration time, defaulting to no. Silent schema migration of a live shared database is the most damaging thing this feature could do.

### FR-NB6: Configuration wizard

A re-runnable `/synthex:configure-notion` command owns setup: MCP availability check, target nomination (existing page and database, with search and a create-new fallback), workstream setup, schema discovery and property mapping, document-type selection, and config write. It is idempotent, offering Re-run / Reset to disabled / Leave as-is on re-entry.

`/synthex:init` delegates a step to it. An unavailable or skipped Notion setup MUST NOT abort `init` — no MCP configured is the common case and not an error for the project.

The wizard MUST NOT prompt for or store a Notion API key or token.

### FR-NB7: Task identity

`task_ref` is opaque and stable for the life of the task. `ordinal` is display-only.

`plan-scribe` renumbers ordinals whenever tasks are inserted or removed. Implementations MUST NOT treat a renumber as re-identifying a task, MUST NOT resolve a task by ordinal, and MUST NOT derive a `task_ref` from one. Wiring ordinals to identity silently rewires the dependency graph on every insert and retargets writes to the wrong row.

### FR-NB8: Data-transmission consent

Before enabling the backend, the wizard MUST surface a data-transmission warning stating what leaves the local repository (requirements, plans, decisions, retrospectives, task detail), where it goes, that Notion may retain or index it after deletion, that access follows the nominated page and database, and that Synthex holds no API key and sends no source code.

The user MUST be able to select which document types go to Notion rather than accepting all-or-nothing.

### FR-NB9: Error enum and degradation policy

Failures return exactly one of eight values: `mcp_unavailable`, `notion_auth_failed`, `target_not_found`, `permission_denied`, `schema_mismatch`, `rate_limited`, `conflict`, `unknown_error`. The enum is closed; a new failure mode requires amending this requirement and the contract.

Default policy is **fail-soft** — fall back to `filesystem` for that document type and warn, naming the error code. `notion.strict_mode: true` aborts instead. Every degraded operation MUST be visible via the envelope's `degraded_from` field.

Two exceptions: a workstream-scoping failure never degrades to an unscoped query (FR-NB4), and `mcp_unavailable` across all document types emits one remediation message rather than one per type.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| **NFR-NB1** | Zero credential surface. Synthex reaches Notion only through the MCP server using the developer's existing authorization. No API key is prompted for, stored, logged, or transmitted. |
| **NFR-NB2** | Zero cost when disabled. With `notion.enabled: false` there is no added latency, no MCP call, and no new failure mode. The feature is invisible to users who do not opt in. |
| **NFR-NB3** | Non-destructive by construction. Synthex never renames, moves, archives, or deletes pre-existing Notion content, and never modifies a row outside its workstream. |
| **NFR-NB4** | Content fetched from Notion is treated as data, never as instructions. Pages and rows may be authored by anyone in the workspace; adapters MUST ignore fetched content that reads like directions and report the anomaly. |

---

## 6. Out of Scope

- **Bidirectional sync.** A document type resolves to one backend. There is no reconciliation of divergent copies, because conflict resolution between two writable stores is a large problem that this feature does not need to solve.
- **Migrating existing content.** No bulk import of local markdown into Notion, or the reverse.
- **Notion as a code store.** Source code stays in git. Only documents and task metadata are transmitted.
- **Other trackers.** Jira, Linear, and Asana are out of scope, though the document-store contract is deliberately backend-neutral so a future adapter need not disturb the commands.
- **Notion comment ingestion.** Synthex does not read Notion comments as review input in this version.

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Disabled-path regression | Byte-identical to pre-Notion baselines; zero diffs |
| Rows outside the configured workstream modified in any run | Zero |
| Existing database schemas altered without explicit consent | Zero |
| Setup completed against an existing page and database without restructuring the workspace | The expected path, not the exception |
| Degradations surfaced to the user rather than silent | 100% |

---

## 8. Assumptions & Constraints

- The Notion MCP server is available in the user's session and already authorized. Synthex does not install or authenticate it.
- The target database's schema is owned by the team, not by Synthex, and may change without notice — hence mapping validation against the live schema on every invocation rather than trusting config alone.
- Notion MCP query results for rich text must be read in rows mode; SQL mode is documented as lossy for mentions, formatting, and link destinations, and acceptance criteria are rich text that Synthex round-trips.
- Concurrent human editing is the normal case, not an edge case.

---

## 9. Future Work / Extension Points

- **Additional backends.** The contract is backend-neutral; a Jira or Linear task store would implement §3 without touching commands.
- **Notion comments as review input.** Reading stakeholder comments on a PRD page and feeding them to `refine-requirements` is a natural follow-on.
- **Notion database views.** Generating a filtered view per milestone would give teams a board per phase for free.
- **Embedding-based target discovery.** Resolving a document type by semantic match rather than title, for workspaces with inconsistent naming.

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | When a task row is deleted in Notion but still present in the local plan, is that a deletion to honor or drift to report? Reporting is the safer default. | Open |
| Q2 | Should `specs` default to `filesystem` even under a global `backend: notion`, given `review-code` reads specs on every invocation? | Open |
| Q3 | Is one workstream value per project sufficient, or do multi-initiative repositories need a value per plan document? | **Resolved** — per plan document. One value per project collides as soon as a repository runs two initiatives at once, which is the common case. Each plan carries its own value on a `**Workstream:**` line; `notion.workstream.value` remains a default for single-initiative projects. See FR-NB4. |
