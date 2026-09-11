// ko-qa-kit/src/init.js
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs-extra';
import prompts from 'prompts';
import { readManifest, writeManifest, pruneOrphans } from './scaffold-core/index.js';
import { detectArchetypes, ARCHETYPES } from './detect.js';
import { scaffoldProject, pruneProject, getMcpSuggestions, MANIFEST_REL_PATH } from './scaffold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates');
const KIT_VERSION = fs.readJsonSync(path.resolve(__dirname, '..', 'package.json')).version;

export const ARCHETYPE_LABELS = {
  'e2e-playwright': 'Web E2E (Playwright BDD + step registry)',
  'mobile-appium': 'Mobile (Java + Cucumber-JVM + Appium on BrowserStack)',
};

const describeArchetypes = (archetypes) =>
  archetypes.map(a => ARCHETYPE_LABELS[a] ?? a).join(' + ');

export async function runInit(projectDir, options = {}) {
  console.log(chalk.blue('\nko-qa-kit init\n'));
  console.log(chalk.dim('Scanning project...'));

  const manifest = await readManifest(projectDir, MANIFEST_REL_PATH);

  let archetypes = [];
  if (options.archetype) {
    archetypes = options.archetype.split(',').map(s => s.trim()).filter(Boolean);
    const invalid = archetypes.filter(a => !ARCHETYPES.includes(a));
    if (invalid.length > 0) {
      console.log(chalk.red(`Unknown archetype "${invalid.join(', ')}". Valid: ${ARCHETYPES.join(', ')}`));
      return;
    }
    console.log(`  Archetype: ${chalk.green.bold(describeArchetypes(archetypes))}`);
  } else {
    const detected = await detectArchetypes(projectDir);
    const reasons = Object.fromEntries(detected.map(d => [d.archetype, d.reasons]));
    archetypes = detected.map(d => d.archetype);
    if (archetypes.length === 0) {
      archetypes = manifest?.archetypes ?? (manifest?.archetype ? [manifest.archetype] : []);
    }
    if (archetypes.length > 0) {
      console.log(`  Detected: ${chalk.green.bold(describeArchetypes(archetypes))}`);
      for (const a of archetypes) {
        if (reasons[a]) console.log(chalk.dim(`    ${a}: ${reasons[a].join(', ')}`));
      }
      console.log();
      const { confirmed } = await prompts({
        type: 'confirm', name: 'confirmed',
        message: `Use ${describeArchetypes(archetypes)}?`, initial: true,
      });
      if (!confirmed) archetypes = [];
    }
    if (archetypes.length === 0) {
      const { selected } = await prompts({
        type: 'multiselect', name: 'selected',
        message: 'Select project archetypes (space to select — pick all that apply):',
        choices: Object.entries(ARCHETYPE_LABELS).map(([value, title]) => ({ title, value })),
      });
      archetypes = selected ?? [];
    }
  }

  if (archetypes.length === 0) {
    console.log(chalk.yellow('Cancelled.'));
    return;
  }

  console.log(chalk.dim('\nScaffolding files...'));
  const result = await scaffoldProject(projectDir, archetypes, TEMPLATE_DIR, { ...options, manifest });

  if (result.created.length > 0) {
    console.log(chalk.green('\nCreated:'));
    for (const file of result.created) console.log(chalk.green(`  ✓ ${file}`));
  }
  if (result.updated.length > 0) {
    console.log(chalk.cyan('\nUpdated:'));
    for (const file of result.updated) console.log(chalk.cyan(`  ↻ ${file}`));
  }
  if (result.mergeNeeded.length > 0) {
    console.log(chalk.yellow('\nKept your version (kit update saved next to it — merge manually):'));
    for (const file of result.mergeNeeded) console.log(chalk.yellow(`  ⇄ ${file} (new: ${file}.kit-update)`));
  }
  if (result.skipped.length > 0) {
    const label = options.overwrite === false
      ? 'Skipped (--no-overwrite):'
      : 'Skipped (user-protected — edit manually if you want kit defaults):';
    console.log(chalk.yellow(`\n${label}`));
    for (const file of result.skipped) console.log(chalk.yellow(`  ⊘ ${file}`));
  }

  const pruneResult = await pruneProject(projectDir, archetypes, TEMPLATE_DIR);
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

  await writeManifest(projectDir, MANIFEST_REL_PATH, { kitVersion: KIT_VERSION, archetypes, files: result.owned });

  if (result.updated.length > 0) {
    console.log(chalk.dim('\nIf you customized any updated files, recover from git history (e.g. `git checkout HEAD -- <path>`).'));
  }

  const mcpSuggestions = await getMcpSuggestions(projectDir, archetypes, TEMPLATE_DIR);
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

  let archetypes = (await detectArchetypes(projectDir)).map(d => d.archetype);
  if (archetypes.length > 0) {
    console.log(`  Detected: ${chalk.green.bold(describeArchetypes(archetypes))}\n`);
    const { confirmed } = await prompts({
      type: 'confirm', name: 'confirmed',
      message: `Prune resources that don't belong to ${describeArchetypes(archetypes)}?`, initial: true,
    });
    if (!confirmed) archetypes = [];
  }
  if (archetypes.length === 0) {
    const { selected } = await prompts({
      type: 'multiselect', name: 'selected',
      message: 'Select project archetypes to prune for:',
      choices: Object.entries(ARCHETYPE_LABELS).map(([value, title]) => ({ title, value })),
    });
    archetypes = selected ?? [];
  }
  if (archetypes.length === 0) {
    console.log(chalk.yellow('Cancelled.'));
    return;
  }

  const result = await pruneProject(projectDir, archetypes, TEMPLATE_DIR);
  if (result.removed.length > 0) {
    console.log(chalk.red('\nRemoved:'));
    for (const file of result.removed) console.log(chalk.red(`  ✕ ${file}`));
  } else {
    console.log(chalk.green('\nNo resources to prune — everything matches the archetype.'));
  }
  console.log(chalk.green.bold('\nDone!\n'));
}
