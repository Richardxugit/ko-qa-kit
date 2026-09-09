#!/usr/bin/env node
import { program } from 'commander';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import prompts from 'prompts';
import { parseFrontmatter } from 'kit-core';
import { runInit, runPrune } from '../src/init.js';
import {
  installResource, uninstallResource, installFolder, listAvailableResources,
  getCommandEntries, COMMAND_FOLDERS, MANIFEST_REL_PATH, ARCHETYPE_RESOURCES,
} from '../src/scaffold.js';
import { detectArchetype } from '../src/detect.js';
import { exportCommand, exportPlugin } from 'kit-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates');
const pkg = fs.readJsonSync(path.resolve(__dirname, '..', 'package.json'));

program.name('ko-qa-kit').description('Scaffold Cursor configuration for QA automation repos').version(pkg.version);

program
  .command('init')
  .description('Initialize Cursor configuration in the current project')
  .option('--no-overwrite', "Do not overwrite existing kit-managed files (today's behavior)")
  .option('--archetype <archetype>', 'Skip detection and prompts, scaffold for this archetype')
  .action(async (opts) => {
    await runInit(process.cwd(), { overwrite: opts.overwrite, archetype: opts.archetype });
  });

program
  .command('prune')
  .description("Remove resources that don't match the project archetype")
  .action(async () => { await runPrune(process.cwd()); });

program
  .command('install <type> <name>')
  .description('Install a single resource (skill, agent, command, hook) or a whole command folder: install folder qa')
  .option('-g, --global', 'Install to ~/.cursor/ (available across all repos)')
  .option('--no-overwrite', 'Do not overwrite existing files')
  .option('--all', 'With "folder": also install commands restricted to archetypes this repo does not match')
  .action(async (type, name, opts) => {
    const targetDir = opts.global ? os.homedir() : process.cwd();
    let result;
    if (type === 'folder' || type === 'folders') {
      const archetype = opts.global ? null : await detectArchetype(targetDir);
      result = await installFolder(targetDir, name, TEMPLATE_DIR, { overwrite: opts.overwrite, all: opts.all, archetype });
    } else {
      result = await installResource(targetDir, type, name, TEMPLATE_DIR, { overwrite: opts.overwrite });
    }
    printInstallResult(result, opts.global);
  });

program
  .command('uninstall <type> <name>')
  .description('Remove a single installed resource (skill, agent, command, hook) — kept if another installed kit still needs it')
  .option('-g, --global', 'Uninstall from ~/.cursor/')
  .action(async (type, name, opts) => {
    const targetDir = opts.global ? os.homedir() : process.cwd();
    const result = await uninstallResource(targetDir, type, name, TEMPLATE_DIR);
    if (result.error) {
      console.log(chalk.red(`\n${result.error}\n`));
      process.exit(1);
    }
    if (result.kept) {
      console.log(chalk.yellow(`\nKept ${result.kept[0]} — ${result.reason}.\n`));
      return;
    }
    console.log(chalk.green(`\nRemoved:`));
    for (const file of result.removed) console.log(chalk.green(`  ✕ ${file}`));
    console.log();
  });

program
  .command('list')
  .description('List all available resources')
  .action(() => {
    const resources = listAvailableResources(TEMPLATE_DIR);
    console.log(chalk.blue('\nAvailable resources:\n'));
    for (const [type, names] of Object.entries(resources)) {
      console.log(chalk.bold(`  ${type}:`));
      for (const name of names) console.log(chalk.dim(`    ${name}`));
      console.log();
    }
  });

program
  .command('export <command-name>')
  .description('Export a command with all its dependencies as a portable bundle')
  .option('-o, --output <dir>', 'Output directory', 'exported')
  .option('--plugin', 'Include .cursor-plugin/plugin.json so the bundle installs as a Cursor plugin')
  .action(async (commandName, opts) => {
    const result = await exportCommand(commandName, TEMPLATE_DIR, path.resolve(opts.output), { plugin: opts.plugin, version: pkg.version });
    printExportResult(result);
  });

program
  .command('export-plugin')
  .description('Mint a custom Cursor plugin from chosen commands (interactive when no flags given)')
  .option('-n, --name <name>', 'Plugin name (kebab-case)')
  .option('-c, --commands <names>', 'Comma-separated command names to include')
  .option('-d, --description <text>', 'Plugin description')
  .option('-o, --output <dir>', 'Output directory', 'exported')
  .action(async (opts) => {
    const picked = await resolveExportPluginArgs(opts, TEMPLATE_DIR, COMMAND_FOLDERS);
    const result = await exportPlugin({
      name: picked.name, commands: picked.commands, description: picked.description,
      templateDir: TEMPLATE_DIR, outputDir: path.resolve(opts.output), resourceMap: ARCHETYPE_RESOURCES,
    });
    printExportResult(result);
  });

program.parse();

function printInstallResult(result, isGlobal) {
  if (result.error) {
    console.log(chalk.red(`\n${result.error}\n`));
    process.exit(1);
  }
  const prefix = isGlobal ? '~/' : '';
  if (result.created.length > 0) {
    console.log(chalk.green(`\nInstalled${isGlobal ? ' (global)' : ''}:`));
    for (const file of result.created) console.log(chalk.green(`  ✓ ${prefix}${file}`));
  }
  if (result.updated.length > 0) {
    console.log(chalk.cyan('\nUpdated:'));
    for (const file of result.updated) console.log(chalk.cyan(`  ↻ ${prefix}${file}`));
  }
  if (result.skipped.length > 0) {
    console.log(chalk.yellow('\nSkipped (already exist):'));
    for (const file of result.skipped) console.log(chalk.yellow(`  ⊘ ${prefix}${file}`));
  }
  if (result.offArchetype?.length > 0) {
    console.log(chalk.dim(`\nNot for this repo's archetype (use --all to include): ${result.offArchetype.join(', ')}`));
  }
  if (result.missing?.length > 0) {
    console.log(chalk.yellow(`\nDeclared dependencies missing from templates: ${result.missing.join(', ')}`));
  }
  console.log();
}

function printExportResult(result) {
  if (result.error) {
    console.log(chalk.red(`\n${result.error}\n`));
    process.exit(1);
  }
  console.log(chalk.green(`\nExported to: ${result.outputPath}/\n`));
  for (const file of result.exported) console.log(chalk.green(`  ✓ ${file}`));
  if (result.missing?.length > 0) {
    console.log(chalk.yellow('\n  Not found (may be optional):'));
    for (const file of result.missing) console.log(chalk.yellow(`  ⊘ ${file}`));
  }
  console.log();
}

async function resolveExportPluginArgs(opts, templateDir, commandFolders) {
  let name = opts.name;
  let commands = opts.commands ? opts.commands.split(',').map(c => c.trim()).filter(Boolean) : undefined;
  let description = opts.description;
  if (!name) {
    const answer = await prompts({
      type: 'text', name: 'name', message: 'Plugin name (kebab-case)',
      validate: v => /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(v) || 'Use lowercase letters, digits and hyphens',
    });
    name = answer.name;
    if (!name) { console.log(chalk.yellow('\nCancelled.\n')); process.exit(1); }
  }
  if (!commands) {
    const entries = getCommandEntries(templateDir);
    const { picked } = await prompts({
      type: 'multiselect', name: 'picked', message: 'Commands to include',
      choices: entries.map(e => ({ title: `/${e.name}`, value: e.name })),
      hint: 'space to select, enter to confirm',
    });
    if (!picked || picked.length === 0) { console.log(chalk.yellow('\nCancelled.\n')); process.exit(1); }
    commands = picked;
  }
  if (!description) {
    const answer = await prompts({ type: 'text', name: 'description', message: 'Description (optional, enter to skip)' });
    description = answer.description || undefined;
  }
  return { name, commands, description };
}
