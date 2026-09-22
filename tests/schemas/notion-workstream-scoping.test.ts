/**
 * FR-NB4: workstream scoping — the multi-team safety guarantee.
 *
 * Synthex writes task rows into a Notion database that already holds other
 * teams' work. Every query must filter on the workstream property and every
 * write must verify it first, or Synthex can read and mutate tickets that
 * aren't its own. That failure is silent: nobody finds out until a ticket
 * someone else owns has the wrong status.
 *
 * This suite asserts the guarantee is stated at every point where an
 * implementer could omit it, and that no escape hatch is documented anywhere.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

describe('FR-NB4: workstream scoping', () => {
  let contract: string;
  let taskStore: string;
  let wizard: string;

  beforeAll(() => {
    contract = read('agents/_shared/document-store-contract.md');
    taskStore = read('agents/notion-task-store.md');
    wizard = read('commands/configure-notion.md');
  });

  describe('Contract states the guarantee normatively', () => {
    it('has a dedicated workstream scoping section citing FR-NB4', () => {
      expect(contract).toMatch(/^## 4\. Workstream scoping \(FR-NB4\)$/m);
    });

    it('marks the requirement non-negotiable', () => {
      expect(contract).toMatch(/Normative and non-negotiable/);
    });

    it('requires create-time stamping, query filtering, and pre-write verification', () => {
      expect(contract).toMatch(/MUST be stamped with the configured workstream value/);
      expect(contract).toMatch(/MUST filter on the workstream property/);
      expect(contract).toMatch(/MUST verify the target row carries the configured workstream value before writing/);
    });

    it('requires refusal rather than an unscoped fallback', () => {
      expect(contract).toMatch(/MUST refuse to operate against a shared database/);
      expect(contract).toMatch(/never\*{0,2} an acceptable degradation/i);
    });

    it('exempts the filesystem backend explicitly', () => {
      // Without this, an implementer might add pointless scoping machinery to
      // the local-markdown path, or worse, block it.
      expect(contract).toMatch(/filesystem.*backend.*workstream scoping is a no-op/is);
    });
  });

  describe('Task store enforces it before any I/O', () => {
    it('runs the scoping check as a preflight gate', () => {
      expect(taskStore).toMatch(/### Step 1 — Workstream Scoping Check \(FR-NB4\)/);
      expect(taskStore).toMatch(/runs before any read or write, and failing it is terminal/);
    });

    it('validates the property exists and is filterable, and the value is set', () => {
      expect(taskStore).toMatch(/names a property that \*{0,2}exists\*{0,2} in the database/);
      expect(taskStore).toMatch(/supports equality filtering/);
      expect(taskStore).toMatch(/workstream\.value` is non-null/);
    });

    it('closes every escape hatch in words', () => {
      expect(taskStore).toMatch(/MUST NOT proceed unscoped/);
      expect(taskStore).toMatch(/no degradation path here/);
      expect(taskStore).toMatch(/no `strict_mode` exemption/);
      expect(taskStore).toMatch(/no "just this once/);
    });

    it('requires a workstream filter on list_tasks', () => {
      expect(taskStore).toMatch(
        /list_tasks.*Filter MUST include `workstream\.property = workstream\.value`/s,
      );
    });

    it('requires stamping on create_tasks', () => {
      expect(taskStore).toMatch(/create_tasks.*MUST be stamped with the workstream value/s);
    });

    it('requires pre-write verification on both mutating operations', () => {
      expect(taskStore).toMatch(/update_task_status.*MUST verify the row carries the workstream value first/s);
      expect(taskStore).toMatch(/annotate_task.*MUST verify the row carries the workstream value first/s);
      expect(taskStore).toMatch(/Verify before every write/);
    });

    it('returns permission_denied on a workstream mismatch and writes nothing', () => {
      expect(taskStore).toMatch(/permission_denied` and write nothing/);
    });

    it('leads its behavioral rules with the scoping invariant', () => {
      const rules = taskStore.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/1\.\s+\*\*Never query or write unscoped\.\*\*/);
    });
  });

  describe('Wizard cannot produce an unscoped configuration', () => {
    it('makes workstream setup a required step for tasks', () => {
      expect(wizard).toMatch(/### 3\. Workstream Scoping \(required for tasks\)/);
    });

    it('refuses to enable tasks without a resolved workstream', () => {
      expect(wizard).toMatch(/do NOT write `notion\.enabled: true` for tasks/);
      expect(wizard).toMatch(/There is no unscoped fallback/);
    });

    it('offers a separate database as the alternative to scoping', () => {
      // The safe out when the shared DB can't be scoped: don't touch it.
      expect(wizard).toMatch(/Use a separate database instead/);
      expect(wizard).toMatch(/leaving yours untouched/);
    });

    it('lists the invariant in its behavioral rules', () => {
      expect(wizard).toMatch(/Never enable tasks unscoped/);
    });

    it('tells the user the guarantee in the confirmation output', () => {
      // The user should finish the wizard knowing what Synthex will and will
      // not touch.
      expect(wizard).toMatch(/only touches task rows tagged/);
      expect(wizard).toMatch(/other rows are never queried or modified/);
    });

    it('asks only for an optional default value, not a mandatory one', () => {
      // The authoritative value lives on each plan; a mandatory config value
      // is what creates the multi-initiative collision.
      expect(wizard).toMatch(/Default workstream value \(optional\)/);
      expect(wizard).toMatch(/A null default is not an error/);
    });

    it('steers multi-initiative repos away from a shared default', () => {
      expect(wizard).toMatch(/Several initiatives at once\?\*\* Leave this blank/);
      expect(wizard).toMatch(/never silently inherit another epic's identifier/);
    });

    it('distinguishes a missing property from a null default value', () => {
      const rules = wizard.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/No workstream property means documents-only/);
      expect(rules).toMatch(/A null default \*value\* is fine/);
    });

    it('forbids deriving a workstream value', () => {
      const rules = wizard.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never derive a workstream value/);
      expect(rules).toMatch(/empty queue that reads as "all work complete/);
    });
  });

  describe('Workstream value is carried by the plan, not by config', () => {
    // A single configured value makes every initiative's rows
    // indistinguishable, so `list_tasks` for one epic returns another's work
    // and the plan-complete check never fires. Binding the value to the plan
    // makes targeting the wrong initiative structurally impossible.
    let sharedDoc: string;
    let planTemplate: string;
    let nextPriority: string;
    let linter: string;
    let scribe: string;

    beforeAll(() => {
      sharedDoc = read('docs/document-backends.md');
      planTemplate = read('commands/write-implementation-plan.md');
      nextPriority = read('commands/next-priority.md');
      linter = read('agents/plan-linter.md');
      scribe = read('agents/plan-scribe.md');
    });

    it('contract separates the workspace-wide property from the per-plan value', () => {
      expect(contract).toMatch(/^### The property is workspace-wide; the value is per-plan$/m);
      expect(contract).toMatch(/several in flight at once/);
    });

    it('contract states the value resolution order', () => {
      expect(contract).toMatch(/`\*\*Workstream:\*\*` line — \*\*authoritative\*\*/);
      expect(contract).toMatch(/a default for plans that do not declare one/);
      expect(contract).toMatch(/refuse to operate on tasks/);
    });

    it('contract explains why binding to the plan closes the hole', () => {
      expect(contract).toMatch(/structurally impossible rather than merely discouraged/);
      expect(contract).toMatch(/no flag to forget and no config entry to fall out of sync/);
    });

    it('contract assigns value resolution to the caller, not the adapter', () => {
      expect(contract).toMatch(/\*\*Callers resolve the value; adapters do not\.\*\*/);
      expect(contract).toMatch(/adapter's input contract is unchanged/);
    });

    it('task store refuses when the caller omits the value', () => {
      expect(taskStore).toMatch(/You do not resolve the value yourself/);
      expect(taskStore).toMatch(/a caller trying to run unscoped, whatever the reason/);
    });

    it('shared mechanics tell commands to resolve from the plan first', () => {
      expect(sharedDoc).toMatch(/Resolve the workstream value from the plan — before touching any task/);
      expect(sharedDoc).toMatch(/resolving the value is the caller's job/);
    });

    it('a plan-declared value beats config, with the discrepancy surfaced', () => {
      expect(sharedDoc).toMatch(/it wins, even if config names a different one/);
      expect(sharedDoc).toMatch(/mention it once in your output/);
    });

    it('both plan templates carry the Workstream line', () => {
      for (const [name, text] of [
        ['write-implementation-plan', planTemplate],
        ['product-manager', read('agents/product-manager.md')],
      ] as const) {
        expect(text, `${name} template missing the line`).toMatch(
          /\*\*Workstream:\*\* \[This initiative's workstream identifier\]/,
        );
      }
    });

    it('next-priority resolves the value before any task operation', () => {
      expect(nextPriority).toMatch(/Resolve the workstream value from the plan first/);
      expect(nextPriority).toMatch(/plan-complete check would never fire/);
    });

    it('plan-linter checks for the line without inventing one', () => {
      expect(linter).toMatch(/`\*\*Workstream:\*\*` line present beneath the H1/);
      expect(linter).toMatch(/Do \*\*not\*\* invent a value when it is missing/);
    });

    it('plan-scribe preserves the line verbatim', () => {
      expect(scribe).toMatch(/^### Preserve the `\*\*Workstream:\*\*` line$/m);
      expect(scribe).toMatch(/Never remove it, never rewrite its value/);
    });

    it('nobody derives a value from a filename, branch, or title', () => {
      // A derived value that matches no rows returns an empty queue, which is
      // indistinguishable from "all work complete".
      for (const [name, text] of [
        ['shared mechanics', sharedDoc],
        ['write-implementation-plan', planTemplate],
        ['plan-linter', linter],
        ['configure-notion', wizard],
      ] as const) {
        expect(text, `${name} omits the do-not-derive rule`).toMatch(
          /all work complete/,
        );
      }
    });
  });

  describe('No unscoped escape hatch anywhere', () => {
    it.each([
      ['contract', () => contract],
      ['notion-task-store', () => taskStore],
      ['configure-notion', () => wizard],
    ])('%s never permits an unfiltered query as a fallback', (_name, get) => {
      const text = get();
      // Catch the phrasings a well-meaning implementer might introduce.
      expect(text).not.toMatch(/fall back to an unscoped/i);
      expect(text).not.toMatch(/if scoping fails,? (?:query|read|proceed)/i);
      expect(text).not.toMatch(/optional(?:ly)? (?:filter|scope) (?:on|by) workstream/i);
    });
  });
});
