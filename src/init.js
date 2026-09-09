// ko-qa-kit/src/init.js
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs-extra';
import prompts from 'prompts';
import { readManifest, writeManifest, pruneOrphans } from 'kit-core';
import { detectArchetype, ARCHETYPES } from './detect.js';
import { scaffoldProject, pruneProject, getMcpSuggestions, MANIFEST_REL_PATH } from './scaffold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates');
const KIT_VERSION = fs.readJsonSync(path.resolve(__dirname, '..', 'package.json')).version;

export const ARCHETYPE_LABELS = {
  'mobile-appium': 'Mobile Appium + Cucumber-JVM (Java + BrowserStack)',
  'e2e-playwright': 'Playwright BDD End-to-End Tests',
};

export async function runInit(projectDir, options = {}) {
  console.log(chalk.blue('\nko-qa-kit init\n'));
  console.log(chalk.dim('Scanning project...'));

  const manifest = await readManifest(projectDir, MANIFEST_REL_PATH);

  let archetype = null;
  if (options.archetype) {
    if (!ARCHETYPES.includes(options.archetype)) {
      console.log(chalk.red(`Unknown archetype "${options.archetype}". Valid: ${ARCHETYPES.join(', ')}`));
      return;
    }
    archetype = options.archetype;
    console.log(`  Archetype: ${chalk.green.bold(ARCHETYPE_LABELS[archetype])}`);
  } else {
    archetype = await detectArchetype(projectDir) ?? manifest?.archetype ?? null;
    if (archetype) {
      console.log(`  Detected: ${chalk.green.bold(ARCHETYPE_LABELS[archetype])}\n`);
      const { confirmed } = await prompts({
        type: 'confirm', name: 'confirmed',
        message: `Use ${ARCHETYPE_LABELS[archetype]}?`, initial: true,
      });
      if (!confirmed) archetype = null;
    }
    if (!archetype) {
      const { selected } = await prompts({
        type: 'select', name: 'selected',
        message: 'Select project archetype:',
        choices: Object.entries(ARCHETYPE_LABELS).map(([value, title]) => ({ title, value })),
      });
      archetype = selected;
    }
  }

  if (!archetype) {
    console.log(chalk.yellow('Cancelled.'));
    return;
  }

  console.log(chalk.dim('\nScaffolding files...'));
  const result = await scaffoldProject(projectDir, archetype, TEMPLATE_DIR, options);

  if (result.created.length > 0) {
    console.log(chalk.green('\nCreated:'));
    for (const file of result.created) console.log(chalk.green(`  ✓ ${file}`));
  }
  if (result.updated.length > 0) {
    console.log(chalk.cyan('\nUpdated:'));
    for (const file of result.updated) console.log(chalk.cyan(`  ↻ ${file}`));
  }
  if (result.skipped.length > 0) {
    const label = options.overwrite === false
      ? 'Skipped (--no-overwrite):'
      : 'Skipped (user-protected — edit manually if you want kit defaults):';
    console.log(chalk.yellow(`\n${label}`));
    for (const file of result.skipped) console.log(chalk.yellow(`  ⊘ ${file}`));
  }

  const pruneResult = await pruneProject(projectDir, archetype, TEMPLATE_DIR);
  if (pruneResult.removed.length > 0) {
    console.log(chalk.red('\nPruned (wrong archetype):'));
    for (const file of pruneResult.removed) console.log(chalk.red(`  ✕ ${file}`));
  }

  const orphanResult = await pruneOrphans(projectDir, result.owned, manifest, { selfManifestRelPath: MANIFEST_REL_PATH });
  if (orphanResult.removed.length > 0) {
    console.log(chalk.red('\nRemoved (no longer shipped by the kit):'));
    for (const file of orphanResult.removed) console.log(chalk.red(`  ✕ ${file}`));
  }
  if (orphanResult.kept.length > 0) {
    console.log(chalk.yellow('\nKept (no longer shipped, but modified by you):'));
    for (const file of orphanResult.kept) console.log(chalk.yellow(`  ⊘ ${file}`));
  }
  if (orphanResult.shared.length > 0) {
    console.log(chalk.dim('\nKept (still used by another installed kit):'));
    for (const file of orphanResult.shared) console.log(chalk.dim(`  ⊘ ${file}`));
  }

  await writeManifest(projectDir, MANIFEST_REL_PATH, { kitVersion: KIT_VERSION, archetype, files: result.owned });

  if (result.updated.length > 0) {
    console.log(chalk.dim('\nIf you customized any updated files, recover from git history (e.g. `git checkout HEAD -- <path>`).'));
  }

  const mcpSuggestions = await getMcpSuggestions(projectDir, archetype, TEMPLATE_DIR);
  if (mcpSuggestions.length > 0) {
    console.log(chalk.yellow('\nYour .cursor/mcp.json is missing recommended MCP server(s) — merge into "mcpServers":'));
    for (const { name, config } of mcpSuggestions) {
      console.log(chalk.dim(`  "${name}": ${JSON.stringify(config, null, 2).replace(/\n/g, '\n  ')}`));
    }
  }

  console.log(chalk.green.bold('\nDone! Open this repo in Cursor to use the kit.\n'));
}

export async function runPrune(projectDir) {
  console.log(chalk.blue('\nko-qa-kit prune\n'));
  console.log(chalk.dim('Scanning project...'));

  let archetype = await detectArchetype(projectDir);
  if (archetype) {
    console.log(`  Detected: ${chalk.green.bold(ARCHETYPE_LABELS[archetype])}\n`);
    const { confirmed } = await prompts({
      type: 'confirm', name: 'confirmed',
      message: `Prune resources that don't belong to ${ARCHETYPE_LABELS[archetype]}?`, initial: true,
    });
    if (!confirmed) archetype = null;
  }
  if (!archetype) {
    const { selected } = await prompts({
      type: 'select', name: 'selected',
      message: 'Select project archetype to prune for:',
      choices: Object.entries(ARCHETYPE_LABELS).map(([value, title]) => ({ title, value })),
    });
    archetype = selected;
  }
  if (!archetype) {
    console.log(chalk.yellow('Cancelled.'));
    return;
  }

  const result = await pruneProject(projectDir, archetype, TEMPLATE_DIR);
  if (result.removed.length > 0) {
    console.log(chalk.red('\nRemoved:'));
    for (const file of result.removed) console.log(chalk.red(`  ✕ ${file}`));
  } else {
    console.log(chalk.green('\nNo resources to prune — everything matches the archetype.'));
  }
  console.log(chalk.green.bold('\nDone!\n'));
}
