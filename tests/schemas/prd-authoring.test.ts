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
    it('command runs a discovery step', () => {
      expect(cmd).toMatch(/^### 5\. Discovery$/m);
    });

    it('establishes vision, users, value, and a scope boundary', () => {
      for (const t of ['Vision', 'Users', 'Value', 'Scope boundary']) {
        expect(cmd, `discovery omits ${t}`).toContain(t);
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

    it('--brief-only stops after discovery and writes a usable artifact', () => {
      expect(cmd).toMatch(/`--brief-only`/);
      expect(cmd).toMatch(/The brief is a legitimate standalone artifact/);
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
      expect(linter).toMatch(/`## 5\. Out of Scope` present and \*\*non-empty\*\*/);
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
      expect(cmd).toMatch(/^### 8\. Lint$/m);
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
    it('checks first and offers refine / sub-PRD / replace', () => {
      expect(cmd).toMatch(/^### 1\. Check for an Existing PRD$/m);
      expect(cmd).toMatch(/do \*\*not\*\* overwrite it/);
      expect(cmd).toMatch(/Write a sub-PRD/);
    });

    it('requires named confirmation for the destructive option', () => {
      expect(cmd).toMatch(/destructive and the confirmation must name the file/);
      expect(cmd).toMatch(/Never take it as a default/);
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
