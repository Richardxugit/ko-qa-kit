// ko-qa-kit/tests/detect.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectArchetype, ARCHETYPES } from '../src/detect.js';

describe('detectArchetype', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qakit-detect-')); });
  afterEach(async () => { await fs.remove(tmpDir); });

  it('exposes exactly the 2 qa archetypes, mobile-appium first', () => {
    expect(ARCHETYPES).toEqual(['mobile-appium', 'e2e-playwright']);
  });

  it('detects mobile-appium from pom.xml with java-client + cucumber-java', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependencies><dependency><artifactId>java-client</artifactId></dependency>' +
      '<dependency><artifactId>cucumber-java</artifactId></dependency></dependencies></project>');
    expect(await detectArchetype(tmpDir)).toBe('mobile-appium');
  });

  it('detects e2e-playwright from @playwright/test + playwright-bdd', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), {
      dependencies: { '@playwright/test': '^1.40.0', 'playwright-bdd': '^6.0.0' },
    });
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('detects e2e-playwright from @playwright/test + a .feature file', async () => {
    await fs.outputJson(path.join(tmpDir, 'package.json'), { dependencies: { '@playwright/test': '^1.40.0' } });
    await fs.outputFile(path.join(tmpDir, 'features', 'login.feature'), 'Feature: login');
    expect(await detectArchetype(tmpDir)).toBe('e2e-playwright');
  });

  it('mobile-appium wins over e2e-playwright when both signals are present', async () => {
    await fs.outputFile(path.join(tmpDir, 'pom.xml'),
      '<project><dependencies><dependency><artifactId>java-client</artifactId></dependency>' +
      '<dependency><artifactId>cucumber-java</artifactId></dependency></dependencies></project>');
    await fs.outputJson(path.join(tmpDir, 'package.json'), { dependencies: { '@playwright/test': '^1.40.0' } });
    expect(await detectArchetype(tmpDir)).toBe('mobile-appium');
  });

  it('returns null for an unrecognized repo', async () => {
    expect(await detectArchetype(tmpDir)).toBeNull();
  });
});
