// ko-qa-kit/tests/scaffold.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { scaffoldProject, pruneProject, MANIFEST_REL_PATH } from '../src/scaffold.js';
import { readManifest, hashFile } from '../src/scaffold-core/manifest.js';

const templateDir = path.resolve('templates');

describe('scaffoldProject', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-qa-scaffold-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('installs the union for a repo matching both archetypes', async () => {
    const result = await scaffoldProject(tmpDir, ['mobile-appium', 'e2e-playwright'], templateDir);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-e2e-test.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-mobile-test.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'agents', 'e2e-debugger.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'agents', 'test-debugger.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'rules', 'coding-standards.mdc'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'rules', 'e2e-playwright.mdc'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'rules', 'mobile-appium.mdc'))).toBe(true);
    const manifest = await readManifest(tmpDir, MANIFEST_REL_PATH);
    expect(manifest.archetypes).toEqual(['mobile-appium', 'e2e-playwright']);
    expect(result.owned.length).toBeGreaterThan(0);
  });

  it('single archetype gets only its own resources + shared coding-standards', async () => {
    await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-e2e-test.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-mobile-test.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'rules', 'mobile-appium.mdc'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'rules', 'coding-standards.mdc'))).toBe(true);
  });

  it('prune removes resources restricted to the other archetype', async () => {
    await scaffoldProject(tmpDir, ['mobile-appium', 'e2e-playwright'], templateDir);
    const result = await pruneProject(tmpDir, ['e2e-playwright'], templateDir);
    expect(result.removed).toContain('.cursor/commands/ko-mobile-test.md');
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-mobile-test.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '.cursor', 'commands', 'ko-e2e-test.md'))).toBe(true);
  });

  it('overwrites an unmodified kit rule when the kit ships a new version', async () => {
    await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    const rulePath = path.join(tmpDir, '.cursor', 'rules', 'e2e-playwright.mdc');
    const templatePath = path.join(templateDir, 'rules', 'e2e-playwright.mdc');
    const original = await fs.readFile(templatePath, 'utf-8');
    try {
      await fs.writeFile(templatePath, original + '\n<!-- kit v2 -->
');
      await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
      // file matched the manifest (user never edited) → kit upgrade lands in place
      expect(await fs.readFile(rulePath, 'utf-8')).toContain('kit v2');
      expect(await fs.pathExists(`${rulePath}.kit-update`)).toBe(false);
    } finally {
      await fs.writeFile(templatePath, original);
    }
  });

  it('preserves a user-edited rule, writes kit version as .kit-update', async () => {
    await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    const rulePath = path.join(tmpDir, '.cursor', 'rules', 'e2e-playwright.mdc');
    const manifest = await readManifest(tmpDir, MANIFEST_REL_PATH);
    const entry = manifest.files.find(f => f.path === '.cursor/rules/e2e-playwright.mdc');
    expect(entry.sha256).toBe(await hashFile(rulePath)); // sanity: manifest hash matches
    await fs.writeFile(rulePath, 'my custom edits\n');
    const result = await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    expect(await fs.readFile(rulePath, 'utf-8')).toBe('my custom edits\n');
    expect(await fs.pathExists(`${rulePath}.kit-update`)).toBe(true);
    expect(result.mergeNeeded).toContain('.cursor/rules/e2e-playwright.mdc');
  });

  it('multi-archetype repos get the UNION of recommended mcp servers', async () => {
    await scaffoldProject(tmpDir, ['mobile-appium', 'e2e-playwright'], templateDir);
    const mcp = await fs.readJson(path.join(tmpDir, '.cursor', 'mcp.json'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['browserstack', 'playwright']);
  });

  it('mcp.json is user-protected (never overwritten)', async () => {
    await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    const first = await fs.readJson(path.join(tmpDir, '.cursor', 'mcp.json'));
    expect(Object.keys(first.mcpServers)).toEqual(['playwright']);
    first.mcpServers['my-own'] = { url: 'http://localhost:1234' };
    await fs.writeJson(path.join(tmpDir, '.cursor', 'mcp.json'), first);
    const result = await scaffoldProject(tmpDir, ['mobile-appium'], templateDir);
    const after = await fs.readJson(path.join(tmpDir, '.cursor', 'mcp.json'));
    expect(after.mcpServers['my-own']).toBeDefined();
    expect(result.skipped).toContain('.cursor/mcp.json');
  });

  it('multi-archetype repos get a minimal AGENTS.md skeleton, not an archetype template', async () => {
    await scaffoldProject(tmpDir, ['mobile-appium', 'e2e-playwright'], templateDir);
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('multi-archetype repo');
    expect(agents).toContain('mobile-appium + e2e-playwright');
    expect(agents).toContain('.cursor/rules/e2e-playwright.mdc');
  });

  it('single-archetype repos still get the archetype AGENTS.md template', async () => {
    await scaffoldProject(tmpDir, ['e2e-playwright'], templateDir);
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agents).not.toContain('multi-archetype repo');
  });

  it('never overwrites an existing AGENTS.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), 'hand-written\n');
    const result = await scaffoldProject(tmpDir, ['mobile-appium', 'e2e-playwright'], templateDir);
    expect(await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe('hand-written\n');
    expect(result.skipped).toContain('AGENTS.md');
  });
});
