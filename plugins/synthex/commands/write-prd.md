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
| `--brief-only` | Stop after discovery and write the brief, without specifying requirements. | off | No |
| `requirements_path` | Where the PRD is written | `docs/reqs/main.md` | No |
| `brief_path` | Where `--brief-only` writes | `docs/reqs/brief.md` | No |
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

### 1. Check for an Existing PRD

Read `@{requirements_path}`.

- **Absent:** proceed to Step 2.
- **Present:** do **not** overwrite it. Ask via `AskUserQuestion`:

  > **A PRD already exists at `<path>`.**
  >
  > 1. **Refine it** — hand straight to `/synthex:refine-requirements`, which reviews and improves an existing PRD.
  > 2. **Write a sub-PRD** — a separate initiative at `docs/reqs/<initiative-name>.md`, which may or may not tie back to the main PRD.
  > 3. **Replace it** — discard the existing PRD and author a new one. Requires explicit confirmation.

Option 3 is destructive and the confirmation must name the file. Never take it as a default.

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

### 5. Discovery

Launch the **Product Manager** sub-agent to establish four things, using `AskUserQuestion` in batches of 3–5. Draw answers from the sources where they exist; ask only where they do not.

| | Question |
|---|---|
| **Vision** | What problem does this solve, and why now? |
| **Users** | Who is this for, and what do they do today instead? |
| **Value** | What changes for them if this works? |
| **Scope boundary** | What is explicitly *not* in this version? |

The PM may offer deepening techniques — pre-mortem, negative space, Socratic on each must-have, inversion — when an answer is thin. See `product-manager.md`.

**Floor condition.** If vision, users, and at least one scope boundary cannot be established, **stop and report what is missing.** Do not draft. With no sources and no answers there is nothing to write a PRD from, and producing one anyway is the failure this command exists to prevent.

**If `--brief-only`:** write the brief to `@{brief_path}` — vision, users, value, scope boundary, and the Source Map — and exit. The brief is a legitimate standalone artifact and also feeds `write-rfc`.

### 6. Interview the Gaps

Now specify requirements. The PM asks only about what discovery and the sources left open:

- requirements implied by a source but not stated precisely enough to build
- **contradictions between sources** — present both positions with citations and ask; never reconcile silently
- non-functional requirements, which sources almost never state
- success metrics
- anything the PM would otherwise have to assume

### 7. Draft with Provenance

The PM produces the draft per the template in `product-manager.md`. Every functional and non-functional requirement carries exactly one tag and a `**Source:**` line:

| Tag | Meaning |
|-----|---------|
| `[S]` | Sourced — cites a document **and** a location within it |
| `[U]` | User-stated — cites what was asked |
| `[D]` | Derived from the codebase — cites what it was read from |
| `[A]` | Assumed — states the reasoning |

Unanswered questions go to **Open Questions**, never into an invented requirement.

### 8. Lint

Invoke the **prd-linter** sub-agent (Haiku) with the draft, the source manifest, and `prd.assumption_policy`.

It returns a provenance summary and findings. Hand them to the PM, which must resolve **every CRITICAL** — including every unconfirmed `[A]`, which under the default blocking policy is CRITICAL. An assumption is resolved by confirming it with the user, grounding it in a source, or demoting it to an Open Question. HIGH findings are resolved too; MEDIUM at the PM's discretion.

Lint runs **once** per draft. It is not part of the review loop.

### 9. Write and Hand Off

Write the finalized PRD to `@{requirements_path}`.

Then report the provenance summary to the user and hand off:

```
PRD written to docs/reqs/main.md

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

**Document types touched:** `requirements` (write), `specs` (read)

**When `notion.enabled` is `false` — the default — skip this section entirely** and resolve `requirements_path`, `brief_path` directly against the filesystem exactly as the Workflow above describes. The disabled path must stay byte-identical to pre-Notion behavior (FR-NB2), and the surest way to guarantee that is to run no new logic at all.

**Command-specific notes**

- Under the `notion` backend the PRD becomes the `Product Requirements` subpage of its epic. Resolve the epic before writing; a PRD is epic-scoped, so without an anchor `notion-document-store` returns `schema_mismatch` rather than filing it somewhere arbitrary.
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
