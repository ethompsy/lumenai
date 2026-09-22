# Document Store Contract

> The normative contract every document backend implements. Commands resolve documents and task state through these operations instead of naming filesystem paths directly, so the filesystem-vs-Notion branch exists in exactly one place rather than in every document-centric command.

## Status: Normative

## Source authority

- FR-NB1 (backend resolution order)
- FR-NB4 (workstream scoping — the multi-team safety guarantee)
- FR-NB5 (property mapping and graceful degradation)
- FR-NB7 (task identity)
- FR-NB9 (error enum and fail-soft degradation)
- Cross-reference: [`canonical-finding-schema.md`](./canonical-finding-schema.md) — the sibling normative schema this document's structure follows

---

## 1. Backends

Two backends implement this contract:

| Backend | Implementation | Status |
|---------|---------------|--------|
| `filesystem` | Inline Read / Write / Edit tool calls against a resolved path. **This is today's behavior, unchanged.** | Default |
| `notion` | The `notion-document-store` and `notion-task-store` adapter agents, via Notion MCP tools | Opt-in |

**Resolution order for a given document type** — first match wins:

1. `documents.backend_overrides.<doc_type>`
2. `documents.backend`
3. `filesystem` (hardcoded default)

This mirrors the established `review_loops` resolution idiom (per-command → global → hardcoded).

### Regression contract (FR-NB2)

When `notion.enabled: false`, every operation MUST route to the `filesystem` backend and behave **byte-identically** to the pre-contract implementation. `documents.backend: notion` without `notion.enabled: true` is a configuration error, not a silent opt-in.

Baselines for verifying this live in `tests/__snapshots__/notion-backend/baseline/`.

---

## 2. Document operations

Document types are the keys of the `documents` config block: `requirements`, `implementation_plan`, `specs`, `decisions`, `rfcs`, `runbooks`, `retros`.

| Operation | Input | Output |
|-----------|-------|--------|
| `resolve` | `doc_type`, optional explicit `ref` | `handle` |
| `read` | `handle` | `{ content_markdown, version }` |
| `write` | `handle`, `content_markdown` | `{ version }` |
| `patch` | `handle`, `edits[]` | `{ version }` |
| `create` | `doc_type`, `title`, `content_markdown` | `handle` |
| `list` | `doc_type` | `handle[]` |

### Handles

A `handle` is opaque. Callers MUST NOT parse it or construct one by hand.

- `filesystem` backend: a repo-relative path (`docs/plans/main.md`)
- `notion` backend: a page ID

### Target resolution

`resolve` locates a document type's page in this order, first match wins:

1. An explicit `ref` supplied by the caller
2. `notion.targets.<doc_type>` — a map of resolved page IDs that `configure-notion` writes as it nominates or creates each target. This is the deterministic path, and it survives the page being renamed.
3. A child of `notion.docs_root` whose title matches the document type's conventional name

Step 3 is a convenience for targets the wizard has not recorded yet. It MUST fail with `target_not_found` rather than choose when more than one child matches — silently reading the wrong PRD is worse than failing.

### `version`

An opaque backend-supplied marker used for conflict detection. `filesystem` may return `null`. The `notion` backend returns the page's `last_edited_time`. A `write` or `patch` whose supplied `version` no longer matches MUST fail with `conflict` rather than overwrite.

### `patch` semantics

`edits[]` entries are `{ old_str, new_str }` pairs applied to named sections. `patch` is **section-scoped**: content outside the targeted sections MUST survive untouched. This is what allows a human editing one part of a Notion page to coexist with Synthex writing another — a routine occurrence, not an exceptional one.

Prefer `patch` over `write` whenever the change is localized. `write` replaces the whole document and will discard concurrent human edits.

---

## 3. Task operations

| Operation | Input | Output |
|-----------|-------|--------|
| `list_tasks` | `plan_handle`, optional `filter` | `task[]` |
| `update_task_status` | `task_ref`, `status`, optional `notes` | `{ version }` |
| `annotate_task` | `task_ref`, `annotations` | `{ version }` |

### Canonical task shape

```json
{
  "task_ref": "<opaque backend identifier>",
  "ordinal": 3,
  "title": "Add CSRF validation to login handler",
  "status": "pending",
  "complexity": "M",
  "milestone": "1.2",
  "dependencies": ["<task_ref>"],
  "acceptance_criteria": [
    { "type": "T", "text": "...", "evidence": null },
    { "type": "H", "text": "...", "approved": false },
    { "type": "O", "text": "..." }
  ]
}
```

### Canonical status enum

`pending` → `in_progress` → `done`, plus off-path `blocked`.

These are the canonical values used in code and prose. The `notion` backend maps them onto the workspace's own option names via `notion.status_values` (see §5), because teams have their own vocabulary — `pending` may be `"Backlog"` and `done` may be `"Shipped"`.

### Task identity (FR-NB7)

`task_ref` is **opaque and stable for the life of the task**.

- `filesystem`: `<milestone>.<ordinal>`, preserving today's exact semantics
- `notion`: the row's Notion page ID

`ordinal` is **display-only**. `plan-scribe` renumbers ordinals whenever tasks are inserted or removed (`plan-scribe.md`), and implementations MUST NOT treat a renumber as re-identifying a task. Wiring ordinals to identity would silently rewire the dependency graph on every insert.

---

## 4. Workstream scoping (FR-NB4)

**Normative and non-negotiable.** Synthex writes into databases that already hold other teams' work, so its reads and writes MUST be scoped.

For the `notion` backend:

1. Every task row Synthex creates MUST be stamped with the configured workstream value.
2. Every `list_tasks` query MUST filter on the workstream property.
3. Every `update_task_status` and `annotate_task` MUST verify the target row carries the configured workstream value before writing, and fail with `permission_denied` if it does not.

A backend that cannot scope its queries MUST refuse to operate against a shared database. Falling back to an unscoped query is **never** an acceptable degradation — it risks reading and mutating tickets that do not belong to Synthex.

For the `filesystem` backend, workstream scoping is a no-op: the plan file contains only this project's tasks.

### The property is workspace-wide; the value is per-plan

The workstream **property** is a fact about the target database's schema, so it is configured once in `notion.workstream.property`.

The workstream **value** identifies one initiative, and a repository commonly has several in flight at once — Synthex already supports this on the filesystem, where each initiative is its own plan document (`docs/plans/<initiative>.md`). A single configured value would make every initiative's rows indistinguishable, so `list_tasks` for one epic would return another epic's work and the plan-complete check would never fire until both finished.

The value is therefore carried by the plan itself. Every implementation plan records its own workstream on a `**Workstream:**` line immediately beneath its H1:

```markdown
# Implementation Plan: Billing Migration

**Workstream:** Billing Migration
```

Resolution order for the value, first match wins:

1. The plan document's `**Workstream:**` line — **authoritative**
2. `notion.workstream.value` — a default for plans that do not declare one
3. Neither → `schema_mismatch`; refuse to operate on tasks

Binding the value to the plan is what makes targeting the wrong initiative structurally impossible rather than merely discouraged: a command cannot query or write task rows without having read the plan those rows belong to, and the plan names its own workstream. There is no flag to forget and no config entry to fall out of sync.

**Callers resolve the value; adapters do not.** A command already reads the plan, so it extracts the value and passes it in the `workstream` config it hands the task store. The task store never reads plan documents — it validates that both `property` and `value` are present and refuses otherwise (§4, rule 1). The adapter's input contract is unchanged by this.

Under the `filesystem` backend the line is still written, and is inert. Keeping both backends' plan documents identical in shape means a plan can move between them without rewriting, and a plan authored locally already carries what the Notion backend will need.

---

## 5. Property mapping and degradation (FR-NB5)

The `notion` backend targets a database that already exists, whose schema Synthex does not control. `notion.property_map` maps canonical fields onto that database's actual property names.

| Canonical field | Requirement | Behavior when unmapped |
|-----------------|-------------|------------------------|
| `title` | **Required** | Refuse to operate; `schema_mismatch` |
| `status` | **Required** | Refuse to operate; `schema_mismatch` |
| `workstream` | **Required** (§4) | Refuse to operate; `schema_mismatch` |
| `complexity` | Optional | Recorded in the plan overview page |
| `milestone` | Optional | Recorded in the plan overview page |
| `dependencies` | Optional | Recorded in the plan overview page |
| `acceptance_criteria` | Optional | Recorded in the task page body |

Only the three required fields are load-bearing. Everything else degrades: the data still exists, it simply is not a queryable column.

**Synthex MUST NOT alter an existing database's schema** — not to add a property, not to add a select option, not to change a type — without explicit user consent obtained at configuration time. Silent schema migration of a live team database is the single most damaging thing this integration could do.

---

## 6. Error enum (FR-NB9)

When an operation fails it MUST return one of these values. Implementations MUST NOT introduce new ones; a new failure mode requires amending FR-NB9 and this contract.

| Value | Meaning | Retry |
|-------|---------|-------|
| `mcp_unavailable` | The Notion MCP server is not configured or not reachable | Terminal |
| `notion_auth_failed` | MCP reachable but not authorized for this workspace | Terminal |
| `target_not_found` | Configured page or database does not exist or is not shared with the integration | Terminal |
| `permission_denied` | Authorized but not permitted to read/write the target, or the row failed the workstream check (§4) | Terminal |
| `schema_mismatch` | A required property mapping is absent or the wrong type | Terminal |
| `rate_limited` | Notion returned a rate-limit response | Retry once with backoff |
| `conflict` | The document changed since `version` was read | Re-read and re-apply |
| `unknown_error` | Catch-all | Terminal |

### Degradation policy

Default is **fail-soft**: on any error, fall back to the `filesystem` backend for that document type and emit a warning naming the `error_code` and the affected document type. Work proceeds against the local markdown file.

`notion.strict_mode: true` aborts instead of falling back. Intended for teams where a silent divergence between Notion and local state is worse than a failed command.

Two exceptions to fail-soft:

- **Workstream-scoping failure (§4)** never degrades to an unscoped query.
- **`mcp_unavailable` across the board** emits a single remediation message rather than one warning per document type, mirroring the `NFR-MR2` cloud-surface pattern.

---

## 7. Response envelope

```json
{
  "status": "success | failed",
  "error_code": null,
  "error_message": null,
  "backend": "filesystem | notion",
  "operation": "read",
  "doc_type": "implementation_plan",
  "result": {},
  "degraded_from": null
}
```

- **error_code** — REQUIRED when `status: "failed"`, MUST be in the §6 enum. NULL on success.
- **backend** — the backend that actually served the operation, which may differ from the configured one after a fail-soft fallback.
- **degraded_from** — set to `"notion"` when the operation fell back to filesystem, else null. This is what makes a degraded run visible instead of silently indistinguishable from a healthy one.

---

## 8. Validation surface

Layer 1 validators MUST enforce:

- `status` ∈ {`success`, `failed`}
- `error_code` in the §6 enum when failed, null when successful
- `backend` ∈ {`filesystem`, `notion`}
- Canonical task `status` ∈ {`pending`, `in_progress`, `done`, `blocked`}
- Acceptance-criteria `type` ∈ {`T`, `H`, `O`}
- Every task query and write in the Notion adapters is workstream-scoped (§4)
- Required property mappings present; optional ones degrade rather than fail (§5)

Implemented in `tests/schemas/document-store-envelope.ts`, `tests/schemas/notion-workstream-scoping.test.ts`, and `tests/schemas/notion-property-mapping.test.ts`. This document is the source of truth for those validators.

## Used by

- `notion-document-store` — document operations (§2)
- `notion-task-store` — task operations (§3), workstream scoping (§4), property mapping (§5)
- `configure-notion` — schema discovery and mapping setup (§5), consent for any schema change
- Commands resolving documents through the contract: `write-implementation-plan`, `refine-requirements`, `next-priority`, `write-adr`, `write-rfc`, `retrospective`, `reliability-review`
- `plan-scribe`, `plan-linter`, `product-manager` — canonical task model (§3)
