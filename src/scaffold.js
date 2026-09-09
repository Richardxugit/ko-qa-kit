// ko-qa-kit/src/scaffold.js
import path from 'path';
import * as engine from 'kit-core';

export const COMMAND_FOLDERS = ['qa'];
export const MANIFEST_REL_PATH = path.join('.cursor', '.ko-qa-kit-manifest.json');

// QA-only: every resource is restricted to exactly one of the 2 archetypes,
// never shared between them (a repo only ever matches one).
export const ARCHETYPE_RESOURCES = {
  agents: {
    'qa-automation-engineer': ['e2e-playwright'],
    'e2e-debugger': ['e2e-playwright'],
    'test-generator': ['mobile-appium'],
    'test-debugger': ['mobile-appium'],
  },
  commands: {
    'ko-e2e-test': ['e2e-playwright'],
    'ko-e2e-heal': ['e2e-playwright'],
    'ko-mobile-test': ['mobile-appium'],
    'ko-mobile-heal': ['mobile-appium'],
  },
  skills: {
    'playwright-bdd': ['e2e-playwright'],
    'bdd-authoring': ['e2e-playwright'],
    'step-registry': ['e2e-playwright'],
    'dom-sight': ['e2e-playwright'],
    'mobile-browserstack-triage': ['mobile-appium'],
  },
};

export const getCommandEntries = (templateDir) => engine.getCommandEntries(templateDir);

export const scaffoldProject = (projectDir, archetype, templateDir, options) =>
  engine.scaffoldProject(projectDir, archetype, templateDir, ARCHETYPE_RESOURCES, options);

export const pruneProject = (projectDir, archetype, templateDir) =>
  engine.pruneProject(projectDir, archetype, templateDir, ARCHETYPE_RESOURCES);

export const installFolder = (projectDir, folderName, templateDir, options) =>
  engine.installFolder(projectDir, folderName, templateDir, ARCHETYPE_RESOURCES, options);

export const { installResource, listAvailableResources, getMcpSuggestions } = engine;

export const uninstallResource = (projectDir, type, name, templateDir) =>
  engine.uninstallResource(projectDir, type, name, templateDir, MANIFEST_REL_PATH);
