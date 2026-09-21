/**
 * Phase 0: Baseline snapshots for the Notion-backend regression contract.
 *
 * The Notion backend replaces direct `@{path}` filesystem resolution with a
 * document-store contract. The contract guarantee is that behavior is
 * byte-identical when `notion.enabled: false`. These snapshots were captured
 * BEFORE any command was modified, so that guarantee can be verified by
 * comparison rather than by assertion — a baseline captured after the refactor
 * proves nothing.
 *
 * This suite asserts the snapshots exist, are redacted, leak nothing, and
 * document the surface actually under test (document path resolution).
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SNAPSHOT_DIR = join(
  import.meta.dirname,
  '..',
  '__snapshots__',
  'notion-backend',
  'baseline',
);

/** The three document-centric commands the Notion backend refactor touches. */
const BASELINES = [
  'write-implementation-plan-baseline.snapshot.md',
  'next-priority-baseline.snapshot.md',
  'retrospective-baseline.snapshot.md',
] as const;

const read = (name: string) => readFileSync(join(SNAPSHOT_DIR, name), 'utf8');

describe('Phase 0: Notion-backend baseline snapshots', () => {
  describe('Existence', () => {
    it.each(BASELINES)('%s exists and is non-empty', (name) => {
      expect(existsSync(join(SNAPSHOT_DIR, name))).toBe(true);
      expect(read(name).trim().length).toBeGreaterThan(0);
    });

    it('redaction-strategy.md exists', () => {
      expect(existsSync(join(SNAPSHOT_DIR, 'redaction-strategy.md'))).toBe(true);
    });
  });

  describe('Redaction applied', () => {
    it.each(BASELINES)('%s contains the <<finding-body>> placeholder', (name) => {
      expect(read(name)).toContain('<<finding-body>>');
    });

    it.each(BASELINES)('%s redacts the capture date', (name) => {
      expect(read(name)).toContain('<YYYY-MM-DD redacted>');
    });

    it('redaction-strategy.md documents the <<finding-body>> placeholder', () => {
      expect(read('redaction-strategy.md')).toContain('<<finding-body>>');
    });
  });

  describe('No leaks (negative scan)', () => {
    it.each(BASELINES)('%s contains no unredacted ISO date', (name) => {
      // Real dates are redacted to <YYYY-MM-DD redacted>, which has no digits.
      expect(read(name)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it.each(BASELINES)('%s contains no absolute filesystem path', (name) => {
      // Baselines record repo-relative paths only; an absolute path would leak
      // the capturing developer's home directory into a committed fixture.
      expect(read(name)).not.toMatch(/\/(?:Users|home)\//);
    });

    it.each(BASELINES)('%s contains no commit SHA', (name) => {
      // SHA-like = 7+ hex chars including at least one digit, which excludes
      // ordinary all-letter words that happen to use only a-f.
      const shaLike = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/;
      expect(read(name)).not.toMatch(shaLike);
    });
  });

  describe('Surface under test is documented', () => {
    it.each(BASELINES)('%s documents a Document path resolution section', (name) => {
      // This is the assertion that gives the baselines their purpose: the
      // refactor changes path resolution, so every baseline must pin down the
      // pre-change resolution order it is protecting.
      expect(read(name)).toMatch(/^## Document path resolution$/m);
    });

    it.each(BASELINES)('%s records the disabled-feature config state', (name) => {
      expect(read(name)).toMatch(/`documents\.backend` NOT set/);
    });

    it.each(BASELINES)('%s records the resulting file writes', (name) => {
      expect(read(name)).toMatch(/^## File writes$/m);
    });

    it('redaction-strategy.md explains why path resolution is the focus', () => {
      const text = read('redaction-strategy.md');
      expect(text).toMatch(/^## Why path resolution is the focus$/m);
      expect(text).toContain('document-store contract');
    });

    it('redaction-strategy.md records that capture preceded the refactor', () => {
      // Guards the one property that cannot be recovered if lost: these must
      // have been captured pre-change to be meaningful.
      expect(read('redaction-strategy.md')).toMatch(
        /captured in Phase 0, before any command was modified/i,
      );
    });
  });

  describe('Task-state model is pinned', () => {
    it('next-priority baseline records the unstable-ordinal hazard', () => {
      // The Notion backend keys rows by Notion page ID precisely because
      // plan-scribe renumbers ordinals. If this line ever disappears, the
      // hazard it documents has been lost.
      const text = read('next-priority-baseline.snapshot.md');
      expect(text).toContain('renumbers');
      expect(text).toMatch(/not\*{0,2} stable/i);
    });

    it('next-priority baseline records the observed status values', () => {
      const text = read('next-priority-baseline.snapshot.md');
      for (const status of ['pending', 'in progress', 'done', 'blocked']) {
        expect(text).toContain(status);
      }
    });

    it('write-implementation-plan baseline pins the verbatim task table header', () => {
      // plan-linter treats this exact header as CRITICAL; the Notion property
      // mapping has to satisfy the same invariant.
      expect(read('write-implementation-plan-baseline.snapshot.md')).toContain(
        '| # | Task | Complexity | Dependencies | Status |',
      );
    });
  });
});
