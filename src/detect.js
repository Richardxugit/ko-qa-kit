// ko-qa-kit/src/detect.js
import fs from 'fs-extra';
import path from 'path';

export const ARCHETYPES = ['mobile-appium', 'e2e-playwright'];

export async function detectArchetype(projectDir) {
  if (await isMobileAppium(projectDir)) return 'mobile-appium';
  const pkg = await readPackageJson(projectDir);
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  if (await isE2ePlaywright(projectDir, deps)) return 'e2e-playwright';
  return null;
}

async function isMobileAppium(dir) {
  const pomPath = path.join(dir, 'pom.xml');
  if (!await fs.pathExists(pomPath)) return false;
  let pom;
  try {
    pom = await fs.readFile(pomPath, 'utf-8');
  } catch {
    return false;
  }
  const hasAppium = pom.includes('<artifactId>java-client</artifactId>');
  const hasCucumberJvm = pom.includes('<artifactId>cucumber-java</artifactId>')
    || pom.includes('<artifactId>cucumber-junit-platform-engine</artifactId>')
    || pom.includes('<artifactId>cucumber-junit</artifactId>');
  return hasAppium && hasCucumberJvm;
}

async function isE2ePlaywright(dir, deps) {
  const hasPlaywright = '@playwright/test' in deps || 'playwright' in deps;
  if (!hasPlaywright) return false;
  const hasBdd = 'playwright-bdd' in deps || '@cucumber/cucumber' in deps;
  if (hasBdd) return true;
  return await hasFeatureFiles(dir);
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
