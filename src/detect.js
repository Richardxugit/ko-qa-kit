// ko-qa-kit/src/detect.js
import fs from 'fs-extra';
import path from 'path';

// Priority order — also the order rules/AGENTS.md/mcp variants resolve in when
// a repo matches multiple archetypes (e.g. web e2e + mobile suites in one repo).
export const ARCHETYPES = ['mobile-appium', 'e2e-playwright'];

/**
 * Detect ALL QA archetypes a repo matches, with the evidence for each.
 * A repo can legitimately be both (web e2e suite + mobile suite).
 *
 * @returns {Promise<{ archetype: string, reasons: string[] }[]>}
 */
export async function detectArchetypes(projectDir) {
  const deps = await readWorkspaceDeps(projectDir);
  const found = [];
  const mobile = await mobileAppiumReasons(projectDir);
  if (mobile) found.push({ archetype: 'mobile-appium', reasons: mobile });
  const e2e = await e2ePlaywrightReasons(projectDir, deps);
  if (e2e) found.push({ archetype: 'e2e-playwright', reasons: e2e });
  return found;
}

/**
 * @returns {Promise<string|null>} The highest-priority matching archetype, or null.
 */
export async function detectArchetype(projectDir) {
  const found = await detectArchetypes(projectDir);
  return found.length > 0 ? found[0].archetype : null;
}

async function mobileAppiumReasons(dir) {
  // pom.xml can live at the root or one level down (apps/mobile-tests/, ...)
  const pomPaths = [path.join(dir, 'pom.xml')];
  for (const sub of [...WORKSPACE_DIRS, ...QA_HINT_DIRS]) {
    const subDir = path.join(dir, sub);
    if (!await fs.pathExists(subDir)) continue;
    let entries = [];
    try {
      entries = await fs.readdir(subDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) pomPaths.push(path.join(subDir, entry.name, 'pom.xml'));
    }
  }
  for (const hint of QA_HINT_DIRS) {
    pomPaths.push(path.join(dir, hint, 'pom.xml'));
  }
  for (const pomPath of pomPaths) {
    let pom;
    try {
      pom = await fs.readFile(pomPath, 'utf-8');
    } catch {
      continue;
    }
    const hasAppium = pom.includes('<artifactId>java-client</artifactId>');
    const cucumber = ['cucumber-java', 'cucumber-junit-platform-engine', 'cucumber-junit']
      .find(a => pom.includes(`<artifactId>${a}</artifactId>`));
    if (hasAppium && cucumber) {
      const rel = path.relative(dir, pomPath);
      return [`pom.xml (${rel}): appium java-client + ${cucumber}`];
    }
  }
  return null;
}

async function e2ePlaywrightReasons(dir, deps) {
  const pw = ['@playwright/test', 'playwright'].find(d => d in deps);
  if (!pw) return null;
  const reasons = [`${pw} dependency`];
  const bdd = ['playwright-bdd', '@cucumber/cucumber'].find(d => d in deps);
  if (bdd) {
    reasons.push(`${bdd} dependency`);
    return reasons;
  }
  if (await hasFeatureFiles(dir)) {
    reasons.push('**/*.feature files');
    return reasons;
  }
  return null; // playwright alone (no BDD) is not this archetype
}

// Monorepos keep test-suite deps in sub-package package.json files
// (apps/e2e/, e2e/, ...) — merge deps from the root and one level of
// common workspace dirs so signals are not missed.
const WORKSPACE_DIRS = ['apps', 'packages', 'libs', 'services'];
const QA_HINT_DIRS = ['e2e', 'tests', 'test', 'mobile-tests', 'ui-tests'];

async function readWorkspaceDeps(rootDir) {
  const deps = {};
  const merge = (pkg) => {
    if (pkg) Object.assign(deps, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
  };
  merge(await readPackageJson(rootDir));
  for (const hint of QA_HINT_DIRS) {
    merge(await readPackageJson(path.join(rootDir, hint)));
  }
  for (const sub of WORKSPACE_DIRS) {
    const dir = path.join(rootDir, sub);
    if (!await fs.pathExists(dir)) continue;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      merge(await readPackageJson(path.join(dir, entry.name)));
    }
  }
  return deps;
}

async function readPackageJson(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!await fs.pathExists(pkgPath)) return null;
  try {
    return await fs.readJson(pkgPath);
  } catch {
    return null;
  }
}

async function hasFeatureFiles(dir, depth = 3) {
  if (depth < 0) return false;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await hasFeatureFiles(full, depth - 1)) return true;
    } else if (entry.name.endsWith('.feature')) {
      return true;
    }
  }
  return false;
}
