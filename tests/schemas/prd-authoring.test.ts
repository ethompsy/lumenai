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
  let cfg: any;
  let cfgText: string;

  beforeAll(async () => {
    cmd = read('commands/write-prd.md');
    linter = read('agents/prd-linter.md');
    pm = read('agents/product-manager.md');
    assembler = read('agents/context-bundle-assembler.md');
    init = read('commands/init.md');
    cfg = await loadDefaultsYaml();
    cfgText = loadDefaultsYamlText();
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

  describe('Discovery precedes specification', () => {
    it('command establishes the brief before requirements', () => {
      expect(cmd).toMatch(/^### 5\. Establish the Brief$/m);
      expect(cmd).toMatch(/^#### 5c\. Author it through discovery$/m);
      expect(cmd).toMatch(/prerequisite for requirements/);
    });

    it('establishes the five brief sections', () => {
      for (const t of ['Problem', "Who it's for", 'What changes', 'Out of scope', "How we'll know"]) {
        expect(pm, `brief template omits ${t}`).toContain(t);
      }
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

    it('--brief-only stops once the brief is established', () => {
      expect(cmd).toMatch(/`--brief-only`/);
      expect(cmd).toMatch(/\*\*If `--brief-only`:\*\* stop here/);
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
      expect(pm).toMatch(/## 5\. Source Map/);
      expect(pm).toMatch(/## 4\. Open Questions/);
      expect(pm).toMatch(/\*\*Brief:\*\*/);
    });
  });

  describe('The brief is the epic body', () => {
    it('contract makes brief epic-scoped and resolving to the page itself', () => {
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/^### The brief is the epic's own body$/m);
      expect(contract).toMatch(/resolves to the epic page \*\*itself\*\*/);
      expect(contract).toMatch(/`notion\.targets\.brief` is meaningless/);
    });

    it('is a patch target, never a write target', () => {
      // A whole-page write would discard body content Synthex did not author.
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/It is a `patch` target, never a `write` target/);
      expect(cmd).toMatch(/always written with `patch`, never `write`/);
    });

    it('document store records the exception in its title table', () => {
      const ds = read('agents/notion-document-store.md');
      expect(ds).toMatch(/`brief` resolves to the epic page \*\*itself\*\*/);
      expect(ds).toMatch(/\| \*\*Epic-scoped\*\* \| `brief`,/);
    });

    it('config documents the epic-body mapping', () => {
      expect(cfgText).toMatch(/this is the epic's OWN BODY rather than a\s*#?\s*file/);
      expect(cfg.documents.brief).toBe('docs/reqs/brief.md');
    });
  });

  describe('Existing content is refined, never discarded', () => {
    it('treats a populated body as input rather than an obstacle', () => {
      expect(pm).toMatch(/^### Refining a populated body$/m);
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
      const problemPos = pm.indexOf('## Problem');
      const navPos = pm.indexOf('## Where the detail lives');
      const whoPos = pm.indexOf("## Who it's for");
      expect(problemPos).toBeGreaterThan(-1);
      expect(navPos).toBeGreaterThan(problemPos);
      expect(navPos).toBeLessThan(whoPos);
      expect(pm).toMatch(/above the fold/);
    });

    it('routes to all three live artifacts', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## Who it's for")[0] ?? '';
      expect(nav).toMatch(/Product Requirements/);
      expect(nav).toMatch(/Implementation Plan/);
      expect(nav).toMatch(/Work items/);
    });

    it('each route carries a current-state signal', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## Who it's for")[0] ?? '';
      expect(nav).toMatch(/Current state/);
      expect(nav).toMatch(/updated \d{4}-\d{2}-\d{2}/);
      expect(nav).toMatch(/Phase 2 of 3/);
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

  describe('Volatile content is excluded from the epic body', () => {
    it('states the rule as a testable predicate', () => {
      expect(pm).toMatch(/^### The volatile-content rule$/m);
      expect(pm).toMatch(
        /If it has a status, a date, a count, or a task, it does not belong in the epic body/,
      );
    });

    it('names the consequence of breaking it', () => {
      expect(pm).toMatch(/age into a confident-looking lie/);
    });

    it('carves out the navigation block as the sole exception', () => {
      expect(pm).toMatch(/The one exception is the navigation block, which is volatile \*\*by design\*\*/);
      expect(cmd).toMatch(/only volatile content permitted in an epic body/);
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
      expect(cmd).toMatch(/\*\*Everything else in the brief must be non-volatile\.\*\*/);
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

  describe('PRD no longer duplicates the brief', () => {
    it('template opens with a Brief link instead of restating it', () => {
      expect(pm).toMatch(/\*\*Brief:\*\* \[link to the epic/);
      expect(pm).toMatch(/It does \*not\* restate the vision, the users, the scope boundary, or the success metrics/);
    });

    it('template has no vision/users/scope/metrics sections', () => {
      const tmpl = pm.split('## PRD Structure (Default Template)')[1]?.split('```\n\n**A PRD')[0] ?? '';
      for (const gone of ['Vision & Purpose', 'Target Users', 'Out of Scope', 'Success Metrics']) {
        expect(tmpl, `PRD template still contains ${gone}`).not.toContain(gone);
      }
    });

    it('accepts the cost of not being self-contained, explicitly', () => {
      expect(pm).toMatch(/\*\*A PRD is not readable alone, by design\.\*\*/);
      expect(pm).toMatch(/nothing is duplicated, so nothing can drift/);
    });

    it('linter flags a PRD that reintroduces those sections', () => {
      expect(linter).toMatch(/No Vision \/ Users \/ Out of Scope \/ Success Metrics section/);
    });

    it('linter requires the Brief reference', () => {
      expect(linter).toMatch(/`\*\*Brief:\*\*` reference present/);
      expect(linter).toMatch(/deliberately not self-contained/);
    });

    it('command tells the PM not to re-ask what the brief settled', () => {
      expect(cmd).toMatch(/Do \*\*not\*\* re-ask what the brief already answers/);
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
      expect(step).toMatch(/\| Brief \| PRD \| Action \|/);
      expect(step).toMatch(/absent \| absent/);
    });
  });

  describe('Regenerating the epic on an established project', () => {
    // The question this closes: a project whose PRD and plan already exist,
    // whose epic body has drifted or was never standardized.
    let np: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
    });

    it('--brief-only bypasses the PRD gate entirely', () => {
      // Previously Step 1 ran unconditionally, so asking for just the brief
      // prompted about the PRD, and none of the options was "just the brief".
      expect(cmd).toMatch(/If `--brief-only` is set, skip the PRD entirely/);
      expect(cmd).toMatch(/it is not this run's concern/);
    });

    it('names the established-project case explicitly', () => {
      expect(cmd).toMatch(
        /standardizing or refreshing an epic on a project whose PRD and plan already exist/,
      );
    });

    it('surfaces the refresh option where a user would look for it', () => {
      expect(cmd).toMatch(/\*\*Refresh the epic brief\*\*/);
      expect(cmd).toMatch(/Leaves the PRD alone/);
      expect(cmd).toMatch(/discoverable from the command you would naturally reach for/);
    });

    it('next-priority does not inject a block into a free-form body', () => {
      expect(np).toMatch(/\*\*When the section does not exist\*\*/);
      expect(np).toMatch(/do not inject it/);
      expect(np).toMatch(/Run \/synthex:write-prd --brief-only to standardize it/);
    });

    it('explains why restructuring belongs to write-prd, not to a task run', () => {
      expect(np).toMatch(/where the user is present to approve the mapping/);
      expect(np).toMatch(/a task-execution command is the wrong place to make that call/);
    });

    it('inserts the block only into an already-standard body', () => {
      expect(np).toMatch(/Insert it only when the body is already in standard brief shape/);
      expect(np).toMatch(/directly after `## Problem`/);
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
