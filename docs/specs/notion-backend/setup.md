## Status: Final

# Setup Guide — Notion Backend

> How to point Synthex at an existing Notion workspace, what it will and will not touch, and how to undo it.

## Related Documentation

- [`./architecture.md`](./architecture.md) — how it works internally
- [`../../reqs/notion-backend.md`](../../reqs/notion-backend.md) — the PRD

---

## 1. What you get

Synthex's documents and implementation-plan tasks appear in Notion instead of only as markdown in your repository:

- PRDs, plans, ADRs, RFCs, runbooks, and retrospectives become pages under a root page you choose.
- Implementation-plan tasks become rows in a task database you choose, with status updated as work completes.

You choose which of those document types go to Notion. Anything you do not select stays as local markdown.

**Off by default.** If you never run the wizard, nothing changes.

---

## 2. Prerequisites

The Notion MCP server, available and authorized in your session. Synthex never holds a Notion API key — it reaches Notion entirely through the MCP connection using your existing authorization.

You will also want, though Synthex can create them if you have neither:

- An existing Notion **page** to root documents under.
- An existing Notion **database** to write task rows into.

Both must be shared with the Notion integration your MCP connection uses; otherwise Synthex sees them as nonexistent.

---

## 3. Setup

```
/synthex:configure-notion
```

The wizard walks eight steps. It is re-runnable at any time and idempotent.

### What it asks

| Step | What it needs | Notes |
|------|--------------|-------|
| 2 | The page to root documents under | Paste a URL, search by name, or create one |
| 2 | The task database | Paste a URL, search by name, or create one |
| 3 | A workstream property and value | Required for tasks — see §4 |
| 4 | Property mappings | Proposed from your database's real schema; you confirm |
| 6 | Which document types go to Notion | Multi-select; the rest stay local |

Before enabling anything it shows a data-transmission warning describing exactly what leaves your repository. Read it — this is the point at which your requirements and plans start living on Notion's servers.

`/synthex:init` runs this wizard as one of its steps. If the MCP server is not available it exits cleanly and `init` continues; an unavailable Notion setup never breaks initialization.

---

## 4. The workstream identifier

**This is the most important thing to understand about the integration.**

Your task database probably holds work from more than just Synthex. So every row Synthex creates is tagged with a workstream identifier, and **every query Synthex runs filters on that tag**.

```yaml
notion:
  workstream:
    property: Team              # an existing property in your database
    value: Checkout Revamp      # this project's identifier
```

The consequences are worth being explicit about:

- Synthex reads **only** rows where `Team = Checkout Revamp`. Your other rows are never queried.
- Synthex writes **only** to rows carrying that value. Before any update it re-checks the row and refuses if it does not match.
- `next-priority`'s "all tasks complete" check covers only this workstream. Other teams' tickets never gate your delivery.

If your database has no property suitable for this, the wizard offers to add one (a single additive property, with your explicit confirmation) or to use a separate database instead.

### Running more than one initiative at once

The `property` above is set once, because it describes your database. The **value** is per initiative, and it lives on the plan rather than in config — each implementation plan names its own workstream on a line beneath its H1:

```markdown
# Implementation Plan: Billing Migration

**Workstream:** Billing Migration
```

So two concurrent epics stay cleanly separated with no config juggling:

```
/synthex:next-priority --implementation_plan_path docs/plans/checkout.md
  -> reads "Checkout Revamp" from that plan, queries only those rows

/synthex:next-priority --implementation_plan_path docs/plans/billing.md
  -> reads "Billing Migration" from that plan, queries only those rows
```

Each run's "all tasks complete" covers only its own initiative, so finishing checkout does not wait on billing.

`notion.workstream.value` in config is just a default for plans that do not declare one. **If you run several initiatives, leave it null** — then a new plan can never silently inherit another epic's identifier; it has to say what it is. If you only ever have one initiative, setting the default means you can ignore workstreams entirely.

Synthex will not guess a value from a filename, branch, or plan title. A guessed value that matches no rows returns an empty queue, which looks exactly like "all work complete" — so a missing value is an error you will hear about rather than a silent no-op.

**Synthex will not run tasks unscoped.** There is no flag to disable this and strict mode does not exempt it. If no workstream can be resolved, the wizard configures documents only and tells you why.

---

## 5. Property mapping

Synthex maps its fields onto your database's existing property names. It does not rename your columns or impose its own.

| Synthex field | Required? | If your database has no home for it |
|---------------|-----------|-------------------------------------|
| `title` | **Yes** | Setup cannot complete for tasks |
| `status` | **Yes** | Setup cannot complete for tasks |
| `workstream` | **Yes** | Setup cannot complete for tasks |
| `complexity` | No | Recorded in the plan overview page |
| `milestone` | No | Recorded in the plan overview page |
| `dependencies` | No | Recorded in the plan overview page |
| `acceptance_criteria` | No | Recorded in the task page body |

Unmapped optional fields are not lost — they just are not queryable columns. The wizard tells you which ones degraded, and so does every run that encounters one.

Status names are mapped too, so Synthex uses your vocabulary:

```yaml
notion:
  status_values:
    pending: Backlog
    in_progress: In Progress
    done: Shipped
    blocked: Blocked
```

---

## 6. What Synthex will never do

- Rename, move, archive, or delete any page that existed before it arrived.
- Reorganize the contents of your docs root.
- Modify a task row outside its configured workstream.
- Add a property, add a select option, or change a property type without asking you first — and that prompt defaults to no.
- Store a Notion API key or token anywhere.
- Send your source code. Only documents and task metadata are transmitted.

---

## 7. Choosing what goes to Notion

A common split:

```yaml
documents:
  backend: filesystem
  backend_overrides:
    requirements: notion        # PMs read these
    implementation_plan: notion # stakeholders track these
    retros: notion              # the team discusses these
    # specs, decisions, rfcs, runbooks stay local
```

The reason to leave `specs` and `decisions` local: `review-code` reads them on every invocation for spec-compliance checking. Fetching them from Notion adds latency to every review. Put the artifacts humans read in Notion; leave the ones Synthex reads on disk.

---

## 8. When something goes wrong

By default Synthex **falls back to local markdown** for the affected document type and warns you:

```
Notion unavailable for implementation_plan (target_not_found). Using local markdown instead.
```

Your work continues. To make Notion failures abort instead — appropriate when a silent divergence between Notion and local state is worse than a failed command:

```yaml
notion:
  strict_mode: true
```

| Error | Usually means |
|-------|--------------|
| `mcp_unavailable` | The Notion MCP server isn't configured in this session |
| `notion_auth_failed` | MCP is present but not authorized for this workspace |
| `target_not_found` | The page or database was deleted, or isn't shared with the integration |
| `permission_denied` | The integration can't write there, or a row failed the workstream check |
| `schema_mismatch` | A required property mapping is missing or the wrong type — re-run the wizard |
| `rate_limited` | Notion throttled the request; retried once |
| `conflict` | Someone edited the page while Synthex was writing; re-read and retry |

One exception to fall-back: a workstream-scoping failure never degrades to an unscoped query. Synthex stops touching tasks and tells you why.

---

## 9. Turning it off

```
/synthex:configure-notion
```

Choose **Reset to disabled**. Documents revert to local markdown immediately.

Your Notion pages and rows are left exactly as they are — disabling the backend does not delete anything. Re-enable any time by re-running the wizard; your previous settings are preserved in config, so it is a one-step re-entry.
