// ko-qa-kit/src/scaffold.js
import path from 'path';
import * as engine from './scaffold-core/index.js';

export const MANIFEST_REL_PATH = path.join('.cursor', '.ko-qa-kit-manifest.json');

// QA archetype restrictions. coding-standards.mdc and all unrestricted resources
// install for every archetype. A repo matching BOTH archetypes gets the union.
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
  rules: {
    'e2e-playwright': ['e2e-playwright'],
    'mobile-appium': ['mobile-appium'],
  },
};

// No manual tier in this kit yet — every command auto-installs for its archetype.
export const MANUAL_INSTALL_COMMANDS = [];

export const getCommandEntries = (templateDir) => engine.getCommandEntries(templateDir);

export const scaffoldProject = (projectDir, archetype, templateDir, options) =>
  engine.scaffoldProject(projectDir, archetype, templateDir, ARCHETYPE_RESOURCES, options);

export const pruneProject = (projectDir, archetype, templateDir) =>
  engine.pruneProject(projectDir, archetype, templateDir, ARCHETYPE_RESOURCES);

export const { installResource, listAvailableResources, getMcpSuggestions } = engine;

export const uninstallResource = (projectDir, type, name, templateDir) =>
  engine.uninstallResource(projectDir, type, name, templateDir, MANIFEST_REL_PATH);
