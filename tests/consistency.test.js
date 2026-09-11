// ko-qa-kit/tests/consistency.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ARCHETYPES } from '../src/detect.js';
import { ARCHETYPE_LABELS } from '../src/init.js';
import { ARCHETYPE_RESOURCES, getCommandEntries, MANUAL_INSTALL_COMMANDS } from '../src/scaffold.js';
import { parseFrontmatter } from '../src/scaffold-core/index.js';

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
        const asMdc = path.join(templateDir, dir, `${name}.mdc`);
        const asDir = path.join(templateDir, dir, name);
        expect(fs.pathExistsSync(asFile) || fs.pathExistsSync(asMdc) || fs.pathExistsSync(asDir), `missing template for ${dir}/${name}`).toBe(true);
      }
    }
  });

  it('command templates have unique names', () => {
    const names = getCommandEntries(templateDir).map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every archetype has a rule and an AGENTS.md template', () => {
    for (const archetype of ARCHETYPES) {
      expect(fs.pathExistsSync(path.join(templateDir, 'rules', `${archetype}.mdc`))).toBe(true);
      expect(fs.pathExistsSync(path.join(templateDir, 'project-context', `${archetype}.md`))).toBe(true);
    }
  });
});

describe('command frontmatter', () => {
  const commandEntries = getCommandEntries(templateDir).map(e => ({ ...e, label: `commands/${e.name}.md` }));

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

describe('anti-overengineering rules', () => {
  it('coding-standards.mdc carries the Simplicity and Bug fixes sections', () => {
    const content = fs.readFileSync(path.join(templateDir, 'rules', 'coding-standards.mdc'), 'utf-8');
    for (const section of ['## Simplicity (hard rules)', '## Bug fixes (hard rules)']) {
      expect(content.includes(section), `coding-standards.mdc lost section "${section}"`).toBe(true);
    }
  });

  it('coding-standards.mdc stays lean — no spec-style or monorepo sections', () => {
    // Spec style lives in ko-dev-kit's ko-feature (specs are authored there, not in QA repos);
    // monorepo force_update rules belong to the product monorepo, not standalone QA repos.
    const content = fs.readFileSync(path.join(templateDir, 'rules', 'coding-standards.mdc'), 'utf-8');
    expect(content).not.toContain('## Specs and docs');
    expect(content).not.toContain('force_update.txt');
  });
});

describe('cross-kit reference lint', () => {
  // Commands/rules referenced in templates but shipped by OTHER kits.
  // Each must be guarded in the text ("if installed", "ko-product-kit", ...).
  const EXTERNAL_COMMANDS = new Set(); // this kit references no other kit's commands
  const EXTERNAL_RULES = new Set();

  const templateFiles = fs.readdirSync(path.join(templateDir, 'commands'))
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(templateDir, 'commands', f));
  // include skills + rules bodies
  for (const dir of ['skills', 'rules', 'agents']) {
    const base = path.join(templateDir, dir);
    for (const f of fs.readdirSync(base, { recursive: true })) {
      const full = path.join(base, String(f));
      if (/\.(md|mdc)$/.test(String(f)) && fs.statSync(full).isFile()) templateFiles.push(full);
    }
  }

  const shippedCommands = new Set(getCommandEntries(templateDir).map(e => e.name));
  const shippedRules = new Set(fs.readdirSync(path.join(templateDir, 'rules')).map(f => f.replace(/\.mdc$/, '')));

  it('every /ko-* reference is shipped by this kit or a known external', () => {
    for (const file of templateFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const refs = content.match(/(?<![\w/@-])\/(ko-[a-z][a-z0-9-]*)/g) ?? [];
      for (const ref of refs) {
        const name = ref.slice(1);
        const ok = shippedCommands.has(name) || EXTERNAL_COMMANDS.has(name);
        expect(ok, `${path.relative(templateDir, file)} references unknown command ${ref} — ship it, or whitelist + guard it as external`).toBe(true);
      }
    }
  });

  it('every *.mdc reference is shipped by this kit or a known external', () => {
    for (const file of templateFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const refs = content.match(/(?<![\w/@-])([a-z0-9][a-z0-9-]*)\.mdc/g) ?? [];
      for (const ref of refs) {
        const name = ref.replace(/\.mdc$/, '');
        const ok = shippedRules.has(name) || EXTERNAL_RULES.has(name);
        expect(ok, `${path.relative(templateDir, file)} references unknown rule ${ref}`).toBe(true);
      }
    }
  });

  it('manual-tier command references are guarded as conditional', () => {
    // Commands not auto-installed by init must never be referenced unconditionally —
    // same failure mode as the ko-onboard → ko-knowledge-gen bug.
    const GUARD = /if (it is )?installed|when installed|manual[- ]tier|install command|not installed|not this kit/i;
    for (const file of templateFiles) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const cmd of MANUAL_INSTALL_COMMANDS) {
          if (file.endsWith(`${path.sep}${cmd}.md`)) continue; // a command may reference itself freely
          if (!new RegExp(`(?<![\\w/@-])/${cmd}(?![a-z0-9-])`).test(line)) continue;
          const guarded = GUARD.test(line) || GUARD.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '));
          expect(guarded, `${path.relative(templateDir, file)}:${i + 1} references manual-tier "/${cmd}" without an install guard`).toBe(true);
        }
      });
    }
  });

  it('external references are guarded as conditional in the text', () => {
    const GUARD = /if installed|when installed|ko-product-kit|ko-qa-kit|not this kit/i;
    for (const file of templateFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const fileLevelGuard = GUARD.test(content); // file declares conditionality once (e.g. format spec of an external pipeline)
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        for (const ext of [...EXTERNAL_COMMANDS]) {
          const re = new RegExp(`(?<![\\w/@-])/${ext}(?![a-z0-9-])`);
          if (!re.test(line)) continue;
          // allow format-spec examples (tables/bolt logs) — the section header carries the guard
          const section = lines.slice(0, i + 1).reverse().find(l => l.startsWith('#')) ?? '';
          const guarded = fileLevelGuard || GUARD.test(line) || GUARD.test(section) || GUARD.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '));
          expect(guarded, `${path.relative(templateDir, file)}:${i + 1} references external "/${ext}" without an "if installed" guard`).toBe(true);
        }
        // rules: only the explicit `.mdc` form needs a guard (bare archetype names in
        // skip-logic like "Skip for nestjs-graphql, e2e-playwright" are harmless)
        for (const ext of [...EXTERNAL_RULES]) {
          if (!line.includes(`${ext}.mdc`)) continue;
          const guarded = fileLevelGuard || GUARD.test(line) || GUARD.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '));
          expect(guarded, `${path.relative(templateDir, file)}:${i + 1} references external "${ext}.mdc" without an "if installed" guard`).toBe(true);
        }
      });
    }
  });
});

describe('kit-wide staleness lint (dev-kit slice)', () => {
  const BANNED = [
    { name: 'commands/qa folder era', re: /commands\/qa\// },
    { name: 'agents-md folder era', re: /agents-md/ },
    { name: 'vendored kit-core era', re: /vendor\/kit-core/ },
  ];
  const REQUIRED = [
    { file: 'commands/ko-e2e-test.md', token: 'step registry' },
    { file: 'commands/ko-e2e-heal.md', token: 'e2e-debugger' },
    { file: 'commands/ko-mobile-test.md', token: 'BrowserStack' },
    { file: 'commands/ko-mobile-heal.md', token: 'test-debugger' },
    { file: 'agents/qa-automation-engineer.md', token: 'pwHelper' },
    { file: 'agents/e2e-debugger.md', token: 'never masking' },
    { file: 'agents/test-debugger.md', token: 'never masking' },
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
