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
      expect(wizard).toMatch(/only reads and writes task rows tagged/);
      expect(wizard).toMatch(/other rows are never queried or modified/);
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
