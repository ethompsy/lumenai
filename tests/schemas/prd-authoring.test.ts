/**
 * PRD authoring pipeline: /synthex:write-prd, prd-linter, provenance tagging,
 * and source ingestion.
 *
 * The point of the design is that a command can be easy to invoke without
 * producing an unearned document. Two mechanisms carry that, and both are
 * asserted here:
 *
 *   - Supplied sources change what the interview is ABOUT rather than
 *     replacing it, so grounding reduces effort instead of lowering the bar.
 *   - Every requirement records where it came from, so fabrication is visible
 *     and countable rather than indistinguishable from research.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

const TAGS = ['[S]', '[U]', '[D]', '[A]'] as const;

describe('PRD authoring pipeline', () => {
  let cmd: string;
  let linter: string;
  let pm: string;
  let assembler: string;
  let init: string;
  let plan: string;
  let docStore: string;
  let cfg: any;
  let cfgText: string;

  beforeAll(async () => {
    cmd = read('commands/write-prd.md');
    linter = read('agents/prd-linter.md');
    pm = read('agents/product-manager.md');
    assembler = read('agents/context-bundle-assembler.md');
    init = read('commands/init.md');
    plan = read('commands/write-implementation-plan.md');
    docStore = read('agents/notion-document-store.md');
    cfg = await loadDefaultsYaml();
    cfgText = loadDefaultsYamlText();
  });

  describe('Work items are linked back into the plan table', () => {
    let wip: string;
    let scribe: string;
    let linter: string;
    beforeAll(() => {
      wip = read('commands/write-implementation-plan.md');
      scribe = read('agents/plan-scribe.md');
      linter = read('agents/plan-linter.md');
    });

    it('renders each task cell as a link to its work item', () => {
      expect(wip).toMatch(/Link each task row back into the plan table/);
      expect(wip).toMatch(/Task cell as a markdown link/);
    });

    it('links the title rather than adding a column', () => {
      expect(wip).toMatch(/\*\*Link the title; do not add a column\.\*\*/);
    });

    it('cites the pinned header and the baseline as the reason', () => {
      // A new column would ripple into plan-linter, both templates, the
      // implementation-plan tests, and a pre-change baseline — editing which
      // would defeat its purpose and mean the disabled path changed.
      expect(wip).toMatch(/pinned as CRITICAL by `plan-linter`/);
      expect(wip).toMatch(/notion-baseline-snapshots\.test\.ts/);
      expect(wip).toContain('FR-NB2');
    });

    it('the header really is pinned in all four places', () => {
      const header = '| # | Task | Complexity | Dependencies | Status |';
      expect(linter).toContain(header);
      expect(read('agents/product-manager.md')).toContain(header);
      expect(wip).toContain(header);
    });

    it('degrades to plain text without a tracker', () => {
      expect(wip).toMatch(/the cell stays plain text and the filesystem plan is byte-identical/);
    });

    it('leaves ordinal-based dependency references alone', () => {
      expect(wip).toMatch(/those cite ordinals \(`Task 1`\) rather than titles/);
    });

    it('creates rows before writing the plan, so one write suffices', () => {
      expect(wip).toMatch(/\*\*Create the rows before writing the final plan\*\*/);
      expect(wip).toMatch(/rather than requiring a follow-up patch/);
    });

    it('plan-scribe preserves the link when rewording a task', () => {
      expect(scribe).toMatch(/^### Preserve work-item links in task cells$/m);
      expect(scribe).toMatch(/keep the link and retarget only the label/);
      expect(scribe).toMatch(/Never strip the link/);
    });

    it('plan-scribe never fabricates a link', () => {
      // A made-up row id points at nothing, or at some other row.
      expect(scribe).toMatch(/never invent one for a task that has none/);
      expect(scribe).toMatch(/fabricated row id points at nothing/);
    });

    it('plan-scribe reports a new task as structural so a row can be created', () => {
      expect(scribe).toMatch(/has no work item yet and correctly has no link/);
    });

    it('plan-scribe lists link preservation in its behavioral rules', () => {
      const rules = scribe.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Preserve work-item links/);
    });

    it('plan-scribe rules are contiguously numbered', () => {
      // This list has been mis-renumbered twice while being edited.
      const rules = scribe.split('## Behavioral Rules')[1]?.split('\n---')[0] ?? '';
      const nums = [...rules.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
    });
  });

  describe('Registration', () => {
    it('command and agent files exist', () => {
      expect(existsSync(join(PLUGIN, 'commands/write-prd.md'))).toBe(true);
      expect(existsSync(join(PLUGIN, 'agents/prd-linter.md'))).toBe(true);
    });

    it('both are registered in the manifest', () => {
      const m = JSON.parse(read('.claude-plugin/plugin.json'));
      expect(m.commands).toContain('./commands/write-prd.md');
      expect(m.agents).toContain('./agents/prd-linter.md');
    });

    it('skill wrappers were generated', () => {
      for (const slug of ['write-prd', 'prd-linter']) {
        expect(existsSync(join(PLUGIN, 'skills', slug, 'SKILL.md'))).toBe(true);
      }
    });

    it('write-prd precedes write-implementation-plan in the manifest', () => {
      // Authoring order: a plan consumes a PRD, so the PRD command comes first.
      const m = JSON.parse(read('.claude-plugin/plugin.json'));
      expect(m.commands.indexOf('./commands/write-prd.md')).toBeLessThan(
        m.commands.indexOf('./commands/write-implementation-plan.md'),
      );
    });
  });

  describe('Sources change the interview rather than replacing it', () => {
    it('states the commitment up front', () => {
      expect(cmd).toMatch(
        /source documents change what the interview is about; they do not replace it/i,
      );
    });

    it('accepts repeatable --from taking paths, globs, dirs, and URLs', () => {
      expect(cmd).toMatch(/`--from <path>`/);
      expect(cmd).toMatch(/Repeatable/);
      expect(cmd).toMatch(/a file, a glob, a directory, a URL, or a Notion page URL/);
    });

    it('auto-discovers repo sources before asking for any', () => {
      // "No flags" must not mean "blank prompt" — the repo is a source set.
      expect(cmd).toMatch(/Auto-discover first/);
      for (const f of ['README.md', 'CLAUDE.md', 'package.json', 'docs/specs/']) {
        expect(cmd, `auto-discovery omits ${f}`).toContain(f);
      }
    });

    it('never asks what it can read from the codebase', () => {
      expect(cmd).toMatch(/never ask what you can read/);
    });

    it('delegates reading to the bundle assembler rather than reimplementing it', () => {
      expect(cmd).toMatch(/context-bundle-assembler/);
      expect(cmd).toMatch(/max_source_bytes/);
    });

    it('sets expectations differently with and without sources', () => {
      expect(cmd).toMatch(/I'll draft from these and ask only about\s+what they don't settle/);
      expect(cmd).toMatch(/This will be a longer interview/);
    });

    it('teaches --from at the moment it is relevant', () => {
      expect(cmd).toMatch(/This is where `--from` gets taught/);
    });

    it('refuses to silently proceed past an unreadable source', () => {
      expect(cmd).toMatch(/If a supplied source cannot be read/);
      expect(cmd).toMatch(/Do not silently proceed/);
    });
  });

  describe('The epic reference has an origin', () => {
    // Before this, nothing created the reference: write-prd said "resolve the
    // epic_page doc type" without saying how, and write-implementation-plan
    // read it from a line it then set itself. Every artifact inherited from
    // something nothing produced.
    let wip: string;
    beforeAll(() => {
      wip = read('commands/write-implementation-plan.md');
    });

    it('write-prd declares itself the origin', () => {
      expect(cmd).toMatch(/\*\*This command originates the epic reference\.\*\*/);
      expect(cmd).toMatch(/nothing upstream can supply it/);
    });

    it('takes an --epic parameter', () => {
      expect(cmd).toMatch(/`--epic <url\\\|id>`/);
    });

    it('resolves in a stated order, ending in asking', () => {
      const step = cmd.split('#### 1a. Resolve the epic')[1]?.split('#### 1b.')[0] ?? '';
      expect(step).toMatch(/`--epic`, when supplied/);
      expect(step).toMatch(/existing PRD's `\*\*Epic:\*\*` link/);
      expect(step).toMatch(/`notion\.epic\.value` from config/);
      expect(step).toMatch(/\*\*Ask\.\*\*/);
    });

    it('never auto-selects, even on a single match', () => {
      expect(cmd).toMatch(/Never auto-select, even on a single match/);
    });

    it('verifies the epic by fetching it before proceeding', () => {
      expect(cmd).toMatch(/Verify the resolved epic by fetching it/);
      expect(cmd).toMatch(/rather than proceeding with an unverified anchor/);
    });

    it('records it in the PRD so the plan inherits it', () => {
      expect(cmd).toMatch(/is written into the PRD as its `\*\*Epic:\*\*` link/);
      expect(cmd).toMatch(/that record is how `write-implementation-plan` learns which epic/);
    });

    it('the plan reads it from the PRD rather than re-asking', () => {
      expect(wip).toMatch(/Resolve the epic from \*\*the PRD's\*\* `\*\*Epic:\*\*` link/);
      expect(wip).toMatch(/\*\*Copy the epic reference onto the plan\.\*\*/);
      expect(wip).toMatch(/rather than asking the user/);
    });

    it('explains why re-asking is the hazard', () => {
      expect(wip).toMatch(
        /re-asking something already recorded is how two artifacts end up pointing at different epics/,
      );
    });

    it('the plan asks only when the PRD has no link', () => {
      expect(wip).toMatch(/Ask the user only when the PRD has no `\*\*Epic:\*\*` link/);
    });

    it('does not apply under the filesystem backend', () => {
      expect(cmd).toMatch(/Under `filesystem` this step does not apply — there is no epic/);
    });
  });

  describe('Discovery precedes specification', () => {
    it('command establishes the why before requirements', () => {
      expect(cmd).toMatch(/^### 5\. Establish the Why$/m);
      expect(cmd).toMatch(/^#### 5c\. Author it through discovery$/m);
      expect(cmd).toMatch(/prerequisite for requirements/);
    });

    it('establishes the epic page sections', () => {
      for (const t of ['Why this exists', "How we'll know it worked", 'Out of scope']) {
        expect(pm, `epic page template omits ${t}`).toContain(t);
      }
    });

    it('states where discovery output lands per backend', () => {
      expect(cmd).toMatch(/\*\*Where it lands depends on the backend\.\*\*/);
      expect(cmd).toMatch(/there is no landing page/);
    });

    it('has a floor that stops rather than drafting on nothing', () => {
      // The anti-slop floor: no sources plus no answers means there is nothing
      // to write a PRD from.
      expect(cmd).toMatch(/\*\*Floor condition\.\*\*/);
      expect(cmd).toMatch(/\*\*stop and report what is missing\.\*\* Do not draft/);
      expect(cmd).toMatch(/failure this command exists to prevent/);
    });

    it('product-manager carries the same floor', () => {
      expect(pm).toMatch(/^## Discovery Before Specification$/m);
      expect(pm).toMatch(/If you cannot establish vision, users, and at least one scope boundary, stop/);
      expect(pm).toMatch(/becomes a feature list/);
    });

    it('offers deepening techniques rather than interrogating', () => {
      for (const t of ['Pre-mortem', 'Negative space', 'Socratic', 'Inversion']) {
        expect(pm, `techniques omit ${t}`).toContain(t);
      }
      expect(pm).toMatch(/Offer them as options rather than interrogating/);
    });

    it('--epic-only stops once the epic page is established', () => {
      expect(cmd).toMatch(/`--epic-only`/);
      expect(cmd).toMatch(/\*\*If `--epic-only`:\*\* stop here/);
    });

    it('--epic-only reports rather than writing a file on the filesystem', () => {
      // There is no landing page in a repo, so there is nothing for it to write.
      expect(cmd).toMatch(/`--epic-only` is not applicable and should report as much rather than writing a file nobody opens/);
    });
  });

  describe('Provenance is required and blocking', () => {
    it('product-manager defines all four tags with a required source line', () => {
      expect(pm).toMatch(/^## Provenance Tagging$/m);
      for (const t of TAGS) {
        expect(pm, `PM omits ${t}`).toContain(t);
      }
      expect(pm).toMatch(/Sourced/);
      expect(pm).toMatch(/User-stated/);
      expect(pm).toMatch(/Derived/);
      expect(pm).toMatch(/Assumed/);
    });

    it('states why tagging exists at all', () => {
      expect(pm).toMatch(/fabrication is \*\*visible and countable\*\*/);
      expect(pm).toMatch(/mostly `\[A\]` is self-evidently unearned/);
    });

    it('forbids assumptions surviving into a final PRD', () => {
      expect(pm).toMatch(/No `\[A\]` survives into a final PRD/);
    });

    it('forbids invention, routing unknowns to Open Questions', () => {
      expect(pm).toMatch(/Never invent an answer/);
      expect(pm).toMatch(/it goes in Open Questions/);
    });

    it('forbids silently reconciling contradicting sources', () => {
      // The highest-value slop: it looks like a decision was made.
      expect(pm).toMatch(/Never silently reconcile contradicting sources/);
      expect(pm).toMatch(/looks like a decision was made/);
      expect(cmd).toMatch(/never reconcile silently/);
    });

    it('requires a citation to be specific enough to check', () => {
      expect(pm).toMatch(/"From the meeting notes" is not a citation/);
    });

    it('PRD template carries the legend, tags, Source line, and Source Map', () => {
      expect(pm).toMatch(/\*\*Provenance:\*\*/);
      expect(pm).toMatch(/#### FR-\[ID\]: \[Requirement Title\] `\[S\]`/);
      expect(pm).toMatch(/\*\*Source:\*\*/);
      expect(pm).toMatch(/## 9\. Source Map/);
      expect(pm).toMatch(/## 8\. Open Questions/);
      expect(pm).toMatch(/\*\*Epic:\*\*/);
    });
  });

  describe('The epic page is Notion-only', () => {
    it('contract explains the landing-page constraint as its cause', () => {
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/^### The epic page, and why it is Notion-only$/m);
      expect(contract).toMatch(/resolves to the epic row \*\*itself\*\*/);
      expect(contract).toMatch(/`notion\.targets\.epic_page` is meaningless/);
      expect(contract).toMatch(/the page you land on must not be the page that changes fastest/);
    });

    it('does not exist under the filesystem backend', () => {
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/A repository has no landing page/);
      expect(contract).toMatch(/`epic_page` is not a valid `doc_type`/);
    });

    it('leaves no filesystem config key behind', () => {
      // The vestigial documents.brief was a file mirroring a Notion affordance.
      expect(cfg.documents).not.toHaveProperty('brief');
      expect(cfg.documents).not.toHaveProperty('epic_page');
    });

    it('is a patch target, never a write target', () => {
      // A whole-page write would discard body content Synthex did not author.
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/It is a `patch` target, never a `write` target/);
      expect(cmd).toMatch(/always written with `patch`, never `write`/);
    });

    it('document store records the exception in its title table', () => {
      const ds = read('agents/notion-document-store.md');
      expect(ds).toMatch(/resolves to the epic page \*\*itself\*\*, not a subpage/);
      expect(ds).toMatch(/\| \*\*Epic-scoped\*\* \| `epic_page`,/);
      expect(ds).toMatch(/exists only under the `notion` backend/);
    });
  });

  describe('Existing content is refined, never discarded', () => {
    it('treats a populated body as input rather than an obstacle', () => {
      expect(pm).toMatch(/^### Refining a populated epic page$/m);
      expect(pm).toMatch(/it is \*\*input, not an obstacle\.\*\*/);
      expect(cmd).toMatch(/The existing content is input, not an obstacle/);
    });

    it('maps visibly, then asks about gaps and leftovers', () => {
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/\*\*Map\*\*/);
        expect(text).toMatch(/Ask about gaps/);
        expect(text).toMatch(/Ask about leftovers/);
      }
      expect(pm).toMatch(/Mapping is a claim about their writing/);
    });

    it('forbids silently dropping existing content', () => {
      // The failure mode of any standardization pass.
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/Never silently drop existing content/);
      }
      expect(pm).toMatch(/Additional context/);
      expect(pm).toMatch(/not a recoverable mistake/);
    });

    it('does not treat prior Synthex output as a convention', () => {
      // An epic asserting its own authority proves nothing if Synthex wrote it.
      expect(pm).toMatch(/content Synthex itself wrote earlier is not evidence of a convention/i);
      expect(pm).toMatch(/Check provenance before deferring/);
    });

    it('checks for loss rather than assuming none, via prior_content', () => {
      expect(cmd).toMatch(/Pass the original content to the linter as `prior_content`/);
      expect(linter).toMatch(/prior_content/);
      expect(linter).toMatch(/or is listed as raised with the user \| \*\*CRITICAL\*\*/);
    });

    it('says so rather than implying a pass when prior content is absent', () => {
      expect(linter).toMatch(/skip this check and say so in your report rather than implying it passed/);
    });

    it('requires approval before writing back', () => {
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/get approval\*{0,2} before writing/);
      }
    });
  });

  describe('Navigation and freshness in the epic body', () => {
    // Designed against an observed failure: a stakeholder opened an epic,
    // missed the subpages beneath it, and read the body's detail as evidence
    // it was the live plan. It was stale. Detail implied freshness because
    // nothing else carried that signal.
    let np: string;
    let contract: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
      contract = read('agents/_shared/document-store-contract.md');
    });

    it('brief template carries a navigation section', () => {
      expect(pm).toMatch(/^## Where the detail lives$/m);
    });

    it('it sits directly after the problem statement, above the fold', () => {
      const whyPos = pm.indexOf('## Why this exists');
      const navPos = pm.indexOf('## Where the detail lives');
      const measuresPos = pm.indexOf("## How we'll know it worked");
      expect(whyPos).toBeGreaterThan(-1);
      expect(navPos).toBeGreaterThan(whyPos);
      expect(navPos).toBeLessThan(measuresPos);
      expect(pm).toMatch(/above the fold/);
    });

    it('routes to all three live artifacts', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## How we'll know")[0] ?? '';
      expect(nav).toMatch(/Product Requirements/);
      expect(nav).toMatch(/Implementation Plan/);
      expect(nav).toMatch(/Work items/);
    });

    it('each route carries a current-state signal', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## How we'll know")[0] ?? '';
      expect(nav).toMatch(/Current state/);
      expect(nav).toMatch(/updated \d{4}-\d{2}-\d{2}/);
      expect(nav).toMatch(/Phase 2 of 6/);
    });

    it('states the wrong inference not to make, verbatim', () => {
      const disclaimer = 'This page is a summary, not the plan. For current status, follow the links above.';
      expect(pm).toContain(disclaimer);
      expect(cmd).toContain(disclaimer);
      expect(pm).toMatch(/its bluntness is the point/);
    });

    it('marks the section as Synthex-owned', () => {
      expect(pm).toMatch(/Maintained by Synthex — edits here are overwritten/);
    });

    it('records the failure it was designed against', () => {
      for (const [name, text] of [
        ['product-manager', pm],
        ['contract', contract],
        ['write-prd', cmd],
      ] as const) {
        expect(text, `${name} omits the observed failure`).toMatch(
          /stale|did not notice|missed the/i,
        );
      }
      expect(pm).toMatch(/Detail read as freshness/);
    });
  });

  describe('The epic carries before/after diagrams', () => {
    it('the epic template holds a What changes section', () => {
      expect(pm).toMatch(/^## What changes$/m);
    });

    it('holds two mermaid diagrams, today and after — the delta is the point', () => {
      const sec = pm.slice(pm.indexOf('## What changes'), pm.indexOf("## How we'll know it worked"));
      expect(sec).toMatch(/\*\*Today\*\*/);
      expect(sec).toMatch(/\*\*After this epic\*\*/);
      // Two fenced mermaid blocks, not one: a target state alone makes the
      // reader reconstruct the present from memory.
      expect(sec.match(/```mermaid/g) ?? []).toHaveLength(2);
    });

    it('sits after the navigation block so it cannot stop a skim first', () => {
      const nav = pm.indexOf('## Where the detail lives');
      const diagrams = pm.indexOf('## What changes');
      const metrics = pm.indexOf("## How we'll know it worked");
      expect(nav).toBeGreaterThan(-1);
      expect(diagrams).toBeGreaterThan(nav);
      expect(diagrams).toBeLessThan(metrics);
    });

    it('distinguishes milestone attribution from progress', () => {
      expect(pm).toMatch(/\*\*Attribution\*\*/);
      expect(pm).toMatch(/\*\*Progress\*\*/);
      expect(pm).toMatch(/Gateway \(M1\)` is fine and `Gateway \(M1 ✅ shipped\)` is not/);
    });

    it('does not contradict the no-volatile-content rule it sits beside', () => {
      // The exception has to be named where the blanket rule is stated, or the
      // file tells an agent two different things.
      const sec = pm.slice(pm.indexOf('### Phases and other volatile content'));
      expect(sec).toMatch(/sole exception is the milestone \*attribution\*/);
      expect(sec).toMatch(/a phase schedule is still out of bounds/);
    });

    it('requires the today diagram to be grounded, not drawn', () => {
      expect(pm).toMatch(/\*\*A diagram must be earned\.\*\*/);
      expect(pm).toMatch(/Where it cannot be grounded, ask; do not draw/);
      expect(pm).toMatch(/A fabricated architecture diagram is worse than no diagram/);
    });

    it('permits omission when the initiative changes no system shape', () => {
      // A hard requirement here would push toward decorative diagrams.
      expect(pm).toMatch(/\*\*Omit the section when the initiative does not change system shape\.\*\*/);
      expect(linter).toMatch(/\| `## What changes` present \| MEDIUM \|/);
    });

    it('write-prd has a step that draws them', () => {
      expect(cmd).toMatch(/^#### 5e\. Draw the before and after$/m);
      expect(cmd).toMatch(/must be read off something real/);
      expect(cmd).toMatch(/\*\*Milestone labels are attribution, never progress\.\*\*/);
    });

    it('write-prd sub-steps stay contiguous after the insertion', () => {
      const labels = [...cmd.matchAll(/^#### 5([a-z])\./gm)].map((m) => m[1]);
      expect(labels).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('write-implementation-plan owns the milestone labels, since it owns phasing', () => {
      expect(plan).toMatch(/^### 8\.5\. Refresh the Epic's Milestone Attribution \(Notion only\)$/m);
      expect(plan).toMatch(/\*\*Never write progress into these labels\.\*\*/);
      expect(plan).toMatch(/`epic_page` \(\*\*patch\*\*, Notion only/);
    });

    it('write-implementation-plan refuses to invent a diagram from a plan alone', () => {
      const step = plan.slice(plan.indexOf('### 8.5.'), plan.indexOf('### 9. Update Project Files'));
      expect(step).toMatch(/do nothing\. Do not create one/);
      expect(step).toMatch(/drawing one from a plan alone is the fabrication/);
    });

    it('next-priority leaves the diagrams alone, which is what keeps them cheap', () => {
      expect(init).toBeTruthy();
      const np = read('commands/next-priority.md');
      expect(np).toMatch(/\*\*Do not touch the epic's `## What changes` diagrams\.\*\*/);
      expect(np).toMatch(/would put status back on the landing page/);
    });

    it('the adapter preserves the fence language tag mermaid rendering needs', () => {
      expect(docStore).toMatch(/\*\*Fenced code blocks pass through verbatim, language tag included\.\*\*/);
      expect(docStore).toMatch(/^9\. \*\*Never drop or alter a fenced code block's language tag/m);
    });

    it('the filesystem PRD gets the diagrams without renumbering its sections', () => {
      // Nesting under Vision rather than inserting a numbered section: the
      // renumbering hazard is real and the placement is also more correct.
      expect(pm).toMatch(/^### What changes$/m);
      const fsTemplate = pm.slice(
        pm.indexOf('### Filesystem backend — self-contained'),
        pm.indexOf('### Notion backend — requirements'),
      );
      const nums = [...fsTemplate.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
      expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(fsTemplate.indexOf('### What changes')).toBeGreaterThan(fsTemplate.indexOf('## 1. Vision'));
      expect(fsTemplate.indexOf('### What changes')).toBeLessThan(fsTemplate.indexOf('## 2. Target Users'));
    });

    it('no template ships a progress marker an agent could copy', () => {
      // The templates are the most likely vector for a stray checkmark, since
      // an agent pattern-matches them. Only the prose contrast may contain one.
      const epicTemplate = pm.slice(pm.indexOf('## What changes'), pm.indexOf("## How we'll know it worked"));
      expect(epicTemplate).not.toMatch(/✅|✔|shipped|in progress|complete/i);
    });

    it('the linter checks diagram wellformedness without requiring a diagram', () => {
      expect(linter).toMatch(/both a \*\*today\*\* and an \*\*after\*\* diagram \| HIGH \|/);
      expect(linter).toMatch(/fenced ```mermaid block \| HIGH \|/);
      expect(linter).toMatch(/italic basis line \| HIGH \|/);
      expect(linter).toMatch(/No progress marker on a `What changes` diagram label[^|]*\| \*\*CRITICAL\*\* \|/);
      expect(linter).toMatch(/\*\*One exemption, and only one\.\*\*/);
      expect(linter).toMatch(/flagging it is a false positive/);
    });

    it('the standard section set grew to admit it', () => {
      expect(linter).toMatch(/No section beyond the standard five plus `Additional context`/);
      expect(cmd).toMatch(/\*\*Map\*\* it onto the six sections/);
    });

    it('warns that milestone labels must be quoted, which mermaid enforces', () => {
      // Verified against the mermaid parser: `G[Gateway (M1)]` is a syntax
      // error and renders nothing, so adding attribution to a bare label
      // without adding quotes silently destroys the diagram.
      expect(pm).toMatch(/quotes in `"Gateway \(M1\)"` are load-bearing/);
      expect(plan).toMatch(/\*\*Quote any label you add a milestone to\.\*\*/);
      expect(plan).toMatch(/`G\[Gateway \(M1\)\]` is a syntax error/);
    });

    it('the epic template keeps its code fences balanced', () => {
      // The template is a fenced markdown block containing fenced mermaid
      // blocks. Adding prose inside it splits the outer fence, which reads as
      // two templates with commentary between them.
      const sec = pm.slice(
        pm.indexOf('## Epic Page Structure'),
        pm.indexOf('### Why the navigation block'),
      );
      expect(sec.match(/```markdown/g) ?? []).toHaveLength(1);
      expect(sec.match(/```mermaid/g) ?? []).toHaveLength(2);
      // 1 markdown open + 2 mermaid open + 2 mermaid close + 1 markdown close
      expect(sec.match(/```/g) ?? []).toHaveLength(6);
    });

    it('names the same section identically everywhere it appears', () => {
      for (const f of [pm, cmd, linter, plan, read('commands/next-priority.md')]) {
        expect(f).toMatch(/What changes/);
        expect(f).not.toMatch(/## (?:Before and after|System shape|What's changing)/);
      }
    });
  });

  describe('Volatile content is excluded from the epic body', () => {
    it('states the rule as a testable predicate', () => {
      expect(pm).toMatch(/^### Phases and other volatile content$/m);
      expect(pm).toMatch(/do \*\*not\*\* belong on the epic page/);
    });

    it('names the consequence of breaking it', () => {
      expect(pm).toMatch(/putting them on the landing page is the failure above/);
    });

    it('carves out the navigation block as the sole exception', () => {
      expect(cmd).toMatch(/only volatile content permitted in an epic body/);
      expect(pm).toMatch(/Never strip such content without a verified destination/);
    });

    it('requires a verified destination before relocating', () => {
      // The rule previously named an exit without an entrance, which on a real
      // project would have deleted the only copy of Phases 2-6.
      for (const [name, text] of [['product-manager', pm], ['write-prd', cmd]] as const) {
        expect(text, `${name} omits the destination requirement`).toMatch(
          /verified destination|Relocation requires a destination/,
        );
      }
      expect(cmd).toMatch(/Naming an exit without an entrance is prescribed data loss/);
      expect(pm).toMatch(/report the required sequence and stop/);
    });

    it('names the plan as the destination, at two resolutions', () => {
      expect(pm).toMatch(/all phases named with their outcome, and only committed phases decomposed/);
      expect(pm).toMatch(/Detail follows commitment/);
    });

    it('linter flags volatile content outside the navigation block as CRITICAL', () => {
      expect(linter).toMatch(
        /No status, date, count, task, or milestone outside `## Where the detail lives` \| \*\*CRITICAL\*\*/,
      );
    });

    it('linter reports misplaced content rather than relocating it', () => {
      expect(linter).toMatch(/Do not move it yourself; report it/);
      expect(linter).toMatch(/the artifact it belongs in/);
    });

    it('linter treats a missing navigation section as CRITICAL', () => {
      expect(linter).toMatch(/`## Where the detail lives` present \| \*\*CRITICAL\*\*/);
    });

    it('write-prd redirects volatile discovery output rather than filing it', () => {
      expect(cmd).toMatch(/\*\*Everything else on the epic page must be non-volatile\.\*\*/);
      expect(cmd).toMatch(/say so rather than filing it here/);
    });
  });

  describe('next-priority keeps the freshness block current', () => {
    let np: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
    });

    it('refreshes it at the end of the run', () => {
      expect(np).toMatch(/Refresh the epic's navigation block once, at the end of the run/);
    });

    it('updates phase, counts, and dates', () => {
      expect(np).toMatch(/updating the phase, the done\/total task counts/);
    });

    it('is once per run, not per task', () => {
      // A write per status transition churns page history for no added signal.
      expect(np).toMatch(/\*\*Once per run, not per task\.\*\*/);
      expect(np).toMatch(/churn the page history for no added signal/);
    });

    it('updates even when the run ends with work outstanding', () => {
      // A partially-finished run is when someone is most likely to look.
      expect(np).toMatch(/including when the run ends with tasks still open/);
      expect(np).toMatch(/most likely to go looking/);
    });

    it('patches rather than replacing the body', () => {
      expect(np).toMatch(/Use `patch`, never `write`: the rest of the body is the team's/);
    });

    it('explains why keeping it current is not cosmetic', () => {
      expect(np).toMatch(/makes staleness visible instead of invisible/);
    });
  });

  describe('PRD has two shapes, one per backend', () => {
    it('documents both shapes and why they differ', () => {
      expect(pm).toMatch(/^### Filesystem backend — self-contained$/m);
      expect(pm).toMatch(/^### Notion backend — requirements, with the why on the epic page$/m);
      expect(pm).toMatch(
        /the same information placed where that backend's readers actually arrive/,
      );
    });

    it('filesystem shape keeps the why sections', () => {
      const fs = pm.split('### Filesystem backend')[1]?.split('### Notion backend')[0] ?? '';
      for (const s of ['Vision & Purpose', 'Target Users', 'Out of Scope', 'Success Metrics']) {
        expect(fs, `filesystem shape omits ${s}`).toContain(s);
      }
    });

    it('notion shape drops exactly the three moved sections', () => {
      const nt = pm.split('### Notion backend — requirements')[1] ?? '';
      const shape = nt.split('```')[1] ?? '';
      for (const gone of ['Vision & Purpose', 'Out of Scope', 'Success Metrics']) {
        expect(shape, `notion shape still contains ${gone}`).not.toContain(gone);
      }
    });

    it('keeps Target Users in the PRD under both shapes', () => {
      // The epic page carries the audience as a clause; detailed personas are
      // requirements context. This is what dissolves the overlap a real run hit.
      const nt = pm.split('### Notion backend — requirements')[1] ?? '';
      expect(nt).toMatch(/\*\*Target Users stays here\*\*/);
      expect(nt.split('```')[1] ?? '').toContain('Target Users');
    });

    it('notion shape opens with an Epic link', () => {
      expect(pm).toMatch(/\*\*Epic:\*\* \[link to the epic page\]/);
    });

    it('accepts the not-readable-alone cost only for the notion shape', () => {
      expect(pm).toMatch(/a PRD is not readable alone, and that is the accepted cost/);
      expect(pm).toMatch(/one authoritative home per fact/);
    });

    it('linter conditions the shape on epic_page_present', () => {
      expect(linter).toMatch(/epic_page_present/);
      expect(linter).toMatch(/When `epic_page_present`: no Vision, Out of Scope, or Success Metrics section/);
      expect(linter).toMatch(/When `epic_page_present` is false: Vision, Out of Scope, and Success Metrics all present/);
    });

    it('linter requires Target Users under either shape', () => {
      expect(linter).toMatch(/present under \*\*either\*\* shape/);
    });

    it('command passes the shape flag to the linter', () => {
      expect(cmd).toMatch(/`epic_page_present` so it applies the right shape/);
    });

    it('command tells the PM not to re-ask what discovery settled', () => {
      expect(cmd).toMatch(/Do \*\*not\*\* re-ask what discovery already answered/);
    });
  });

  describe('PRD Linter', () => {
    it('is Haiku-backed and runs once per draft', () => {
      expect(linter).toMatch(/^model: haiku$/m);
      expect(linter).toMatch(/run exactly once per draft/);
    });

    it('separates the structural audit from the provenance audit', () => {
      expect(linter).toMatch(/\*\*Structural audit\*\*/);
      expect(linter).toMatch(/\*\*Provenance audit\*\*/);
    });

    it('explains why the provenance audit is the reason it exists', () => {
      expect(linter).toMatch(
        /perfectly structured and entirely fabricated; only the provenance check distinguishes the two/,
      );
    });

    it('raises an unconfirmed assumption as CRITICAL by default', () => {
      expect(linter).toMatch(/No `\[A\]` tag remains, under the default blocking policy \| \*\*CRITICAL\*\*/);
    });

    it('requires a source line as evidence for the tag', () => {
      expect(linter).toMatch(/The tag is a claim; the source line is the evidence/);
    });

    it('catches a citation to a source that was never supplied', () => {
      expect(linter).toMatch(/citation to an input that was never supplied is unverifiable/);
      expect(linter).toMatch(/fabricated citation/);
    });

    it('requires Out of Scope to be non-empty', () => {
      expect(linter).toMatch(/`## Out of scope` present and \*\*non-empty\*\*/);
    });

    it('leads its report with the provenance summary', () => {
      expect(linter).toMatch(/^## Provenance Summary$/m);
      expect(linter).toMatch(/provenance summary goes first/);
    });

    it('never edits, never fills a gap, never judges quality', () => {
      const rules = linter.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never edit the PRD/);
      expect(rules).toMatch(/Never supply a missing tag, source line, or requirement/);
      expect(rules).toMatch(/Never judge requirement quality/);
      expect(rules).toMatch(/A gap you fill is a gap nobody notices/);
    });

    it('honors the warn policy without downgrading silently', () => {
      expect(linter).toMatch(/Never downgrade it silently/);
    });
  });

  describe('Reuses the existing quality pipeline', () => {
    it('lints before expensive reviewers, with the reason stated', () => {
      expect(cmd).toMatch(/^### 8\. Lint the PRD$/m);
      expect(linter).toMatch(/cheap enough to run before the expensive reviewers/);
    });

    it('hands off to refine-requirements rather than adding a review stack', () => {
      expect(cmd).toMatch(/\/synthex:refine-requirements/);
    });

    it('resolves every CRITICAL including unconfirmed assumptions', () => {
      expect(cmd).toMatch(/must resolve \*\*every CRITICAL\*\*/);
      expect(cmd).toMatch(/confirming it with the user, grounding it in a source, or demoting it to an Open Question/);
    });

    it('surfaces provenance counts to the user at the end', () => {
      expect(cmd).toMatch(/Surfacing the provenance counts is the point of tagging/);
    });
  });

  describe('Does not clobber an existing PRD', () => {
    it('decides what the run is doing before touching anything', () => {
      expect(cmd).toMatch(/^### 1\. Decide What This Run Is Doing$/m);
      expect(cmd).toMatch(/do \*\*not\*\* overwrite it/);
      expect(cmd).toMatch(/Write a sub-PRD/);
    });

    it('requires named confirmation for the destructive option', () => {
      expect(cmd).toMatch(/destructive and its confirmation must name the file/);
      expect(cmd).toMatch(/never take it as a default/i);
    });

    it('branches on what actually exists rather than on the PRD alone', () => {
      const step = cmd.split('### 1. Decide What This Run Is Doing')[1]?.split('### 2.')[0] ?? '';
      expect(step).toMatch(/\| Epic page \| PRD \| Action \|/);
      expect(step).toMatch(/absent or n\/a \| absent/);
    });
  });

  describe('Regenerating the epic on an established project', () => {
    // The question this closes: a project whose PRD and plan already exist,
    // whose epic body has drifted or was never standardized.
    let np: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
    });

    it('--epic-only bypasses the PRD gate entirely', () => {
      // Previously Step 1 ran unconditionally, so asking for just the brief
      // prompted about the PRD, and none of the options was "just the brief".
      expect(cmd).toMatch(/If `--epic-only` is set, skip the PRD entirely/);
      expect(cmd).toMatch(/it is not this run's concern/);
    });

    it('names the established-project case explicitly', () => {
      expect(cmd).toMatch(
        /standardizing or refreshing an epic on a project whose PRD and plan already exist/,
      );
    });

    it('surfaces the refresh option where a user would look for it', () => {
      expect(cmd).toMatch(/\*\*Refresh the epic page\*\*/);
      expect(cmd).toMatch(/Leaves the PRD alone/);
      expect(cmd).toMatch(/discoverable from the command you would naturally reach for/);
    });

    it('next-priority does not inject a block into a free-form body', () => {
      expect(np).toMatch(/\*\*When the section does not exist\*\*/);
      expect(np).toMatch(/do not inject it/);
      expect(np).toMatch(/Run \/synthex:write-prd --epic-only to standardize it/);
    });

    it('explains why restructuring belongs to write-prd, not to a task run', () => {
      expect(np).toMatch(/where the user is present to approve the mapping/);
      expect(np).toMatch(/a task-execution command is the wrong place to make that call/);
    });

    it('inserts the block only into an already-standard body', () => {
      expect(np).toMatch(/Insert it only when the body is already in standard epic-page shape/);
      expect(np).toMatch(/directly after `## Why this exists`/);
    });
  });

  describe('Source-set mode in the bundle assembler', () => {
    it('is additive — artifact mode is unchanged', () => {
      expect(assembler).toMatch(/required unless `sources` is supplied/);
      expect(assembler).toMatch(/Supplies `artifact_path`; never `sources`/);
      expect(assembler).toMatch(/Supplies `sources`; never `artifact_path`/);
    });

    it('treats the two modes as mutually exclusive', () => {
      expect(assembler).toMatch(/mutually exclusive/);
      expect(assembler).toMatch(/both or neither is a caller error/);
    });

    it('may summarize sources but never the artifact', () => {
      expect(assembler).toMatch(/\*\*sources may be summarized\*\*/);
      expect(assembler).toMatch(/Never summarize in artifact mode/);
    });

    it('records unreadable sources rather than dropping them', () => {
      expect(assembler).toMatch(/Never silently drop a source/);
      expect(assembler).toMatch(/"status": "unreadable"/);
    });

    it('is deterministic in ordering', () => {
      expect(assembler).toMatch(/deterministic across runs/);
    });
  });

  describe('Configuration', () => {
    it('defines the prd block with blocking assumptions by default', () => {
      expect(cfg.prd).toEqual({
        max_source_bytes: 200000,
        max_file_bytes: 40000,
        assumption_policy: 'blocking',
      });
    });

    it('documents why blocking is the default', () => {
      expect(cfgText).toMatch(
        /indistinguishable from a fabricated one to whoever\s*#?\s*builds from it/,
      );
    });

    it('documents every prd subkey with an inline comment', () => {
      const lines = cfgText.split('\n');
      for (const key of ['max_source_bytes:', 'max_file_bytes:', 'assumption_policy:']) {
        const idx = lines.findIndex((l) => l.trimStart().startsWith(key));
        expect(idx, `missing ${key}`).toBeGreaterThan(0);
        expect(lines.slice(Math.max(0, idx - 10), idx).join('\n')).toMatch(/#/);
      }
    });
  });

  describe('init points at the right command', () => {
    it('no longer claims write-implementation-plan creates a PRD', () => {
      // The previous text sent new users to a command that only reads a PRD.
      expect(init).not.toMatch(/Create your PRD with the `write-implementation-plan` command/);
    });

    it('directs users to write-prd and teaches --from', () => {
      expect(init).toMatch(/Create your PRD:\s+\/write-prd/);
      expect(init).toMatch(/Pass --from <paths>/);
    });

    it('lists write-prd among available commands', () => {
      expect(init).toMatch(/\/write-prd\s+— Author a PRD/);
    });
  });

  describe('Notion backend integration', () => {
    it('wires through the document-store contract', () => {
      expect(cmd).toMatch(/^## Document Backend$/m);
      expect(cmd).toContain('../docs/document-backends.md');
      expect(cmd).toMatch(/skip this section entirely/);
      expect(cmd).toContain('FR-NB2');
    });

    it('places the PRD as the epic Product Requirements subpage', () => {
      expect(cmd).toMatch(/`Product Requirements` subpage of its epic/);
      expect(cmd).toMatch(/schema_mismatch/);
    });

    it('accepts Notion pages as source material', () => {
      expect(cmd).toMatch(/`--from` accepts Notion page URLs/);
    });

    it('creates rather than overwrites', () => {
      expect(cmd).toMatch(/use `create`, not `write`/);
    });
  });
});
