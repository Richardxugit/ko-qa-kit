#!/usr/bin/env node
// Smoke test: run `ko-qa-kit init --archetype <x>` against minimal fixture repos
// and assert the expected .cursor/ file set lands. Used by CI; also runnable locally:
//   node scripts/smoke-init.mjs
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'bin', 'cli.js');

const APPIUM_POM = '<project><dependency><artifactId>java-client</artifactId></dependency>'
  + '<dependency><artifactId>cucumber-java</artifactId></dependency></project>';

const FIXTURES = [
  {
    name: 'e2e-playwright',
    files: { 'package.json': { devDependencies: { '@playwright/test': '^1.40.0', 'playwright-bdd': '^7.0.0' } } },
    expect: ['.cursor/rules/e2e-playwright.mdc', '.cursor/rules/coding-standards.mdc', '.cursor/commands/ko-e2e-test.md', '.cursor/commands/ko-e2e-heal.md', '.cursor/skills/playwright-bdd/SKILL.md', '.cursor/agents/qa-automation-engineer.md'],
    reject: ['.cursor/commands/ko-mobile-test.md', '.cursor/rules/mobile-appium.mdc', '.cursor/skills/mobile-browserstack-triage/SKILL.md'],
    mcp: ['playwright'],
  },
  {
    name: 'mobile-appium',
    files: { 'pom.xml': APPIUM_POM },
    expect: ['.cursor/rules/mobile-appium.mdc', '.cursor/commands/ko-mobile-test.md', '.cursor/commands/ko-mobile-heal.md', '.cursor/agents/test-generator.md', '.cursor/skills/mobile-browserstack-triage/SKILL.md'],
    reject: ['.cursor/commands/ko-e2e-test.md', '.cursor/rules/e2e-playwright.mdc'],
    mcp: ['browserstack'],
  },
  {
    name: 'mobile-appium,e2e-playwright', // repo with both suites
    files: {
      'pom.xml': APPIUM_POM,
      'package.json': { devDependencies: { '@playwright/test': '^1.40.0', '@cucumber/cucumber': '^10.0.0' } },
    },
    expect: ['.cursor/rules/mobile-appium.mdc', '.cursor/rules/e2e-playwright.mdc', '.cursor/commands/ko-mobile-test.md', '.cursor/commands/ko-e2e-test.md', 'AGENTS.md'],
    reject: [],
    mcp: ['browserstack', 'playwright'],
  },
];

let failures = 0;
for (const fixture of FIXTURES) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `ko-qa-smoke-${fixture.name.replace(',', '-')}-`));
  try {
    for (const [rel, content] of Object.entries(fixture.files)) {
      const abs = path.join(dir, rel);
      await fs.ensureDir(path.dirname(abs));
      if (typeof content === 'string') await fs.writeFile(abs, content);
      else await fs.writeJson(abs, content);
    }
    execFileSync('node', [cli, 'init', '--archetype', fixture.name], { cwd: dir, stdio: 'pipe' });
    for (const rel of [...fixture.expect, ...fixture.reject.map(r => `!${r}`)]) {
      const negated = rel.startsWith('!');
      const target = negated ? rel.slice(1) : rel;
      const exists = await fs.pathExists(path.join(dir, target));
      const ok = negated ? !exists : exists;
      if (!ok) {
        failures++;
        console.error(`  ✗ ${fixture.name}: ${negated ? 'unexpected' : 'missing'} ${target}`);
      }
    }
    // mcp union check
    const mcp = await fs.readJson(path.join(dir, '.cursor', 'mcp.json'));
    const servers = Object.keys(mcp.mcpServers ?? {}).sort();
    const want = [...fixture.mcp].sort();
    if (JSON.stringify(servers) !== JSON.stringify(want)) {
      failures++;
      console.error(`  ✗ ${fixture.name}: mcp servers ${JSON.stringify(servers)} != ${JSON.stringify(want)}`);
    }
    console.log(`  ✓ ${fixture.name}`);
  } finally {
    await fs.remove(dir);
  }
}

if (failures > 0) {
  console.error(`\nsmoke-init: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nsmoke-init: all fixtures passed');
