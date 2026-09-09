// ko-qa-kit/tests/consistency.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ARCHETYPES } from '../src/detect.js';
import { ARCHETYPE_LABELS } from '../src/init.js';
import { ARCHETYPE_RESOURCES, getCommandEntries, COMMAND_FOLDERS } from '../src/scaffold.js';
import { parseFrontmatter } from 'kit-core';

const templateDir = path.resolve('templates');

function archetypesFor(dir, name) {
  return ARCHETYPE_RESOURCES[dir]?.[name] ?? ARCHETYPES;
}

describe('archetype consistency', () => {
  it('ARCHETYPE_LABELS keys match ARCHETYPES', () => {
    expect(new Set(Object.keys(ARCHETYPE_LABELS))).toEqual(new Set(ARCHETYPES));
  });

  it('ARCHETYPE_RESOURCES references only valid archetypes', () => {
    for (const group of Object.values(ARCHETYPE_RESOURCES)) {
      for (const archetypeList of Object.values(group)) {
        for (const archetype of archetypeList) {
          expect(ARCHETYPES).toContain(archetype);
        }
      }
    }
  });

  it('every restricted resource has a matching template on disk', () => {
    const commandNames = new Set(getCommandEntries(templateDir).map(e => e.name));
    for (const [dir, group] of Object.entries(ARCHETYPE_RESOURCES)) {
      for (const name of Object.keys(group)) {
        if (dir === 'commands') {
          expect(commandNames.has(name), `missing template for commands/${name}`).toBe(true);
          continue;
        }
        const asFile = path.join(templateDir, dir, `${name}.md`);
        const asDir = path.join(templateDir, dir, name);
        expect(fs.pathExistsSync(asFile) || fs.pathExistsSync(asDir), `missing template for ${dir}/${name}`).toBe(true);
      }
    }
  });

  it('command templates live in known folders with unique names', () => {
    const entries = getCommandEntries(templateDir);
    for (const entry of entries) {
      expect(COMMAND_FOLDERS).toContain(entry.folder);
    }
    const names = entries.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every archetype has a rule and an AGENTS.md template', () => {
    for (const archetype of ARCHETYPES) {
      expect(fs.pathExistsSync(path.join(templateDir, 'rules', `${archetype}.mdc`))).toBe(true);
      expect(fs.pathExistsSync(path.join(templateDir, 'agents-md', `${archetype}.md`))).toBe(true);
    }
  });
});

describe('e2e templates match ko-tests reality (anti-fiction lint)', () => {
  // Every kit template installed for the e2e-playwright archetype. New e2e
  // resources must be added here so they get linted too.
  const e2eTemplates = [
    'commands/qa/ko-e2e-test.md',
    'commands/qa/ko-e2e-heal.md',
    'agents/e2e-debugger.md',
    'agents/qa-automation-engineer.md',
    'skills/playwright-bdd/SKILL.md',
    'skills/playwright-bdd/references/page-object.md',
    'skills/bdd-authoring/SKILL.md',
    'skills/step-registry/SKILL.md',
    'skills/dom-sight/SKILL.md',
    'skills/dom-sight/references/playwright-mcp.md',
    'rules/e2e-playwright.mdc',
    'agents-md/e2e-playwright.md',
  ];

  // APIs, files, and flags that do not exist in the consumer repo family.
  const bannedAlways = [
    'snapshotDOM',
    'diagnoseSelector',
    'compareExpectedElements',
    '.auth/user.json',
    '--load-storage',
    'ts-node scripts/',
  ];

  // Concepts the family explicitly does not use — allowed only in lines that
  // negate them ("does not use storageState", "no @smoke tag").
  const bannedUnlessNegated = ['@smoke', 'storageState'];
  const NEGATION = /\b(no|not|never|does not|don't|doesn't)\b/i;

  it('every linted e2e template exists', () => {
    for (const rel of e2eTemplates) {
      expect(fs.pathExistsSync(path.join(templateDir, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it.each(e2eTemplates)('%s contains no fictional APIs or conventions', (rel) => {
    const content = fs.readFileSync(path.join(templateDir, rel), 'utf-8');
    for (const token of bannedAlways) {
      expect(content.includes(token), `${rel} references fictional "${token}"`).toBe(false);
    }
    for (const token of bannedUnlessNegated) {
      for (const line of content.split('\n')) {
        if (line.includes(token) && !NEGATION.test(line)) {
          expect.fail(`${rel} references "${token}" outside a negation: ${line.trim()}`);
        }
      }
    }
  });
});

describe('command frontmatter', () => {
  const commandEntries = getCommandEntries(templateDir).map(e => ({ ...e, label: `${e.folder}/${e.name}.md` }));

  it.each(commandEntries)('$label has valid frontmatter', ({ file, name }) => {
    const content = fs.readFileSync(file, 'utf-8');
    const { data } = parseFrontmatter(content);
    expect(data).not.toBeNull();
    expect(data.name).toBe(name);
    expect(typeof data.description).toBe('string');
    expect(data.description.trim().length).toBeGreaterThan(0);
  });

  it.each(commandEntries)('$label declares only dependencies that exist on disk', ({ file }) => {
    const content = fs.readFileSync(file, 'utf-8');
    const { data } = parseFrontmatter(content);
    for (const skill of [...(data.skills ?? []), ...(data['skills-optional'] ?? [])]) {
      expect(fs.pathExistsSync(path.join(templateDir, 'skills', skill, 'SKILL.md')), `${file}: missing skill "${skill}"`).toBe(true);
    }
    for (const agent of data.agents ?? []) {
      expect(fs.pathExistsSync(path.join(templateDir, 'agents', `${agent}.md`)), `${file}: missing agent "${agent}"`).toBe(true);
    }
    for (const rule of data.rules ?? []) {
      expect(fs.pathExistsSync(path.join(templateDir, 'rules', `${rule}.mdc`)), `${file}: missing rule "${rule}"`).toBe(true);
    }
  });

  it.each(commandEntries)('$label required deps are installed for every archetype the command targets', ({ file, name }) => {
    const content = fs.readFileSync(file, 'utf-8');
    const { data } = parseFrontmatter(content);
    const commandArchetypes = archetypesFor('commands', name);
    for (const skill of data.skills ?? []) {
      for (const a of commandArchetypes) {
        expect(archetypesFor('skills', skill), `${file}: skill "${skill}" not installed for "${a}"`).toContain(a);
      }
    }
    for (const agent of data.agents ?? []) {
      for (const a of commandArchetypes) {
        expect(archetypesFor('agents', agent), `${file}: agent "${agent}" not installed for "${a}"`).toContain(a);
      }
    }
  });
});

describe('kit-wide staleness lint (qa-kit slice)', () => {
  const BANNED = [
    { name: 'ko-inception (removed command)', re: /ko-inception/ },
    { name: 'ko-lib-component (never existed)', re: /ko-lib-component/ },
    { name: 'ko-release without -verify (renamed)', re: /ko-release(?!-verify)/ },
  ];
  const REQUIRED = [
    { file: 'commands/qa/ko-e2e-test.md', token: 'Element Map' },
    { file: 'commands/qa/ko-e2e-heal.md', token: 'Heal Plan' },
    { file: 'agents/e2e-debugger.md', token: 'diagnose-only' },
    { file: 'agents/e2e-debugger.md', token: 'NOT FIXED' },
    { file: 'commands/qa/ko-mobile-test.md', token: '[REUSE]' },
    { file: 'commands/qa/ko-mobile-heal.md', token: 'Heal Plan' },
    { file: 'agents/test-debugger.md', token: 'diagnose-only' },
    { file: 'agents/test-debugger.md', token: 'NOT FIXED' },
  ];

  it.each(REQUIRED)('$file carries its pattern token "$token"', ({ file, token }) => {
    const content = fs.readFileSync(path.join(templateDir, file), 'utf-8');
    expect(content.includes(token), `${file} lost required token "${token}"`).toBe(true);
  });

  it('templates/ and README reference no removed commands', async () => {
    const files = [...(await listFilesRecursive(templateDir)).map(rel => path.join(templateDir, rel)), path.resolve('README.md')];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      for (const { name, re } of BANNED) {
        expect(re.test(content), `${path.relative('.', file)} references ${name}`).toBe(false);
      }
    }
  });
});

async function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFilesRecursive(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}
