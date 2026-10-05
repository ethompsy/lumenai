/**
 * /synthex:use-epic — per-developer active epic.
 *
 * `.synthex/config.yaml` is committed and shared, so it deliberately holds no
 * particular epic: only workspace facts (which database holds epics, which
 * property links a work item to one). "Which epic am I on" is per-developer
 * and per-clone, which is what lets a team share one config while each member
 * works a different initiative.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

/** Commands that take a document path and must honour the active epic. */
const PATH_COMMANDS = [
  'next-priority',
  'retrospective',
  'write-implementation-plan',
  'refine-requirements',
] as const;

describe('/synthex:use-epic', () => {
  let cmd: string;
  let init: string;
  let prd: string;

  beforeAll(() => {
    cmd = read('commands/use-epic.md');
    init = read('commands/init.md');
    prd = read('commands/write-prd.md');
  });

  describe('Registration', () => {
    it('exists and is registered', () => {
      expect(existsSync(join(PLUGIN, 'commands/use-epic.md'))).toBe(true);
      const m = JSON.parse(read('.claude-plugin/plugin.json'));
      expect(m.commands).toContain('./commands/use-epic.md');
    });

    it('has a generated skill wrapper', () => {
      expect(existsSync(join(PLUGIN, 'skills/use-epic/SKILL.md'))).toBe(true);
    });

    it('precedes write-prd in the manifest', () => {
      const m = JSON.parse(read('.claude-plugin/plugin.json'));
      expect(m.commands.indexOf('./commands/use-epic.md')).toBeLessThan(
        m.commands.indexOf('./commands/write-prd.md'),
      );
    });
  });

  describe('Why it is separate from shared config', () => {
    it('states that config holds no particular epic', () => {
      expect(cmd).toMatch(/committed and shared/);
      expect(cmd).toMatch(/deliberately holds no particular epic/);
    });

    it('names the team scenario it enables', () => {
      expect(cmd).toMatch(/share one config and each work a different epic/);
    });
  });

  describe('State lives in its own file, not state.json', () => {
    it('uses .synthex/active-epic.json', () => {
      expect(cmd).toContain('.synthex/active-epic.json');
    });

    it('explains why not state.json, naming the hook that would erase it', () => {
      // upgrade-nudge.sh rebuilds state.json from a fixed field set, so
      // anything else stored there is silently lost on a version bump.
      expect(cmd).toMatch(/separate file rather than a key in `\.synthex\/state\.json`/);
      expect(cmd).toMatch(/rebuilds `state\.json` from a fixed set of fields/);
      expect(cmd).toMatch(/Do not move this into `state\.json`/);
    });

    it('that hazard is real — the hook rebuilds from five fields only', () => {
      const hook = read('scripts/upgrade-nudge.sh');
      // Window the function body by character count: splitting on '}' lands
      // inside the redirected block, not at the function's close.
      const writer = hook.slice(hook.indexOf('write_state()')).slice(0, 900);
      expect(writer).toMatch(/last_seen_version/);
      expect(writer).toMatch(/printf '\{/);
      // The rebuild enumerates its fields, so anything unlisted is dropped.
      expect(writer).not.toMatch(/active_epic/);
    });

    it('is gitignored by init, alongside the other per-developer state', () => {
      expect(init).toContain('.synthex/active-epic.json');
      expect(init).toMatch(/Synthex active epic \(per-developer; config is shared, this is not\)/);
    });

    it('records paths rather than deriving them from the label', () => {
      // A slug convention repoints silently when an epic is renamed.
      expect(cmd).toMatch(/Paths are \*\*recorded, not derived from the label\.\*\*/);
      expect(cmd).toMatch(/breaks the moment someone renames an epic/);
    });

    it('writes atomically', () => {
      expect(cmd).toMatch(/atomically — temp file then rename/);
    });
  });

  describe('Switching never touches the working tree', () => {
    it('creates no documents', () => {
      expect(cmd).toMatch(/\*\*Do not create any document\.\*\*/);
      expect(cmd).toMatch(/never writes to the working tree/);
    });

    it('says why that makes switching safe', () => {
      expect(cmd).toMatch(/safe to do freely and safe to undo/);
    });

    it('points at write-prd for creation instead', () => {
      expect(cmd).toMatch(/Creating a document is `write-prd`'s job/);
    });

    it('reports missing documents plainly rather than hiding them', () => {
      expect(cmd).toMatch(/\(not yet created\)/);
    });

    it('lists no-document creation among its behavioral rules', () => {
      const rules = cmd.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never write a document/);
    });
  });

  describe('Resolution refuses to guess', () => {
    it('never auto-selects an ambiguous match', () => {
      expect(cmd).toMatch(/\*\*Never auto-select on an ambiguous match\.\*\*/);
    });

    it('confirms even a single fuzzy match', () => {
      expect(cmd).toMatch(/a substring match is a guess about intent/);
      expect(cmd).toMatch(/activating the wrong epic silently redirects every subsequent command/);
    });

    it('verifies a URL or id belongs to the epics database', () => {
      expect(cmd).toMatch(/fetch it to verify it exists and is a row of `notion\.epics_database`/);
    });

    it('prefers a document that declares the epic over a slug convention', () => {
      expect(cmd).toMatch(/This is authoritative: the document itself says which epic it belongs to/);
    });
  });

  describe('Commands honour the active epic', () => {
    it.each(PATH_COMMANDS)('%s documents the fallback order', (c) => {
      const text = read(`commands/${c}.md`);
      expect(text).toMatch(/\*\*Active-epic fallback\.\*\*/);
      expect(text).toMatch(/explicit argument → `\.synthex\/active-epic\.json` → `documents\.\*`/);
    });

    it.each(PATH_COMMANDS)('%s stops rather than defaulting on a multi-epic project', (c) => {
      // Falling through to main.md is how someone marks another
      // initiative's tasks done.
      const text = read(`commands/${c}.md`);
      expect(text).toMatch(/\*\*stop\*\* rather than falling through to config/);
      expect(text).toMatch(/another initiative/);
    });

    it.each(PATH_COMMANDS)('%s names the epic in its output', (c) => {
      expect(read(`commands/${c}.md`)).toMatch(/Name the epic in your first line of output/);
    });

    it('use-epic documents the same order authoritatively', () => {
      expect(cmd).toMatch(/^## How Commands Use It$/m);
      expect(cmd).toMatch(/An explicit argument — always wins/);
    });

    it('write-prd sets the active epic as a side effect', () => {
      expect(prd).toMatch(/\*\*Record it as the active epic\.\*\*/);
      expect(prd).toMatch(/activating it separately beforehand would be redundant/);
    });

    it('write-prd consults the active epic in its resolution order', () => {
      const step = prd.split('#### 1a. Resolve the epic')[1]?.split('#### 1b.')[0] ?? '';
      expect(step).toMatch(/The active epic in `\.synthex\/active-epic\.json`/);
      expect(step).toMatch(/how a shared config supports a team working different epics/);
    });
  });

  describe('Non-Notion workflows are unaffected', () => {
    it.each(PATH_COMMANDS)('%s puts the skip instruction before the fallback rule', (c) => {
      // Ordering is behavioural, not cosmetic: an agent reading the section
      // top-down must be told to skip it before it reads a resolution rule
      // that includes "stop rather than falling through". Reversed, a
      // filesystem-only project could halt a command that should just use
      // documents.*.
      const text = read(`commands/${c}.md`);
      const skip = text.indexOf('skip this section entirely');
      const note = text.indexOf('**Active-epic fallback.**');
      expect(skip).toBeGreaterThan(-1);
      expect(note).toBeGreaterThan(-1);
      expect(note).toBeGreaterThan(skip);
    });

    it.each(PATH_COMMANDS)('%s keeps the fallback inside the Document Backend section', (c) => {
      // Inside the section means the skip clause governs it. Outside, it would
      // apply unconditionally.
      const text = read(`commands/${c}.md`);
      const header = text.indexOf('## Document Backend');
      const workflow = text.indexOf('## Workflow');
      const note = text.indexOf('**Active-epic fallback.**');
      expect(note).toBeGreaterThan(header);
      expect(note).toBeLessThan(workflow);
    });

    it.each(PATH_COMMANDS)('%s still states the byte-identical guarantee', (c) => {
      const text = read(`commands/${c}.md`);
      expect(text).toContain('FR-NB2');
      expect(text).toMatch(/byte-identical to pre-Notion behavior/);
    });

    it('use-epic requires the Notion backend and stops otherwise', () => {
      expect(cmd).toMatch(/Requires the Notion backend/);
      expect(cmd).toMatch(/Commands use the paths in documents\.\* as normal/);
    });

    it('adds no config key that a filesystem project must set', () => {
      // The active epic is local state, so documents.* is unchanged.
      const yaml = read('config/defaults.yaml');
      expect(yaml).not.toMatch(/active_epic/);
      expect(yaml).not.toMatch(/active-epic/);
    });
  });

  describe('Degrades cleanly without the backend', () => {
    it('reports and stops when Notion is off', () => {
      expect(cmd).toMatch(/isn't using the Notion backend, so there's no epic to activate/);
    });

    it('treats that as normal rather than an error', () => {
      const rules = cmd.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/it is not an error/);
    });

    it('--clear names the consequence', () => {
      expect(cmd).toMatch(/`--clear`/);
      expect(cmd).toMatch(/Document commands now need an explicit path/);
    });
  });
});
