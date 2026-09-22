/**
 * FR-NB7: backend awareness in plan-scribe and product-manager.
 *
 * Neither agent performs storage I/O — both work on document content. But both
 * sit next to the feature's sharpest hazard: plan-scribe renumbers task
 * ordinals, and the product-manager references documents by path. Under the
 * Notion backend, an ordinal is a display position and a path may not exist at
 * all, so both need to say so at the point of use.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENTS = join(import.meta.dirname, '..', '..', 'plugins', 'synthex', 'agents');
const read = (name: string) => readFileSync(join(AGENTS, name), 'utf8');

describe('FR-NB7: plan-scribe backend awareness', () => {
  let text: string;
  beforeAll(() => {
    text = read('plan-scribe.md');
  });

  it('has a Document Backend Awareness section', () => {
    expect(text).toMatch(/^## Document Backend Awareness$/m);
  });

  it('states it never performs storage I/O itself', () => {
    expect(text).toMatch(/You never read or write storage yourself/);
  });

  it('keeps renumbering as an instruction', () => {
    // The fix must not be "stop renumbering" — dependency references in the
    // prose still have to stay valid.
    expect(text).toMatch(/Keep doing that/);
  });

  it('states that an ordinal is a display position, not an identity', () => {
    expect(text).toMatch(/\*\*display position\*\*/);
    expect(text).toMatch(/does not, and must not, mean the task became a different task/);
  });

  it('explains the failure mode that rule prevents', () => {
    // Rules without a stated consequence get optimized away by the next editor.
    expect(text).toMatch(/silently corrupts a dependency graph/);
    expect(text).toMatch(/every insert retargets someone's dependencies onto the wrong task/);
  });

  it('forbids creating or deleting Notion rows itself', () => {
    expect(text).toMatch(/You do not create, delete, or archive Notion rows/);
    expect(text).toMatch(/no storage access and no adapter/);
  });

  it('requires structural task changes to be reported', () => {
    expect(text).toMatch(/Report structural task changes explicitly/);
    expect(text).toMatch(/Structural task changes/);
    for (const field of ['added', 'removed', 'moved']) {
      expect(text).toContain(field);
    }
  });

  it('distinguishes structural from content-only edits', () => {
    // Otherwise every reworded task would generate a spurious row operation.
    expect(text).toMatch(/is not a structural change and needs no such entry/);
  });

  it('emits the structural report unconditionally rather than sniffing the backend', () => {
    // plan-scribe cannot see config; branching on a guess would be worse than
    // a redundant line.
    expect(text).toMatch(/Emit it either way/);
    expect(text).toMatch(/you cannot see the config/);
  });

  it('carries the identity boundary into its behavioral rules', () => {
    const rules = text.split('## Behavioral Rules')[1] ?? '';
    expect(rules).toMatch(/never treat a number as an identity/i);
  });
});

describe('FR-NB7: product-manager backend awareness', () => {
  let text: string;
  beforeAll(() => {
    text = read('product-manager.md');
  });

  it('frames the document table as filesystem-backend defaults', () => {
    expect(text).toMatch(/^### Where these documents actually live$/m);
    expect(text).toMatch(/defaults for the `filesystem` backend/);
  });

  it('links the contract', () => {
    expect(text).toContain('_shared/document-store-contract.md');
  });

  it('keeps the PM out of storage', () => {
    expect(text).toMatch(/the invoking command resolves and performs the storage/);
    expect(text).toMatch(/Do not read or write Notion yourself/);
  });

  it('warns that a named path may not exist', () => {
    expect(text).toMatch(/do not assume a path exists just because this table names one/);
  });

  it('asks for documents to be referenced by role, not path', () => {
    expect(text).toMatch(/Refer to documents by role, not by path/);
  });

  it('explains the prose/rows split without making it the PM\'s job', () => {
    expect(text).toMatch(/the document is split/);
    expect(text).toMatch(/the command splits it/);
    expect(text).toMatch(/Keep the plan self-contained/);
  });

  it('requires structural task changes to be surfaced in plan updates', () => {
    expect(text).toMatch(/Surface structural task changes/);
    expect(text).toMatch(/it can only do so if the change is stated/);
  });

  it('forbids referencing a task by ordinal alone', () => {
    expect(text).toMatch(/Never reference a task by its ordinal alone/);
    expect(text).toMatch(/silently points somewhere else after the next insert/);
  });
});

describe('Consistency across the agents that touch ordinals', () => {
  it('plan-scribe, product-manager, and the contract agree ordinals are not identity', () => {
    const contract = readFileSync(join(AGENTS, '_shared', 'document-store-contract.md'), 'utf8');
    for (const [name, text] of [
      ['contract', contract],
      ['plan-scribe', read('plan-scribe.md')],
      ['product-manager', read('product-manager.md')],
    ] as const) {
      expect(text, `${name} does not mention ordinals`).toMatch(/ordinal/i);
      expect(text, `${name} does not mention renumbering`).toMatch(/renumber/i);
    }
  });
});
