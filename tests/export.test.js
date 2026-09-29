// ko-qa-kit/tests/export.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDependencies, exportPlugin, exportCommand } from '../src/scaffold-core/export.js';
import { ARCHETYPE_RESOURCES } from '../src/scaffold.js';

const templateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
let outDir;

beforeEach(async () => { outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-qa-export-')); });
afterEach(async () => { await fs.remove(outDir); });

const AUTHOR = { name: 'Test Author', email: 'test@example.com' };
const E2E_COMMANDS = ['ko-e2e-test', 'ko-e2e-verify', 'ko-e2e-heal'];

describe('extractDependencies', () => {
  it('unions frontmatter deps with skill paths cited in the body', () => {
    const content = [
      '---',
      'name: ko-e2e-test',
      'description: x',
      'skills: [playwright-bdd]',
      '---',
      '',
      'Read `.cursor/skills/dom-sight/references/playwright-mcp.md` before selecting.',
    ].join('\n');
    const deps = extractDependencies(content);
    expect(deps.skills).toContain('playwright-bdd');
    expect(deps.skills).toContain('dom-sight');
  });

  it('does not capture the sub- prefix as an agent name', () => {
    const deps = extractDependencies('Dispatch a `test-generator` sub-agent per dimension.');
    expect(deps.agents).toContain('test-generator');
    expect(deps.agents).not.toContain('sub-');
  });
});

describe('exportPlugin', () => {
  const base = () => ({
    name: 'ko-e2e', commands: E2E_COMMANDS, templateDir, outputDir: outDir,
    resourceMap: ARCHETYPE_RESOURCES, author: AUTHOR, description: 'E2E workflow',
    keywords: ['e2e', 'playwright'], tags: ['qa'],
  });

  it('emits a marketplace-shaped plugin.json', async () => {
    await exportPlugin(base());
    const manifest = await fs.readJson(path.join(outDir, 'ko-e2e', '.cursor-plugin', 'plugin.json'));
    expect(manifest).toMatchObject({
      name: 'ko-e2e', version: '1.0.0', license: 'MIT', author: AUTHOR,
      commands: './commands/', agents: './agents/', skills: './skills/', rules: './rules/',
      hooks: './hooks.json', mcpServers: './mcp.json',
    });
    expect(manifest.keywords).toEqual(['e2e', 'playwright']);
    expect(manifest.displayName).toBe('Ko E2e');
  });

  it('bundles hooks with plugin-relative wiring in hooks.json', async () => {
    await exportPlugin(base());
    const dir = path.join(outDir, 'ko-e2e');
    expect(await fs.pathExists(path.join(dir, 'hooks', 'safety-guard.cjs'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'hooks', 'destructive-rules.json'))).toBe(true);
    const wiring = await fs.readJson(path.join(dir, 'hooks.json'));
    const commands = Object.values(wiring.hooks).flat().map((h) => h.command);
    expect(commands.every((c) => c.startsWith('node ./hooks/'))).toBe(true);
  });

  it('rewrites project-scope skill references inside exported markdown', async () => {
    await exportPlugin(base());
    const heal = await fs.readFile(path.join(outDir, 'ko-e2e', 'commands', 'ko-e2e-heal.md'), 'utf-8');
    expect(heal).not.toContain('.cursor/skills/');
  });

  it('mcp.json: e2e commands ship playwright, mobile ships browserstack, mixed ships both', async () => {
    await exportPlugin(base()); // e2e-playwright archetype
    let mcp = await fs.readJson(path.join(outDir, 'ko-e2e', 'mcp.json'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['playwright']);

    await exportPlugin({ ...base(), name: 'ko-mobile', commands: ['ko-mobile-test', 'ko-mobile-heal'] });
    mcp = await fs.readJson(path.join(outDir, 'ko-mobile', 'mcp.json'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['browserstack']);

    await exportPlugin({ ...base(), name: 'ko-all', commands: [...E2E_COMMANDS, 'ko-mobile-test'] });
    mcp = await fs.readJson(path.join(outDir, 'ko-all', 'mcp.json'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['browserstack', 'playwright']);
  });

  it('hooks: false omits the hooks folder and manifest key', async () => {
    await exportPlugin({ ...base(), name: 'lean', hooks: false });
    const manifest = await fs.readJson(path.join(outDir, 'lean', '.cursor-plugin', 'plugin.json'));
    expect(manifest.hooks).toBeUndefined();
    expect(await fs.pathExists(path.join(outDir, 'lean', 'hooks'))).toBe(false);
  });

  it('emits an MIT LICENSE and honours author omission', async () => {
    await exportPlugin(base());
    expect(await fs.readFile(path.join(outDir, 'ko-e2e', 'LICENSE'), 'utf-8')).toContain('MIT License');
    const opts = base(); delete opts.author;
    await exportPlugin({ ...opts, name: 'noname' });
    const manifest = await fs.readJson(path.join(outDir, 'noname', '.cursor-plugin', 'plugin.json'));
    expect('author' in manifest).toBe(false);
  });
});

describe('exportCommand --plugin', () => {
  it('single-command bundle gets the marketplace manifest shape too', async () => {
    await exportCommand('ko-e2e-heal', templateDir, outDir, { plugin: true, author: AUTHOR });
    const manifest = await fs.readJson(path.join(outDir, 'ko-e2e-heal', '.cursor-plugin', 'plugin.json'));
    expect(manifest).toMatchObject({ name: 'ko-e2e-heal', version: '1.0.0', license: 'MIT', author: AUTHOR });
    expect(manifest.commands).toBe('./commands/');
    expect(await fs.pathExists(path.join(outDir, 'ko-e2e-heal', 'LICENSE'))).toBe(true);
  });
});
