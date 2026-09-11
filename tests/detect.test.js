// ko-qa-kit/tests/detect.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectArchetype, detectArchetypes, ARCHETYPES } from '../src/detect.js';

describe('detectArchetype', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-qa-detect-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('exposes exactly the 2 QA archetypes', () => {
    expect(ARCHETYPES).toEqual(['mobile-appium', 'e2e-playwright']);
  });

  it('detects mobile-appium from pom.xml with appium + cucumber-jvm', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependency><artifactId>java-client</artifactId></dependency>'
      + '<dependency><artifactId>cucumber-java</artifactId></dependency></project>');
    expect(await detectArchetype(tmpDir)).toBe('mobile-appium');
  });

  it('rejects pom.xml with appium but no cucumber runner', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependency><artifactId>java-client</artifactId></dependency></project>');
    expect(await detectArchetype(tmpDir)).toBeNull();
  });

  it('detects e2e-playwright from playwright + playwright-bdd deps', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      devDependencies: { '@playwright/test': '^1.40.0', 'playwright-bdd': '^7.0.0' },
    });
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('detects e2e-playwright from playwright dep + .feature files', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      devDependencies: { '@playwright/test': '^1.40.0' },
    });
    await fs.outputFile(path.join(tmpDir, 'tests', 'login.feature'), 'Feature: login\n');
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('rejects playwright without any BDD signal', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      devDependencies: { '@playwright/test': '^1.40.0' },
    });
    expect(await detectArchetype(tmpDir)).toBeNull();
  });

  it('detects mobile-appium from a pom.xml one level down (apps/mobile-tests/)', async () => {
    await fs.outputFile(path.join(tmpDir, 'apps', 'mobile-tests', 'pom.xml'),
      '<project><dependency><artifactId>java-client</artifactId></dependency>'
      + '<dependency><artifactId>cucumber-junit</artifactId></dependency></project>');
    expect(await detectArchetype(tmpDir)).toBe('mobile-appium');
  });

  it('detects e2e-playwright when playwright only exists in a workspace sub-package', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), { name: 'root', private: true });
    await fs.outputJson(path.join(tmpDir, 'apps', 'e2e', 'package.json'), {
      devDependencies: { '@playwright/test': '^1.40.0', '@cucumber/cucumber': '^10.0.0' },
    });
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('detects e2e-playwright from a root-level e2e/ package', async () => {
    await fs.outputJson(path.join(tmpDir, 'e2e', 'package.json'), {
      devDependencies: { playwright: '^1.40.0', 'playwright-bdd': '^7.0.0' },
    });
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('returns null for an unrecognized repo', async () => {
    expect(await detectArchetype(tmpDir)).toBeNull();
  });
});

describe('detectArchetypes (multi)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-qa-detect-multi-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('returns all matches with evidence, priority order', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependency><artifactId>java-client</artifactId></dependency>'
      + '<dependency><artifactId>cucumber-java</artifactId></dependency></project>');
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      devDependencies: { '@playwright/test': '^1.40.0', 'playwright-bdd': '^7.0.0' },
    });
    const found = await detectArchetypes(tmpDir);
    expect(found.map(f => f.archetype)).toEqual(['mobile-appium', 'e2e-playwright']);
    expect(found[0].reasons.join()).toContain('java-client');
    expect(found[1].reasons.join()).toContain('@playwright/test');
  });

  it('a package.json for tooling only does not block mobile-appium detection', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependency><artifactId>java-client</artifactId></dependency>'
      + '<dependency><artifactId>cucumber-junit-platform-engine</artifactId></dependency></project>');
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      devDependencies: { '@commitlint/cli': '^19.0.0' },
    });
    const found = await detectArchetypes(tmpDir);
    expect(found.map(f => f.archetype)).toEqual(['mobile-appium']);
  });

  it('returns an empty array for an unrecognized repo', async () => {
    expect(await detectArchetypes(tmpDir)).toEqual([]);
  });
});
