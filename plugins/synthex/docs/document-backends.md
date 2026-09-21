# Document Backends — Shared Resolution Mechanics

> The mechanical framework every document-centric Synthex command uses to resolve, read, and write its documents. It lives here once so the filesystem-vs-Notion branch is stated in a single place instead of being re-derived in each command. Commands inline only their own command-specific bits and link here for the rest.
>
> The normative contract this implements is [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md). Where this document and the contract disagree, the contract wins.

## Status: Reference

---

## 1. When this applies

Any command that reads or writes a Synthex artifact — a PRD, an implementation plan, an ADR, an RFC, a runbook, a retrospective, or implementation-plan task state.

If `notion.enabled` is `false` (the default), **skip this entire document**. Resolve `@{path}` parameters directly against the filesystem exactly as before. This is the FR-NB2 regression contract: the disabled path must behave byte-identically to pre-Notion Synthex, and the cheapest way to guarantee that is to not run any new logic at all.

---

## 2. Resolve the backend

For the document type you are about to touch, resolve its backend. First match wins:

1. `documents.backend_overrides.<doc_type>`
2. `documents.backend`
3. `filesystem`

Document types are the keys of the `documents` config block: `requirements`, `implementation_plan`, `specs`, `decisions`, `rfcs`, `runbooks`, `retros`.

**Guard:** if the resolved backend is `notion` but `notion.enabled` is `false`, that is a configuration error. Report it and fall back to `filesystem`:

> `Config names the notion backend for <doc_type>, but notion.enabled is false. Using local markdown. Run /synthex:configure-notion to enable it.`

Do not treat a named backend as an implicit opt-in — the master switch is the consent signal.

---

## 3. Dispatch

### Backend `filesystem`

Resolve the document type to its configured path and use the Read / Write / Edit tools directly, as commands have always done. Nothing else in this document applies.

### Backend `notion`

Delegate. Do not call Notion MCP tools inline from a command.

| What you need | Delegate to |
|---------------|-------------|
| Prose documents — PRDs, plan overviews, ADRs, RFCs, runbooks, retros | `notion-document-store` |
| Implementation-plan task state — the queue, status writes, criteria evidence | `notion-task-store` |

Both are Haiku-backed, which is the point: a command running on Opus should not spend its tokens on property mapping and page fetches. Pass the operation, the document type, and the resolved `notion` config block. Each returns the contract's §7 response envelope.

---

## 4. Handle the response

On `status: "success"`, use `result` and continue.

On `status: "failed"`, apply the degradation policy:

- **`notion.strict_mode: false`** (default) — fall back to the `filesystem` backend for this document type and carry on. Surface a one-line warning naming the error code and the document type:

  > `Notion unavailable for <doc_type> (<error_code>). Using local markdown instead.`

- **`notion.strict_mode: true`** — abort the command, reporting the error code and the affected document type. Do not fall back.

Two cases override the above:

1. **`mcp_unavailable` for every document type** — emit one remediation message, not one per type:

   > `The Notion backend is configured but the Notion MCP server isn't available in this session. Using local markdown for everything. Run /synthex:configure-notion to reconfigure.`

2. **A workstream-scoping failure** (`schema_mismatch` from `notion-task-store` Step 1) — never falls back to an unscoped query. Report it and stop touching tasks. Documents may still proceed.

**Always surface a degradation.** A run that silently fell back to local markdown looks identical to a healthy Notion run until someone wonders why Notion is stale. The envelope's `degraded_from` field exists for exactly this.

---

## 5. Task state specifics

Only relevant to commands that read or write implementation-plan task state.

- **Status vocabulary.** Work in the canonical enum — `pending`, `in_progress`, `done`, `blocked`. The adapter translates to and from the workspace's own option names. Never write a workspace-specific label like `"Shipped"` across the contract boundary.
- **Identity.** A task's identity is its `task_ref`, which is opaque. `ordinal` is display-only and gets renumbered whenever tasks are inserted or removed. Never look a task up by ordinal and never treat a renumber as re-identifying a task.
- **Prose vs. rows.** Under the `notion` backend an implementation plan is two things: an overview page holding the prose sections (Overview, Decisions, Open Questions, milestone summaries) and a set of task rows in the task database. Read and write each through the matching adapter.
- **Degraded fields.** When the target database has no home for `complexity`, `milestone`, or `dependencies`, the adapter reports a degradation and that data belongs in the overview page instead. Honor that — do not invent a property to hold it.

---

## 6. What not to do

- **Do not call Notion MCP tools directly from a command.** Delegate, so the mapping and scoping rules live in one place and are tested in one place.
- **Do not create documents as a side effect of reading one.** Creation is an explicit operation.
- **Do not prompt the user from inside a resolution failure.** Report and degrade, or abort under strict mode. Configuration belongs to `/synthex:configure-notion`.
- **Do not write a full-document `write` when a section-scoped `patch` would do.** A human may be editing another part of the same page.
- **Do not add new error codes.** The enum in §6 of the contract is closed.

---

## Source Authority

- [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md) — the normative contract
- FR-NB1 (backend resolution), FR-NB2 (regression contract), FR-NB9 (error enum and degradation)

## Used by

`write-implementation-plan`, `refine-requirements`, `next-priority`, `write-adr`, `write-rfc`, `retrospective`, `reliability-review`
