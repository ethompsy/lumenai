---
model: haiku
---

# Use Epic

Set which epic this working copy is currently operating on, so document-centric commands default to that initiative's requirements and plan instead of needing a path every time.

This exists because `.synthex/config.yaml` is **committed and shared**. It holds workspace facts — which database holds epics, which property links a work item to one — and deliberately holds no particular epic. "Which epic am I on" is per-developer and per-clone, so it lives in local state that is never committed. You and a colleague share one config and each work a different epic.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `epic` | The epic to activate: a Notion page URL, a page id, or enough of its title to match one unambiguously. Omit to see what is active and what is available. | — | No |
| `--clear` | Deactivate, so commands require an explicit path again. | off | No |

## State File

`.synthex/active-epic.json`, in the project root. **Per-developer, per-clone, gitignored** — `init` adds it alongside `.synthex/state.json` and `.synthex/loops/`.

```json
{
  "schema_version": 1,
  "ref": "https://www.notion.so/<epic-row-id>",
  "label": "Billing Migration",
  "requirements": "docs/reqs/billing.md",
  "plan": "docs/plans/billing.md",
  "updated_at": "2026-10-05T14:02:11Z"
}
```

It is a **separate file rather than a key in `.synthex/state.json`** for a concrete reason: `scripts/upgrade-nudge.sh` rebuilds `state.json` from a fixed set of fields on every version bump, so anything else stored there is erased. Do not move this into `state.json`.

Paths are **recorded, not derived from the label.** A slug convention breaks the moment someone renames an epic in Notion, and a stale derived path silently points at the wrong document.

## Workflow

### 1. Preflight

Requires the Notion backend: read `.synthex/config.yaml` and confirm `notion.enabled` is true and `notion.epics_database` is set.

If not, say so and stop — there are no epics to activate, and commands should keep using their configured paths:

> `This project isn't using the Notion backend, so there's no epic to activate. Commands use the paths in documents.* as normal. Run /synthex:configure-notion to set it up.`

### 2. No Argument — Report

Read `.synthex/active-epic.json` if present, then query `notion.epics_database`.

```
Active epic: Billing Migration
  requirements  docs/reqs/billing.md
  plan          docs/plans/billing.md

Available:
  Billing Migration        (active)
  Checkout Revamp          docs/reqs/checkout.md · docs/plans/checkout.md
  Platform Hardening       no documents yet
```

With no active epic, say so and list what is available. Do not pick one.

### 3. `--clear`

Delete `.synthex/active-epic.json`. Confirm, and name the consequence so it is not a surprise:

> `No active epic. Document commands now need an explicit path, e.g. --implementation_plan_path docs/plans/billing.md.`

### 4. Resolve the Epic

First match wins:

1. A Notion page URL or id → fetch it to verify it exists and is a row of `notion.epics_database`.
2. A title fragment → query the epics database and match case-insensitively.

**Never auto-select on an ambiguous match.** Two or more candidates means presenting them and asking. One candidate still gets confirmed when the input was a fragment rather than an id — a substring match is a guess about intent, and activating the wrong epic silently redirects every subsequent command.

Nothing found → report it with the input echoed back, list the available epics, and stop.

### 5. Resolve Its Documents

Determine the requirements and plan paths for this epic, in order:

1. An existing document whose `**Epic:**` link resolves to this epic — scan `documents.requirements`' directory and `documents.implementation_plan`' directory for a match. This is authoritative: the document itself says which epic it belongs to.
2. Convention: `<reqs dir>/<slug>.md` and `<plans dir>/<slug>.md`, where `slug` is the epic's title lowercased with non-alphanumerics collapsed to hyphens.

Record whichever resolved, and whether the file currently exists.

**Do not create any document.** Switching epics changes which epic is active and nothing else — it never writes to the working tree, so it is safe to do freely and safe to undo. Creating a document is `write-prd`'s job, and it is the step that actually puts content in one.

### 6. Write and Confirm

Write `.synthex/active-epic.json` atomically — temp file then rename — so an interrupted write cannot leave malformed state.

Report, naming missing documents plainly and pointing at the command that creates them:

```
Active epic: Billing Migration
  requirements  docs/reqs/billing.md   (not yet created)
  plan          docs/plans/billing.md  (not yet created)

Run /synthex:write-prd to start the PRD. It will use this epic automatically.
```

When both exist, the same block without the annotations.

## How Commands Use It

Any command taking `requirements_path` or `implementation_plan_path` resolves in this order:

1. An explicit argument — always wins.
2. `.synthex/active-epic.json`, when present.
3. `documents.*` from config.

**When the Notion backend is on with more than one epic available, and there is no active epic and no explicit argument, stop rather than falling through to step 3.** Defaulting to `docs/plans/main.md` on a multi-epic project is how someone marks another initiative's tasks done:

> `No active epic, and no path given. Run /synthex:use-epic <epic> first, or pass --implementation_plan_path explicitly.`

**Every command operating on an epic names it in its first line of output.** A run must never be ambiguous about which initiative it touched.

`/synthex:write-prd --epic <url>` sets the active epic as a side effect — that is where an initiative begins, so activating it separately first would be redundant.

## Behavioral Rules

1. **Never write a document.** This command only ever changes which epic is active.
2. **Never auto-select an ambiguous epic**, and confirm a single fuzzy match before activating.
3. **Never store active-epic state in `.synthex/state.json`** — the upgrade-nudge hook rebuilds that file and would erase it.
4. **Never derive a recorded path from a label after the fact.** Record paths at activation; a renamed epic must not silently repoint a stale slug.
5. **Write atomically.** Temp file then rename.
6. **Stay silent when the backend is off.** No epics means nothing to activate; it is not an error.
7. **Do not chat.** Output is the status block.

## Source Authority

- `../agents/_shared/document-store-contract.md` — epic resolution and the epic-scoped document types
- `write-prd.md` — originates the epic reference and sets this as a side effect
