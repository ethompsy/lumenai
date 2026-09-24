---
model: opus
---

# Write PRD

Produce a Product Requirements Document through guided discovery and an interview, grounded in whatever source material you supply — meeting notes, research, an existing spec, a Notion page — and refined through the existing multi-agent review loop.

The design commitment: **source documents change what the interview is about; they do not replace it.** With good inputs the Product Manager arrives holding a grounded draft and asks only about gaps, contradictions, and unstated assumptions. With none, it must elicit everything, and the interview is correspondingly longer. Either way, every requirement records where it came from.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `--from <path>` | Source material to ingest. Repeatable. Accepts a file, a glob, a directory, a URL, or a Notion page URL. | — | No |
| `--epic-only` | Stop once the epic page is established, without specifying requirements. Notion backend only. | off | No |
| `requirements_path` | Where the PRD is written | `docs/reqs/main.md` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

1. Ingest source material — supplied explicitly, and discovered in the repository
2. Run **discovery** before specification, so the result is a PRD and not a feature list
3. Interview the user about what the sources do not settle
4. Draft with **provenance** on every requirement
5. Audit cheaply via **PRD Linter** before expensive reviewers see it
6. Hand off to `/synthex:refine-requirements` for multi-agent review

---

## Workflow

### 1. Decide What This Run Is Doing

Under the `notion` backend, resolve the `epic_page` document type — the epic row itself. Then read `@{requirements_path}`.

**If `--epic-only` is set, skip the PRD entirely** — it is not this run's concern. Go to Step 2, then Step 5, then stop. This is the path for standardizing or refreshing an epic on a project whose PRD and plan already exist.

Otherwise branch on what exists:

| Epic page | PRD | Action |
|-------|-----|--------|
| absent or n/a | absent | Full run — establish the why (Step 5), then the PRD |
| present | absent | Confirm the why still holds, then the PRD |
| either | **present** | Ask, below |

When a PRD already exists, do **not** overwrite it. Ask via `AskUserQuestion`:

> **This project already has a PRD.**
>
> 1. **Refresh the epic page** — re-read it and bring it back into standard shape, including its `Where the detail lives` block. Leaves the PRD alone. Use this when the epic has drifted or was never standardized. Notion only.
> 2. **Refine the PRD** — hand to `/synthex:refine-requirements`, which reviews and improves an existing PRD.
> 3. **Write a sub-PRD** — a separate initiative at `docs/reqs/<initiative-name>.md`, which may or may not tie back to the main PRD.
> 4. **Replace the PRD** — discard it and author a new one. Requires explicit confirmation.

Option 1 is equivalent to `--epic-only` and exists here so the capability is discoverable from the command you would naturally reach for. Option 4 is destructive and its confirmation must name the file; never take it as a default.

### 2. Load Configuration

Load `@{config_path}`, merging with the plugin's `config/defaults.yaml` for anything unspecified. Relevant settings:

| Setting | Default |
|---------|---------|
| `prd.max_source_bytes` | 200000 |
| `prd.max_file_bytes` | 40000 |
| `prd.assumption_policy` | `blocking` |
| `documents.requirements` | `docs/reqs/main.md` |

### 3. Assemble Sources

**Auto-discover first.** A repository is itself a source document set, so gather these before asking the user for anything:

| Discovered | Contributes |
|-----------|-------------|
| `README.md` | project intent |
| `CLAUDE.md` | conventions and constraints |
| `package.json` or equivalent | the stack — becomes `[D]`, so never ask what you can read |
| `docs/specs/` | existing specifications |
| the codebase, when one exists | brownfield constraints — `[D]` |

**Then add everything from `--from`.** Expand globs and directories; fetch URLs; for a Notion page URL, read it through `notion-document-store`.

Delegate the reading to the **context-bundle-assembler** sub-agent (Haiku) with the discovered and supplied paths as `sources`, and `max_source_bytes` / `max_file_bytes` from config. It applies the caps, summarizes what is oversized, and returns a manifest recording exactly what was read and what was summarized.

Keep that manifest. It becomes the PRD's Source Map, and the PRD Linter checks citations against it.

**If a supplied source cannot be read**, say which one and why, and ask whether to continue without it. Do not silently proceed — a PRD that was supposed to be grounded in a document nobody could open is worse than one that never claimed to be.

### 4. Set Expectations

State plainly what is about to happen, so interview length is never a surprise.

**With sources:**

```
Read 6 sources (2 summarized to fit). I'll draft from these and ask only about
what they don't settle.
```

**Without any beyond the repo:**

```
No source documents beyond the repo itself. This will be a longer interview.
If you have notes, research, or a draft spec, pass --from <paths> and I'll
interview only about what those don't settle.
```

This is where `--from` gets taught — at the moment it is relevant, rather than in documentation nobody reads first.

### 5. Establish the Why

Discovery settles why this exists, for whom, what is out of scope, and how success is judged. That is the prerequisite for requirements.

**Where it lands depends on the backend.** Under `notion` it goes to the **epic page** — the row itself, which is where stakeholders arrive. Under `filesystem` there is no landing page, so it becomes the PRD's opening sections and there is no separate artifact; `--epic-only` is not applicable and should report as much rather than writing a file nobody opens.

#### 5a. Read what is already there (Notion)

Resolve the `epic_page` document type — the epic row itself, not a subpage.

- **Populated** → go to 5b. The existing content is input, not an obstacle.
- **Empty** → go to 5c.

#### 5b. Refine it collaboratively

Launch the **Product Manager** sub-agent to refine the existing content into the standard shape, per `product-manager.md`:

1. Ingest the existing content as a source.
2. **Map** it onto the five sections and show the user what landed where. The mapping is a claim about their writing; let them check it.
3. **Ask about gaps** — sections nothing filled.
4. **Ask about leftovers** — content fitting no section.
5. Show the result and get approval before writing anything.

**Never silently drop existing content.** Anything that maps to no section is raised with the user or preserved verbatim under `Additional context`. Pass the original content to the linter as `prior_content` so loss is checked, not assumed.

#### 5c. Author it through discovery

With an empty body, run discovery to establish the same five things, drawing on the sources where they answer and asking where they do not. The PM may offer deepening techniques — pre-mortem, negative space, Socratic on each must-have, inversion.

**Floor condition.** If the why, the audience, and at least one scope boundary cannot be established, **stop and report what is missing.** Do not draft. With no sources and no answers there is nothing to write from, and producing something anyway is the failure this command exists to prevent.

#### 5d. Write the navigation block (Notion)

The epic page carries a `## Where the detail lives` section directly after `## Why this exists`, listing the requirements page, the plan, and the filtered work-item view, each with a current-state line — plus this disclaimer, verbatim:

> This page is a summary, not the plan. For current status, follow the links above.

Populate what exists. On a first run the plan does not exist yet, so list it as *not yet created* rather than omitting the row; a reader should see that the plan is absent, not be left unable to tell.

This section is the reason the epic page has a navigation block at all: an epic is skimmed, and a stakeholder once read a detailed-but-stale epic body as the live plan because nothing pointed elsewhere and nothing signalled age. It is also the only volatile content permitted in an epic body, and Synthex owns it — `next-priority` refreshes it at the end of each run.

**Everything else on the epic page must be non-volatile.** No status, no dates, no counts, no tasks, no milestones. If discovery surfaces content of that shape, it belongs in the plan or the work items, and you should say so rather than filing it here.

**Relocation requires a destination.** Where volatile content already sits on the epic page and exists nowhere else — phases being the common case — do **not** remove it. The plan must first be extended to hold it, and the content confirmed present there. `--epic-only` cannot extend the plan, so when reduction depends on that it must report the required sequence and stop:

> `Phases 2–6 appear only on this epic page; the plan covers 0–1. Reducing the page would delete them. Run /synthex:write-implementation-plan to name the remaining phases first, then re-run this.`

Naming an exit without an entrance is prescribed data loss, and it is worse than the silent kind because it looks principled.

#### 5e. Lint and write

Invoke **prd-linter** with `document: "epic_page"`, the draft, and `prior_content` when refining. Resolve every CRITICAL — including any content the refinement lost.

Write with a section-scoped **`patch`**, never a full-document `write`. An epic page holds content Synthex did not author, and a whole-page replace would discard it.

**If `--epic-only`:** stop here and report what was written.

### 6. Interview the Gaps

Now specify requirements. With the why settled, the PM asks only about what it and the sources leave open:

- requirements implied by a source but not stated precisely enough to build
- **contradictions between sources** — present both positions with citations and ask; never reconcile silently
- non-functional requirements, which sources almost never state
- anything the PM would otherwise have to assume

Do **not** re-ask what discovery already answered. Re-interviewing settled ground is how a command earns a reputation for being tedious.

### 7. Draft the PRD

The PM produces the PRD per the shape in `product-manager.md` that matches the backend. Under `notion`: an `**Epic:**` link, then Target Users, Functional Requirements, Non-Functional Requirements, Assumptions & Constraints, Open Questions, Source Map. Under `filesystem`: the self-contained shape, which keeps Vision, Out of Scope, and Success Metrics.

Under `notion` it does **not** restate the vision, the strategic scope boundary, or the success measures — those live on the epic page, and a second copy only creates something that can disagree with it. Detailed personas stay in the PRD under both shapes.

Every functional and non-functional requirement carries exactly one tag and a `**Source:**` line:

| Tag | Meaning |
|-----|---------|
| `[S]` | Sourced — cites a document **and** a location within it |
| `[U]` | User-stated — cites what was asked |
| `[D]` | Derived from the codebase — cites what it was read from |
| `[A]` | Assumed — states the reasoning |

Unanswered questions go to **Open Questions**, never into an invented requirement.

### 8. Lint the PRD

Invoke **prd-linter** with `document: "prd"`, the draft, the source manifest, and `epic_page_present` so it applies the right shape.

Hand the findings to the PM, which must resolve **every CRITICAL** — including every unconfirmed `[A]`, which under the default blocking policy is CRITICAL. An assumption is resolved by confirming it with the user, grounding it in a source, or demoting it to an Open Question. HIGH findings are resolved too; MEDIUM at the PM's discretion.

Lint runs **once** per draft. It is not part of the review loop.

### 9. Write and Hand Off

Write the PRD to `@{requirements_path}`, then report and hand off:

```
Epic    → epic page (refined from existing content + 2 sources)
PRD     → docs/reqs/main.md

  22 requirements — 12 sourced, 7 user-stated, 2 derived, 1 open question
  6 sources ingested, all accounted for in the Source Map

Next: /synthex:refine-requirements reviews this with the Product Manager,
Tech Lead, and design-system agent, then /synthex:write-implementation-plan
turns it into an executable plan.
```

Surfacing the provenance counts is the point of tagging. A PRD that is mostly assumption should be obvious to the person about to build from it.

---

## Document Backend

This command reads source material and writes a PRD. When the Notion backend is enabled for `requirements`, resolve it through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `epic_page` (read and **patch**, Notion only), `requirements` (write), `specs` (read)

**When `notion.enabled` is `false` — the default — skip this section entirely** and resolve `requirements_path` directly against the filesystem exactly as the Workflow above describes. The disabled path must stay byte-identical to pre-Notion behavior (FR-NB2), and the surest way to guarantee that is to run no new logic at all.

**Command-specific notes**

- Under the `notion` backend the PRD becomes the `Product Requirements` subpage of its epic, and the **why lives on the epic page** — the row itself, not a subpage. Resolve the epic before writing either; both are epic-scoped, so without an anchor `notion-document-store` returns `schema_mismatch` rather than filing them somewhere arbitrary.
- **The epic page is always written with `patch`, never `write`.** It holds content the team authored, and a whole-page replace would discard whatever sits outside the standard sections.
- `--from` accepts Notion page URLs, so an epic's own page content, linked notes, and prior discussion can all be source material. Read them via `notion-document-store` and record them in the Source Map like any other source.
- This command **creates** a document, so use `create`, not `write`. Never overwrite an existing page as a side effect — Step 1 governs that decision.

---

## Project Configuration

```yaml
prd:
  max_source_bytes: 200000     # total cap on ingested source material
  max_file_bytes: 40000        # per-file cap; larger files are summarized
  assumption_policy: blocking  # blocking | warn
```

`assumption_policy: warn` lets a PRD ship with acknowledged assumptions — the linter reports them as MEDIUM rather than CRITICAL. Use it when you deliberately want a fast first draft; the default exists because an unconfirmed assumption presented as a requirement is indistinguishable from a fabricated one to whoever builds from it.
