// packages/kit-core/src/scaffold-engine.js
import fs from 'fs-extra';
import path from 'path';
import { parseFrontmatter } from './frontmatter.js';
import { otherKitsClaim, readManifest, writeManifest } from './manifest.js';

// Kit-managed resource directories. Copied into .cursor/<dir>/ and overwritten
// by default (the kit owns them). Archetype filtering applies via ARCHETYPE_RESOURCES.
const KIT_MANAGED_DIRS = ['agents', 'commands', 'skills'];

export function getCommandEntries(templateDir) {
  const commandsDir = path.join(templateDir, 'commands');
  if (!fs.pathExistsSync(commandsDir)) return [];
  const entries = [];
  const dirents = fs.readdirSync(commandsDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const files = fs.readdirSync(path.join(commandsDir, dirent.name)).sort();
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        entries.push({
          name: f.replace(/\.md$/, ''),
          folder: dirent.name,
          file: path.join(commandsDir, dirent.name, f),
        });
      }
    } else if (dirent.name.endsWith('.md')) {
      entries.push({
        name: dirent.name.replace(/\.md$/, ''),
        folder: null,
        file: path.join(commandsDir, dirent.name),
      });
    }
  }
  return entries;
}

const SKIP_PATTERNS = [
  '-workspace',    // eval workspace directories
  'evals.json',   // eval definitions (for kit contributors, not consumers)
  '__pycache__',   // Python cache
  '.pyc',          // compiled Python
  'specs',         // .cursor/specs/ is user data, never overwrite
  'ko-new-command', // manual-install only (via `ko-cursor-kit install command ko-new-command`)
];

export async function scaffoldProject(projectDir, archetype, templateDir, resourceMap, options = {}) {
  const { overwrite = true } = options;
  const created = [];
  const updated = [];
  const skipped = [];
  const owned = [];
  const targets = archetype ? [archetype] : [];

  for (const entry of getCommandEntries(templateDir)) {
    if (SKIP_PATTERNS.some(p => `${entry.name}.md`.includes(p))) continue;
    const restrictions = resourceMap.commands?.[entry.name];
    if (restrictions && !restrictions.some(r => targets.includes(r))) continue;
    const relPath = path.join('.cursor', 'commands', `${entry.name}.md`);
    const dest = path.join(projectDir, relPath);
    owned.push(relPath);
    if (overwrite) {
      await copyOverwrite(entry.file, dest, relPath, created, updated);
    } else {
      await copyIfNotExists(entry.file, dest, relPath, created, skipped);
    }
  }

  for (const dir of KIT_MANAGED_DIRS) {
    if (dir === 'commands') continue;
    const src = path.join(templateDir, dir);
    if (!await fs.pathExists(src)) continue;
    const files = await getAllFiles(src);
    for (const file of files) {
      const rel = path.relative(src, file);
      if (SKIP_PATTERNS.some(p => rel.includes(p))) continue;
      const resourceName = rel.split(path.sep)[0].replace(/\.\w+$/, '');
      const restrictions = resourceMap[dir]?.[resourceName];
      if (restrictions && !restrictions.some(r => targets.includes(r))) continue;
      const dest = path.join(projectDir, '.cursor', dir, rel);
      const relPath = path.join('.cursor', dir, rel);
      owned.push(relPath);
      if (overwrite) {
        await copyOverwrite(file, dest, relPath, created, updated);
      } else {
        await copyIfNotExists(file, dest, relPath, created, skipped);
      }
    }
  }

  const hooksSrc = path.join(templateDir, 'hooks');
  if (await fs.pathExists(hooksSrc)) {
    const hookFiles = (await fs.readdir(hooksSrc)).filter(f => f.endsWith('.cjs'));
    for (const file of hookFiles) {
      const src = path.join(hooksSrc, file);
      const dest = path.join(projectDir, '.cursor', 'hooks', file);
      const relPath = path.join('.cursor', 'hooks', file);
      owned.push(relPath);
      if (overwrite) {
        await copyOverwrite(src, dest, relPath, created, updated);
      } else {
        await copyIfNotExists(src, dest, relPath, created, skipped);
      }
    }
  }

  await copyIfNotExists(
    path.join(templateDir, 'hooks', 'hooks.json'),
    path.join(projectDir, '.cursor', 'hooks.json'),
    '.cursor/hooks.json',
    created, skipped
  );

  const codingStandardsSrc = path.join(templateDir, 'rules', 'coding-standards.mdc');
  if (await fs.pathExists(codingStandardsSrc)) {
    owned.push(path.join('.cursor', 'rules', 'coding-standards.mdc'));
    await copyOverwrite(
      codingStandardsSrc,
      path.join(projectDir, '.cursor', 'rules', 'coding-standards.mdc'),
      '.cursor/rules/coding-standards.mdc',
      created, updated
    );
  }

  if (archetype) {
    owned.push(path.join('.cursor', 'rules', `${archetype}.mdc`));
    await copyOverwrite(
      path.join(templateDir, 'rules', `${archetype}.mdc`),
      path.join(projectDir, '.cursor', 'rules', `${archetype}.mdc`),
      `.cursor/rules/${archetype}.mdc`,
      created, updated
    );

    await copyIfNotExists(
      path.join(templateDir, 'agents-md', `${archetype}.md`),
      path.join(projectDir, 'AGENTS.md'),
      'AGENTS.md',
      created, skipped
    );
  }

  await copyIfNotExists(
    await resolveMcpTemplate(templateDir, archetype),
    path.join(projectDir, '.cursor', 'mcp.json'),
    '.cursor/mcp.json',
    created, skipped
  );
  await copyIfNotExists(
    path.join(templateDir, 'settings', 'cli.json'),
    path.join(projectDir, '.cursor', 'cli.json'),
    '.cursor/cli.json',
    created, skipped
  );

  return { created, updated, skipped, owned };
}

async function resolveMcpTemplate(templateDir, archetype) {
  if (archetype) {
    const variant = path.join(templateDir, 'settings', `mcp.${archetype}.json`);
    if (await fs.pathExists(variant)) return variant;
  }
  return path.join(templateDir, 'settings', 'mcp.json');
}

export async function pruneProject(projectDir, archetype, templateDir, resourceMap) {
  const targets = [archetype];
  const removed = [];

  for (const dir of KIT_MANAGED_DIRS) {
    const dirRestrictions = resourceMap[dir];
    if (!dirRestrictions) continue;
    const targetDir = path.join(projectDir, '.cursor', dir);
    if (!await fs.pathExists(targetDir)) continue;
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      const resourceName = entry.name.replace(/\.\w+$/, '');
      const restrictions = dirRestrictions[resourceName];
      if (restrictions && !restrictions.some(r => targets.includes(r))) {
        const installedPath = path.join(targetDir, entry.name);
        const templatePath = dir === 'commands'
          ? getCommandEntries(templateDir).find(e => e.name === resourceName)?.file
          : path.join(templateDir, dir, entry.name);
        if (!templatePath || !await fs.pathExists(templatePath)) continue;
        if (!await contentMatches(installedPath, templatePath)) continue;
        await fs.remove(installedPath);
        removed.push(path.join('.cursor', dir, entry.name));
      }
    }
  }

  return { removed };
}

async function contentMatches(installedPath, templatePath) {
  const installedStat = await fs.stat(installedPath);
  const templateStat = await fs.stat(templatePath);

  // Both must be the same type (file vs directory)
  if (installedStat.isDirectory() !== templateStat.isDirectory()) return false;

  if (installedStat.isFile()) {
    const installed = await fs.readFile(installedPath);
    const template = await fs.readFile(templatePath);
    return installed.equals(template);
  }

  // For directories, all template files must exist and match in the installed dir
  const templateFiles = await getAllFiles(templatePath);
  for (const tFile of templateFiles) {
    const rel = path.relative(templatePath, tFile);
    if (SKIP_PATTERNS.some(p => rel.includes(p))) continue;
    const iFile = path.join(installedPath, rel);
    if (!await fs.pathExists(iFile)) return false;
    const installed = await fs.readFile(iFile);
    const template = await fs.readFile(tFile);
    if (!installed.equals(template)) return false;
  }
  return true;
}

export function listAvailableResources(templateDir) {
  const result = {};
  for (const dir of KIT_MANAGED_DIRS) {
    if (dir === 'commands') {
      const names = getCommandEntries(templateDir)
        .map(e => e.name)
        .filter(name => !SKIP_PATTERNS.some(p => name.includes(p)));
      if (names.length > 0) result.commands = names;
      continue;
    }
    const src = path.join(templateDir, dir);
    if (!fs.pathExistsSync(src)) continue;
    const entries = fs.readdirSync(src, { withFileTypes: true });
    result[dir] = entries
      .map(e => e.name.replace(/\.\w+$/, ''))
      .filter(name => !SKIP_PATTERNS.some(p => name.includes(p)));
  }
  // Hooks live in templates/hooks/*.cjs (hooks.json is config, not a resource)
  const hooksSrc = path.join(templateDir, 'hooks');
  if (fs.pathExistsSync(hooksSrc)) {
    result.hooks = fs.readdirSync(hooksSrc)
      .filter(f => f.endsWith('.cjs'))
      .map(f => f.replace(/\.cjs$/, ''));
  }
  return result;
}

/**
 * MCP servers the archetype's template defines that the project's existing
 * .cursor/mcp.json is missing. Used by `init` to print a merge hint —
 * mcp.json is user-protected, so the kit never edits it in place.
 *
 * @returns {{ name: string, config: object }[]}
 */
export async function getMcpSuggestions(projectDir, archetype, templateDir) {
  const templatePath = await resolveMcpTemplate(templateDir, archetype);
  if (!await fs.pathExists(templatePath)) return [];
  const template = await fs.readJson(templatePath).catch(() => null);
  const templateServers = template?.mcpServers ?? {};

  const projectPath = path.join(projectDir, '.cursor', 'mcp.json');
  if (!await fs.pathExists(projectPath)) return [];
  const project = await fs.readJson(projectPath).catch(() => null);
  if (!project) return []; // unparseable user file — don't suggest against it
  const projectServers = project.mcpServers ?? {};

  return Object.entries(templateServers)
    .filter(([name]) => !(name in projectServers))
    .map(([name, config]) => ({ name, config }));
}

export async function installResource(projectDir, type, name, templateDir, options = {}) {
  const { overwrite = true } = options;
  const created = [];
  const updated = [];
  const skipped = [];

  // Hooks are a special case: scripts live flat in templates/hooks/ and install
  // into .cursor/hooks/. (Remember to register the hook in .cursor/hooks.json.)
  if (type === 'hook' || type === 'hooks') {
    const src = path.join(templateDir, 'hooks', `${name}.cjs`);
    if (!await fs.pathExists(src)) {
      const available = (await fs.readdir(path.join(templateDir, 'hooks')))
        .filter(f => f.endsWith('.cjs'))
        .map(f => f.replace(/\.cjs$/, ''));
      return { error: `"${name}" not found in hooks. Available: ${available.join(', ')}` };
    }
    const dest = path.join(projectDir, '.cursor', 'hooks', `${name}.cjs`);
    const relPath = path.join('.cursor', 'hooks', `${name}.cjs`);
    if (overwrite) {
      await copyOverwrite(src, dest, relPath, created, updated);
    } else {
      await copyIfNotExists(src, dest, relPath, created, skipped);
    }
    return { created, updated, skipped };
  }

  // Normalize type: accept singular or plural
  const dir = KIT_MANAGED_DIRS.includes(type) ? type : KIT_MANAGED_DIRS.find(d => d === type + 's');
  if (!dir) {
    return { error: `Unknown resource type "${type}". Valid types: skill, agent, command, hook` };
  }

  const srcDir = path.join(templateDir, dir);
  if (!await fs.pathExists(srcDir)) {
    return { error: `No templates found for type "${dir}"` };
  }

  // Commands: foldered source, flat install.
  if (dir === 'commands') {
    const entry = getCommandEntries(templateDir).find(e => e.name === name);
    if (!entry) {
      const available = getCommandEntries(templateDir)
        .map(e => e.name)
        .filter(n => !SKIP_PATTERNS.some(p => n.includes(p)));
      return { error: `"${name}" not found in commands. Available: ${available.join(', ')}` };
    }
    const dest = path.join(projectDir, '.cursor', 'commands', `${name}.md`);
    const relPath = path.join('.cursor', 'commands', `${name}.md`);
    if (overwrite) {
      await copyOverwrite(entry.file, dest, relPath, created, updated);
    } else {
      await copyIfNotExists(entry.file, dest, relPath, created, skipped);
    }
    return { created, updated, skipped };
  }

  // Find the matching template (file or directory)
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const match = entries.find(e => e.name.replace(/\.\w+$/, '') === name);
  if (!match) {
    const available = entries
      .map(e => e.name.replace(/\.\w+$/, ''))
      .filter(n => !SKIP_PATTERNS.some(p => n.includes(p)));
    return { error: `"${name}" not found in ${dir}. Available: ${available.join(', ')}` };
  }

  const src = path.join(srcDir, match.name);
  const dest = path.join(projectDir, '.cursor', dir, match.name);
  const relPath = path.join('.cursor', dir, match.name);

  if (match.isDirectory()) {
    const files = await getAllFiles(src);
    for (const file of files) {
      const rel = path.relative(src, file);
      if (SKIP_PATTERNS.some(p => rel.includes(p))) continue;
      const fileDest = path.join(dest, rel);
      const fileRelPath = path.join(relPath, rel);
      if (overwrite) {
        await copyOverwrite(file, fileDest, fileRelPath, created, updated);
      } else {
        await copyIfNotExists(file, fileDest, fileRelPath, created, skipped);
      }
    }
  } else {
    if (overwrite) {
      await copyOverwrite(src, dest, relPath, created, updated);
    } else {
      await copyIfNotExists(src, dest, relPath, created, skipped);
    }
  }

  return { created, updated, skipped };
}

export async function installFolder(projectDir, folderName, templateDir, resourceMap, options = {}) {
  const { overwrite = true, all = false, archetype = null, includeCodingStandards = true } = options;

  const folderEntries = getCommandEntries(templateDir)
    .filter(e => e.folder === folderName)
    .filter(e => !SKIP_PATTERNS.some(p => `${e.name}.md`.includes(p)));
  if (folderEntries.length === 0) {
    const folders = [...new Set(getCommandEntries(templateDir).map(e => e.folder).filter(Boolean))];
    return { error: `Unknown or empty command folder "${folderName}". Available: ${folders.join(', ')}` };
  }

  const matches = (restrictions) =>
    !restrictions
    || restrictions.includes(folderName)
    || (archetype != null && restrictions.includes(archetype));

  const commands = all
    ? folderEntries
    : folderEntries.filter(e => matches(resourceMap.commands?.[e.name]));
  const offArchetype = folderEntries.filter(e => !commands.includes(e)).map(e => e.name);

  const created = [];
  const updated = [];
  const skipped = [];
  const missing = [];
  const copy = (src, dest, relPath) => overwrite
    ? copyOverwrite(src, dest, relPath, created, updated)
    : copyIfNotExists(src, dest, relPath, created, skipped);

  const skills = new Set();
  const agents = new Set();
  const rules = new Set(includeCodingStandards ? ['coding-standards'] : []);
  for (const entry of commands) {
    let data = null;
    try {
      ({ data } = parseFrontmatter(await fs.readFile(entry.file, 'utf-8')));
    } catch { /* malformed frontmatter — install the command without deps */ }
    for (const skill of data?.skills ?? []) skills.add(skill);
    for (const skill of data?.['skills-optional'] ?? []) {
      if (all || matches(resourceMap.skills?.[skill])) skills.add(skill);
    }
    for (const agent of data?.agents ?? []) agents.add(agent);
    for (const rule of data?.rules ?? []) rules.add(rule);

    await copy(
      entry.file,
      path.join(projectDir, '.cursor', 'commands', `${entry.name}.md`),
      path.join('.cursor', 'commands', `${entry.name}.md`)
    );
  }

  for (const skill of [...skills].sort()) {
    const src = path.join(templateDir, 'skills', skill);
    if (!await fs.pathExists(src)) { missing.push(`skills/${skill}`); continue; }
    for (const file of await getAllFiles(src)) {
      const rel = path.relative(src, file);
      if (SKIP_PATTERNS.some(p => rel.includes(p))) continue;
      await copy(
        file,
        path.join(projectDir, '.cursor', 'skills', skill, rel),
        path.join('.cursor', 'skills', skill, rel)
      );
    }
  }
  for (const agent of [...agents].sort()) {
    const src = path.join(templateDir, 'agents', `${agent}.md`);
    if (!await fs.pathExists(src)) { missing.push(`agents/${agent}.md`); continue; }
    await copy(
      src,
      path.join(projectDir, '.cursor', 'agents', `${agent}.md`),
      path.join('.cursor', 'agents', `${agent}.md`)
    );
  }
  for (const rule of [...rules].sort()) {
    const src = path.join(templateDir, 'rules', `${rule}.mdc`);
    if (!await fs.pathExists(src)) { missing.push(`rules/${rule}.mdc`); continue; }
    await copy(
      src,
      path.join(projectDir, '.cursor', 'rules', `${rule}.mdc`),
      path.join('.cursor', 'rules', `${rule}.mdc`)
    );
  }

  return { created, updated, skipped, offArchetype, missing };
}

async function copyOverwrite(src, dest, relPath, created, updated) {
  if (!await fs.pathExists(src)) return;
  const existed = await fs.pathExists(dest);
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest, { overwrite: true });
  if (existed) {
    updated.push(relPath);
  } else {
    created.push(relPath);
  }
}

async function copyIfNotExists(src, dest, relPath, created, skipped) {
  if (!await fs.pathExists(src)) return;
  if (await fs.pathExists(dest)) {
    skipped.push(relPath);
  } else {
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(src, dest);
    created.push(relPath);
  }
}

async function getAllFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * Remove a single installed resource (the inverse of installResource).
 * Before deleting, checks whether another installed kit's manifest still
 * claims the same path (see manifest.js `otherKitsClaim`) — if so, the file
 * is kept and `{ kept, reason }` is returned instead of deleting it.
 *
 * @param {string} projectDir
 * @param {string} type - 'skill' | 'agent' | 'command' | 'hook'
 * @param {string} name
 * @param {string} templateDir
 * @param {string} selfManifestRelPath - this kit's own manifest path, so the
 *   shared-claim check can exclude it
 */
export async function uninstallResource(projectDir, type, name, templateDir, selfManifestRelPath) {
  let relPath;
  let isDirectory = false;

  if (type === 'hook' || type === 'hooks') {
    relPath = path.join('.cursor', 'hooks', `${name}.cjs`);
  } else {
    const dir = KIT_MANAGED_DIRS.includes(type) ? type : KIT_MANAGED_DIRS.find(d => d === type + 's');
    if (!dir) {
      return { error: `Unknown resource type "${type}". Valid types: skill, agent, command, hook` };
    }
    if (dir === 'commands') {
      relPath = path.join('.cursor', 'commands', `${name}.md`);
    } else {
      const srcDir = path.join(templateDir, dir);
      const entries = await fs.pathExists(srcDir) ? await fs.readdir(srcDir, { withFileTypes: true }) : [];
      const match = entries.find(e => e.name.replace(/\.\w+$/, '') === name);
      if (!match) {
        return { error: `"${name}" not found in ${dir} templates — nothing to uninstall.` };
      }
      relPath = path.join('.cursor', dir, match.name);
      isDirectory = match.isDirectory();
    }
  }

  const abs = path.join(projectDir, relPath);
  if (!await fs.pathExists(abs)) {
    return { error: `"${relPath}" is not installed.` };
  }

  const claimed = await otherKitsClaim(projectDir, relPath, selfManifestRelPath);

  const oldManifest = await readManifest(projectDir, selfManifestRelPath);
  if (oldManifest) {
    const remainingFiles = (oldManifest.files ?? [])
      .map(f => f.path)
      .filter(p => p !== relPath);
    await writeManifest(projectDir, selfManifestRelPath, {
      kitVersion: oldManifest.kitVersion,
      archetype: oldManifest.archetype,
      files: remainingFiles,
    });
  }

  if (claimed) {
    return { kept: [relPath], reason: 'still used by another installed kit' };
  }

  await fs.remove(abs);
  return { removed: [relPath] };
}
