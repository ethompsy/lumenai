---
model: haiku
---

# Configure Notion Backend

Configure (or re-configure) the Notion backend for this project. The Notion backend routes Synthex's documents and implementation-plan task state into a Notion workspace that **already exists**, so its output appears inside the process your team already runs.

The design principle is bolt-on compatibility: Synthex roots documents under a page you nominate, writes tasks into a database you nominate, maps onto that database's existing properties, and scopes every row it touches to a workstream identifier. It does not restructure your workspace and it does not change your database schema without your explicit consent.

This command is the standalone wizard for the `documents.backend*` and `notion` blocks in `.synthex/config.yaml`. It is invoked:

- Directly by the user via `/synthex:configure-notion` (re-runnable any time).
- As a subroutine from `/synthex:init` during fresh project initialization.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where the config file lives | `.synthex/config.yaml` | No |

## Workflow

### 0. Re-entry Check (idempotency)

Read `@{config_path}`.

- **File absent, or `notion` key absent:** proceed to Step 1 in fresh-configuration mode.
- **`notion.enabled: false` present:** proceed to Step 1 in fresh-configuration mode, but preserve any other keys already in the block when writing.
- **`notion.enabled: true` present:** surface current settings and present re-entry options via `AskUserQuestion`:

> **The Notion backend is already enabled.**
>
> Current configuration:
>
> - `docs_root: <value>`
> - `tasks_database: <value>`
> - `workstream: <property> = <value>`
> - document types routed to Notion: `<resolved list>`
>
> What would you like to do?
>
> 1. **Re-run the wizard** — re-verify the targets, re-discover the database schema, and overwrite the mappings. The data-transmission warning (Step 5) is re-displayed before any write.
> 2. **Reset to disabled** — set `notion.enabled: false` and preserve the rest of the block. Documents revert to local markdown; nothing in Notion is deleted or modified.
> 3. **Leave as-is** — exit without changes.

Apply the choice:

- **Re-run:** proceed to Step 1.
- **Reset to disabled:** edit `@{config_path}` so `notion.enabled: false`. Do NOT delete the `notion` block — the explicit `false` is the opt-out signal. Also set `documents.backend: filesystem` and clear `documents.backend_overrides` of any `notion` values, otherwise the config would name a backend the master switch has disabled. Print: `Notion backend disabled. Your Notion pages were left untouched. Re-run /synthex:configure-notion to re-enable.` Exit.
- **Leave as-is:** print `No changes made.` Exit.

### 1. MCP Availability Check

Emit a progress indicator:

```
Checking Notion MCP availability...
```

Call the Notion MCP access-discovery tool (`get_tool_access` with `{}`) once.

- **Not configured / unreachable:** print the remediation below and exit **without** writing config. Do not cascade one message per document type.

  > The Notion backend needs the Notion MCP server, which isn't available in this session.
  >
  > Add the Notion connector (or configure the Notion MCP server) and re-run `/synthex:configure-notion`. Until then Synthex keeps using local markdown files — nothing is broken.

- **Reachable but unauthorized:** print the same shape of message naming authorization as the cause, and exit without writing.
- **Available:** proceed to Step 2.

### 2. Nominate Existing Targets

Ask the user for the two containers Synthex will use. Use `AskUserQuestion` for the choice of method, then collect the value.

> **Where should Synthex put its documents?**
>
> Synthex creates its PRDs, plans, ADRs, and retrospectives as child pages under a page you choose. It adds pages beneath that root and never renames, moves, or reorganizes anything already there.
>
> 1. **Use an existing page** — paste the page URL (recommended).
> 2. **Search for it by name** — Synthex searches your workspace and you pick from the results.
> 3. **Create a new page** — Synthex creates one page to act as the root. Use this only if you have nowhere suitable yet.
> 4. **Skip documents** — leave documents in local markdown; configure tasks only.

Repeat the same shape for the task database:

> **Which database should Synthex write implementation-plan tasks into?**
>
> Synthex adds task rows to a database you choose, alongside whatever else your team tracks there. It only ever reads and writes rows tagged with this project's workstream (configured next).
>
> 1. **Use an existing database** — paste the database URL (recommended).
> 2. **Search for it by name.**
> 3. **Create a new database** — use this only if you have no task database yet.
> 4. **Skip tasks** — leave task state in the local plan file; configure documents only.

Resolve each nominated target by fetching it. If a fetch fails, report `target_not_found` with the pasted value echoed back and re-ask rather than proceeding with an unverified target. If a search returns multiple plausible matches, present them and let the user pick — never auto-select.

If the user skips both, print `Nothing to configure. Synthex keeps using local markdown files.` and exit without writing.

### 3. Workstream Scoping (required for tasks)

Skip this step only if the user skipped the task database.

Synthex will not query or write to a shared database unscoped. Fetch the database's schema and identify properties usable for equality filtering (select, multi-select, status, relation, or a text type).

Present them:

> **How should Synthex tag its tasks?**
>
> Your database holds work from more than just Synthex, so every row Synthex creates is tagged with a workstream identifier, and every query it runs filters on that tag. This is what keeps Synthex from reading or modifying tickets that aren't its own.
>
> Filterable properties found in your database: `<list with types>`
>
> 1. **Use an existing property** — pick one from the list, then give this project's value (e.g. `Checkout Revamp`).
> 2. **Add a `Workstream` property** — Synthex adds one select property to your database. This is a schema change and needs your explicit confirmation.
> 3. **Use a separate database instead** — Synthex creates its own task database, leaving yours untouched.

Then collect the workstream **value** for this project.

**If the user picks option 2**, confirm the schema change explicitly before making it, naming the database and the property:

> Add a `Workstream` select property to the `<database name>` database? This modifies a database your team shares. (y/N)

Default is no. Decline means fall back to option 1 or 3.

**Hard rule:** if no workstream property and value can be resolved, do NOT write `notion.enabled: true` for tasks. Print the reason and configure documents only. There is no unscoped fallback.

### 4. Map Properties

Using the fetched schema, map Synthex's canonical task fields onto real properties. Propose a mapping by matching on name and type, then show it for confirmation — do not apply a guessed mapping silently.

**Required** — configuration cannot complete for tasks without all three:

| Canonical field | Acceptable types |
|-----------------|------------------|
| `title` | title |
| `status` | status, select |
| `workstream` | select, multi-select, status, relation, text |

**Optional** — offer a mapping when a plausible property exists; otherwise record the degradation and move on:

| Canonical field | If unmapped |
|-----------------|-------------|
| `complexity` | recorded in the plan overview page |
| `milestone` | recorded in the plan overview page |
| `dependencies` | recorded in the plan overview page |
| `acceptance_criteria` | recorded in the task page body |

Then map the four canonical statuses (`pending`, `in_progress`, `done`, `blocked`) onto the mapped status property's existing options. Show the proposed mapping and let the user correct it. If an option is missing for a state Synthex must write, offer to use a different existing option — **do not add an option without explicit confirmation**, per Step 3's rule on schema changes.

Report the resulting degradations plainly, so the user knows what will not be a queryable column:

```
Mapped:      title -> Name, status -> Status, workstream -> Team, complexity -> Size
Not mapped:  milestone, dependencies  (recorded in the plan overview page instead)
```

### 5. Data-Transmission Warning

BEFORE writing `notion.enabled: true`, surface this warning verbatim:

> **Heads up — data transmission**
>
> Enabling the Notion backend sends your product requirements, implementation plans, architecture decisions, retrospectives, and task detail to Notion, where they are stored on Notion's servers and visible to anyone with access to the pages and database you nominated. Content posted to Notion may be retained, indexed, or cached by Notion even after deletion.
>
> Synthex reaches Notion through the Notion MCP server using your existing authorization. It never holds a Notion API key and never sends your source code — only the documents and task metadata described above.
>
> If any of this content should not leave your local repository, choose which document types go to Notion in the next step rather than enabling it for everything.

### 6. Choose Which Document Types Go to Notion

Ask via `AskUserQuestion`, multi-select:

> **Which documents should live in Notion?**
>
> Everything not selected stays as local markdown. A common split is to put the artifacts non-engineers read in Notion and leave the ones Synthex itself reads on every run — specs and ADRs — on local disk, since reading those from Notion adds latency to every review.
>
> - Product requirements (PRDs)
> - Implementation plans
> - Retrospectives
> - Architecture Decision Records
> - RFCs
> - Runbooks
> - Technical specs

Translate the selection into config:

- All types selected → `documents.backend: notion`, `backend_overrides: {}`
- A subset → `documents.backend: filesystem` plus a `backend_overrides` entry per selected type
- None → do not enable the documents side; configure tasks only

### 7. Write the Configuration

Write to `@{config_path}` using the **Edit** tool. Only these keys:

```yaml
documents:
  backend: <filesystem | notion>
  backend_overrides: { <doc_type>: notion, ... }

notion:
  enabled: true
  docs_root: <resolved page id>
  tasks_database: <resolved database id>
  workstream:
    property: <property name>
    value: <this project's identifier>
  property_map: { <canonical>: <their property>, ... }
  status_values: { <canonical>: <their option>, ... }
```

Leave `strict_mode` at its default unless the user asked to change it.

**Never write a Notion API key or token.** Synthex reaches Notion exclusively through the MCP server using the user's existing authorization. Never prompt for a token, and never store one in config. If the user offers one, decline and explain that the MCP connection already carries authorization.

### 8. Confirm

```
Notion backend configured.

  Documents root:   <page title>
  Task database:    <database name>
  Workstream:       <property> = <value>
  In Notion:        <list of doc types>
  Local markdown:   <list of remaining doc types>

  Mapped:           <canonical -> property list>
  Not mapped:       <list>  (recorded in the plan overview page instead)

Synthex only reads and writes task rows tagged <property> = <value>.
Your other rows are never queried or modified.

Re-run /synthex:configure-notion any time to change this, or to disable it.
```

## Behavioral Rules

1. **Never auto-select a target.** Ambiguous search results are presented, not resolved.
2. **Never change a schema without explicit confirmation**, and default that confirmation to no.
3. **Never enable tasks unscoped.** No workstream means documents-only configuration.
4. **Never write credentials to config.**
5. **Verify every target by fetching it** before writing it to config.
6. **Show degradations plainly.** The user should finish this wizard knowing exactly which fields are not queryable.
7. **Exit cleanly when the MCP is unavailable.** That is not an error state for the project — local markdown keeps working.

## Source Authority

- [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md) — §1 backend resolution, §4 workstream scoping, §5 property mapping
- FR-NB6 (configuration wizard), FR-NB8 (data-transmission consent)
