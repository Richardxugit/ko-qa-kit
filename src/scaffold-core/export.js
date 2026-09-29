// ko-dev-kit/src/scaffold-core/export.js
import fs from 'fs-extra';
import path from 'path';
import { parseFrontmatter } from './frontmatter.js';
import { getCommandEntries, ARCHETYPE_MCP_SERVERS, MCP_SERVER_DEFS } from './engine.js';

/**
 * Extract a command's skill/agent/rule dependencies.
 *
 * Frontmatter dependency keys (skills/agents/rules/skills-optional) are
 * authoritative when present. The regex body-scan below is the fallback for
 * user-authored commands that don't declare them.
 */
export function extractDependencies(commandContent) {
  let data = null;
  try {
    ({ data } = parseFrontmatter(commandContent));
  } catch {
    // malformed frontmatter — fall through to the regex scan
  }
  const fm = (data && ['skills', 'agents', 'rules', 'skills-optional'].some(k => k in data)) ? data : null;

  const skills = new Set([...(fm?.skills ?? []), ...(fm?.['skills-optional'] ?? [])]);
  const agents = new Set(fm?.agents ?? []);
  const rules = new Set(fm?.rules ?? []);

  // Body path citations are dependencies too — a command that reads
  // `.cursor/skills/workflow-refs/references/x.md` needs that skill bundled
  // even when frontmatter doesn't declare it (the workflow-refs gap).
  for (const match of commandContent.matchAll(/(?:\.cursor\/)?skills\/([a-z0-9-]+)\//gi)) {
    skills.add(match[1]);
  }

  // Skills: "`name` skill" phrasing, "Read the `name` skill", and path citations
  // (handled above). No fuzzy "skills: ... `x`" pattern — it catches bolt-log
  // action words like `verify` (false positive found on ko-verify).
  const skillPatterns = [
    /`([a-z0-9-]+)`\s+skill/gi,
    /Read the\s+`([a-z0-9-]+)`/gi,
  ];
  for (const pattern of skillPatterns) {
    for (const match of commandContent.matchAll(pattern)) {
      skills.add(match[1]);
    }
  }

  // Agents: patterns like `agent-name` agent, delegate to `agent-name`
  const agentPatterns = [
    /`([a-z0-9-]+)`\s+(?:sub-?)?agent/gi,
    /delegate[d]?\s+to\s+(?:the\s+)?(?:\*\*)?`([a-z0-9-]+)`/gi,
    /the\s+\*\*`([a-z0-9-]+)`\*\*\s+(?:sub-?)?agent/gi,
  ];
  for (const pattern of agentPatterns) {
    for (const match of commandContent.matchAll(pattern)) {
      agents.add(match[1]); // group 1 is always the name — the optional sub- prefix is not
    }
  }

  // Rules: patterns like .cursor/rules/name.mdc, rules/name.mdc
  const rulePatterns = [
    /rules\/([a-z0-9-]+)\.mdc/gi,
  ];
  for (const pattern of rulePatterns) {
    for (const match of commandContent.matchAll(pattern)) {
      rules.add(match[1]);
    }
  }

  // Always include coding-standards (shared rule)
  rules.add('coding-standards');

  return {
    skills: [...skills],
    agents: [...agents],
    rules: [...rules],
  };
}

// Project-scope references to bundled skills break inside a plugin — rewrite
// them plugin-relative on export. `.cursor/specs/` and other project paths
// (which point at the CONSUMER repo, not the plugin) are left alone.
const rewriteProjectRefs = (content) =>
  content.replace(/\.cursor\/skills\//g, 'skills/');

async function rewriteBundleRefs(bundleDir) {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (/\.(md|mdc)$/.test(entry.name)) files.push(p);
    }
  };
  await walk(bundleDir);
  for (const file of files) {
    const before = await fs.readFile(file, 'utf-8');
    const after = rewriteProjectRefs(before);
    if (after !== before) await fs.writeFile(file, after);
  }
}

const MIT_TEXT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

async function writeLicense(bundleDir, license) {
  const body = license === 'MIT'
    ? MIT_TEXT
    : `License: ${license}\n\nThis package is distributed under the ${license} license (SPDX). Replace this file with the full license text before publishing.\n`;
  await fs.writeFile(path.join(bundleDir, 'LICENSE'), body);
}

// Marketplace-shape manifest (ko-cursor-plugins repo format / Cursor plugin
// schema): folder pointers only for components actually bundled.
async function writePluginManifest(bundleDir, opts, has) {
  const manifest = {
    name: opts.name,
    displayName: opts.displayName || opts.name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: opts.version || '1.0.0',
    description: opts.description,
  };
  if (opts.author) manifest.author = opts.author;
  manifest.license = opts.license || 'MIT';
  if (opts.category) manifest.category = opts.category;
  if (opts.keywords?.length) manifest.keywords = opts.keywords;
  if (opts.tags?.length) manifest.tags = opts.tags;
  if (has.commands) manifest.commands = './commands/';
  if (has.agents) manifest.agents = './agents/';
  if (has.skills) manifest.skills = './skills/';
  if (has.rules) manifest.rules = './rules/';
  if (has.hooks) manifest.hooks = './hooks.json';
  if (has.mcp) manifest.mcpServers = './mcp.json';
  await fs.ensureDir(path.join(bundleDir, '.cursor-plugin'));
  await fs.writeJson(path.join(bundleDir, '.cursor-plugin', 'plugin.json'), manifest, { spaces: 2 });
}

// Hooks ship at plugin root: scripts in hooks/, wiring in hooks.json with
// commands rewritten to plugin-relative paths (`node ./hooks/…`).
async function bundleHooks(templateDir, bundleDir, exported) {
  const hooksSrc = path.join(templateDir, 'hooks');
  const wiringSrc = path.join(templateDir, 'settings', 'hooks.json');
  if (!await fs.pathExists(hooksSrc) || !await fs.pathExists(wiringSrc)) return false;
  await fs.copy(hooksSrc, path.join(bundleDir, 'hooks'));
  exported.push('hooks/');
  const wiring = await fs.readJson(wiringSrc);
  for (const entries of Object.values(wiring.hooks || {})) {
    for (const entry of entries) {
      entry.command = entry.command.replace('node .cursor/hooks/', 'node ./hooks/');
    }
  }
  await fs.writeJson(path.join(bundleDir, 'hooks.json'), wiring, { spaces: 2 });
  exported.push('hooks.json');
  return true;
}

// MCP union: servers of every archetype owning a selected command. Shared
// commands (unlisted in the resource map) run on every archetype, so they
// contribute atlassian — the one server all archetypes carry.
async function writeMcpConfig(normalized, resourceMap, bundleDir, exported) {
  const owning = new Set(normalized.flatMap((cmd) => resourceMap.commands?.[cmd] ?? []));
  const names = new Set();
  for (const archetype of owning) {
    for (const server of ARCHETYPE_MCP_SERVERS[archetype] ?? []) names.add(server);
  }
  // Shared commands (unlisted in the resource map) contribute the servers EVERY
  // archetype carries — the intersection, which may be empty (this kit's two
  // archetypes share no server).
  if (names.size === 0 || normalized.some((cmd) => !(cmd in (resourceMap.commands ?? {})))) {
    const sets = Object.values(ARCHETYPE_MCP_SERVERS);
    const common = sets.length ? sets.reduce((a, b) => a.filter((s) => b.includes(s))) : [];
    for (const s of common) names.add(s);
  }
  const mcpServers = {};
  for (const name of [...names].sort()) {
    if (MCP_SERVER_DEFS[name]) mcpServers[name] = MCP_SERVER_DEFS[name];
  }
  if (Object.keys(mcpServers).length === 0) return false;
  await fs.writeJson(path.join(bundleDir, 'mcp.json'), { mcpServers }, { spaces: 2 });
  exported.push('mcp.json');
  return true;
}

/**
 * Export a command with all its dependencies as a portable bundle.
 *
 * @param {string} commandName - Name of the command (without .md extension)
 * @param {string} templateDir - Path to templates/ directory
 * @param {string} outputDir - Path to write the exported bundle
 * @param {object} [options]
 * @param {boolean} [options.plugin] - Also emit .cursor-plugin/plugin.json so
 *   the bundle is installable as a single-command Cursor plugin
 * @param {string} [options.version] - Plugin version (defaults to 1.0.0)
 * @returns {{ exported: string[], missing: string[], outputPath: string }}
 */
export async function exportCommand(commandName, templateDir, outputDir, options = {}) {
  const { plugin = false, version = '1.0.0' } = options;
  const exported = [];
  const missing = [];

  // Normalize name (strip ko- prefix if user types "ko-ds-component" vs "ds-component")
  const normalizedName = commandName.startsWith('ko-') ? commandName : `ko-${commandName}`;
  const commandFile = getCommandEntries(templateDir).find(e => e.name === normalizedName)?.file;

  if (!commandFile) {
    return { error: `Command "${normalizedName}" not found in ${path.join(templateDir, 'commands')}` };
  }

  // Read command content to extract dependencies
  const commandContent = await fs.readFile(commandFile, 'utf-8');
  const deps = extractDependencies(commandContent);

  // Create output directory
  const bundleDir = path.join(outputDir, normalizedName);
  await fs.ensureDir(bundleDir);

  // Copy the command itself
  const cmdDest = path.join(bundleDir, 'commands', `${normalizedName}.md`);
  await fs.ensureDir(path.dirname(cmdDest));
  await fs.copy(commandFile, cmdDest);
  exported.push(`commands/${normalizedName}.md`);

  // Copy skills
  for (const skill of deps.skills) {
    const skillDir = path.join(templateDir, 'skills', skill);
    if (await fs.pathExists(skillDir)) {
      await fs.copy(skillDir, path.join(bundleDir, 'skills', skill));
      exported.push(`skills/${skill}/`);
    } else {
      missing.push(`skills/${skill}`);
    }
  }

  // Copy agents
  for (const agent of deps.agents) {
    const agentFile = path.join(templateDir, 'agents', `${agent}.md`);
    if (await fs.pathExists(agentFile)) {
      const dest = path.join(bundleDir, 'agents', `${agent}.md`);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(agentFile, dest);
      exported.push(`agents/${agent}.md`);
    } else {
      missing.push(`agents/${agent}.md`);
    }
  }

  // Copy rules
  for (const rule of deps.rules) {
    const ruleFile = path.join(templateDir, 'rules', `${rule}.mdc`);
    if (await fs.pathExists(ruleFile)) {
      const dest = path.join(bundleDir, 'rules', `${rule}.mdc`);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(ruleFile, dest);
      exported.push(`rules/${rule}.mdc`);
    } else {
      missing.push(`rules/${rule}.mdc`);
    }
  }

  // Plugin manifest — makes the bundle installable as a Cursor plugin
  if (plugin) {
    let description = `Portable export of the /${normalizedName} command`;
    try {
      const { data } = parseFrontmatter(commandContent);
      if (data?.description) description = data.description;
    } catch {
      // keep the fallback description
    }
    await rewriteBundleRefs(bundleDir);
    await writeLicense(bundleDir, options.license || 'MIT');
    exported.push('LICENSE');
    await writePluginManifest(bundleDir, {
      name: normalizedName, description, version,
      author: options.author, license: options.license,
    }, {
      commands: true,
      agents: deps.agents.length > 0,
      skills: deps.skills.length > 0,
      rules: deps.rules.length > 0,
      hooks: false,
      mcp: false,
    });
    exported.push('.cursor-plugin/plugin.json');
  }

  // Generate README
  const pluginUsage = plugin ? `

Or install it as a Cursor plugin: copy this folder into \`~/.cursor/plugins/local/${normalizedName}\` (or publish it to your team marketplace).` : '';
  const readme = `# ${normalizedName}

## What's in this bundle

This is a portable export of the \`/${normalizedName}\` Cursor command with all its dependencies.

## How to use

Copy the contents of this folder into your repo's \`.cursor/\` directory:

\`\`\`bash
cp -r ${normalizedName}/* <your-repo>/.cursor/
\`\`\`${pluginUsage}

Or selectively copy what you need:
- \`commands/\` → \`.cursor/commands/\`
- \`skills/\` → \`.cursor/skills/\`
- \`agents/\` → \`.cursor/agents/\`
- \`rules/\` → \`.cursor/rules/\`

Then open the repo in Cursor and use \`/${normalizedName}\`.

## Contents

${exported.map(f => `- \`${f}\``).join('\n')}
${missing.length > 0 ? `\n## Not found (may be optional)\n\n${missing.map(f => `- \`${f}\``).join('\n')}` : ''}
`;

  await fs.writeFile(path.join(bundleDir, 'README.md'), readme);
  exported.push('README.md');

  return { exported, missing, outputPath: bundleDir };
}

// Cursor plugin names: kebab-case alphanumerics/hyphens/periods,
// starting and ending with an alphanumeric.
const PLUGIN_NAME_RE = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/**
 * Mint a custom Cursor plugin from any set of commands ("commands factory").
 *
 * Bundles the chosen commands plus the union of their skill/agent/rule
 * dependencies, merges in the mcp.<archetype>.json variants of every archetype
 * the commands are restricted to (e.g. e2e commands pull in the Playwright MCP
 * server), and writes .cursor-plugin/plugin.json + a README with install and
 * marketplace-import instructions. The result in <outputDir>/<name>/ can be
 * symlinked into ~/.cursor/plugins/local/ or pushed to any Git repo and
 * imported via Cursor's team marketplace.
 *
 * @param {object} opts
 * @param {string} opts.name - Plugin name (kebab-case)
 * @param {string[]} opts.commands - Command names to include (ko- prefix optional)
 * @param {string} opts.templateDir - Path to templates/
 * @param {string} opts.outputDir - Directory to write the plugin into
 * @param {string} [opts.description] - plugin.json description
 * @param {string} [opts.version] - Plugin version (defaults to 1.0.0)
 * @returns {{ exported: string[], missing: string[], outputPath: string } | { error: string }}
 */
export async function exportPlugin({ name, commands, templateDir, outputDir, description, version = '1.0.0', resourceMap = {}, ...opts }) {
  if (!name || !PLUGIN_NAME_RE.test(name)) {
    return { error: `Invalid plugin name "${name}". Use kebab-case (lowercase letters, digits, hyphens), e.g. "qa-starter".` };
  }
  if (!commands || commands.length === 0) {
    return { error: 'Select at least one command to include in the plugin.' };
  }

  // Normalize + validate the command list up front.
  const entriesByName = new Map(getCommandEntries(templateDir).map(e => [e.name, e]));
  const normalized = commands.map(c => (c.startsWith('ko-') ? c : `ko-${c}`));
  const unknown = normalized.filter(cmd => !entriesByName.has(cmd));
  if (unknown.length > 0) {
    return { error: `Command(s) not found: ${unknown.join(', ')}. Available: ${[...entriesByName.keys()].join(', ')}` };
  }

  const exported = [];
  const missing = [];
  const bundleDir = path.join(outputDir, name);
  await fs.remove(bundleDir);
  await fs.ensureDir(bundleDir);

  // Union of dependencies across all selected commands.
  const skills = new Set();
  const agents = new Set();
  const rules = new Set();
  const commandSummaries = [];
  for (const cmd of normalized) {
    const commandFile = entriesByName.get(cmd).file;
    const content = await fs.readFile(commandFile, 'utf-8');
    const deps = extractDependencies(content);
    deps.skills.forEach(s => skills.add(s));
    deps.agents.forEach(a => agents.add(a));
    deps.rules.forEach(r => rules.add(r));

    await fs.ensureDir(path.join(bundleDir, 'commands'));
    await fs.copy(commandFile, path.join(bundleDir, 'commands', `${cmd}.md`));
    exported.push(`commands/${cmd}.md`);

    let cmdDescription = '';
    try {
      const { data } = parseFrontmatter(content);
      cmdDescription = data?.description ?? '';
    } catch { /* no frontmatter — leave blank */ }
    commandSummaries.push({ name: cmd, description: cmdDescription });
  }

  for (const skill of [...skills].sort()) {
    const skillDir = path.join(templateDir, 'skills', skill);
    if (await fs.pathExists(skillDir)) {
      await fs.copy(skillDir, path.join(bundleDir, 'skills', skill));
      exported.push(`skills/${skill}/`);
    } else {
      missing.push(`skills/${skill}`);
    }
  }
  for (const agent of [...agents].sort()) {
    const agentFile = path.join(templateDir, 'agents', `${agent}.md`);
    if (await fs.pathExists(agentFile)) {
      await fs.ensureDir(path.join(bundleDir, 'agents'));
      await fs.copy(agentFile, path.join(bundleDir, 'agents', `${agent}.md`));
      exported.push(`agents/${agent}.md`);
    } else {
      missing.push(`agents/${agent}.md`);
    }
  }
  for (const rule of [...rules].sort()) {
    const ruleFile = path.join(templateDir, 'rules', `${rule}.mdc`);
    if (await fs.pathExists(ruleFile)) {
      await fs.ensureDir(path.join(bundleDir, 'rules'));
      await fs.copy(ruleFile, path.join(bundleDir, 'rules', `${rule}.mdc`));
      exported.push(`rules/${rule}.mdc`);
    } else {
      missing.push(`rules/${rule}.mdc`);
    }
  }

  // MCP config: union of servers for the archetypes owning the selected
  // commands; shared commands contribute atlassian (carried by all archetypes).
  const hasMcp = await writeMcpConfig(normalized, resourceMap, bundleDir, exported);

  // Hooks (default on for plugin exports — they are part of the workflow).
  const hasHooks = opts.hooks === false ? false : await bundleHooks(templateDir, bundleDir, exported);

  await rewriteBundleRefs(bundleDir);

  await writeLicense(bundleDir, opts.license || 'MIT');
  exported.push('LICENSE');

  const commandList = normalized.map(c => `/${c}`).join(', ');
  await writePluginManifest(bundleDir, {
    name, description: description || `Custom ko plugin: ${commandList}`, version,
    displayName: opts.displayName, author: opts.author, license: opts.license,
    category: opts.category, keywords: opts.keywords, tags: opts.tags,
  }, {
    commands: true,
    agents: agents.size > 0,
    skills: skills.size > 0,
    rules: rules.size > 0,
    hooks: hasHooks,
    mcp: hasMcp,
  });
  exported.push('.cursor-plugin/plugin.json');

  const readme = `# ${name}

A Cursor plugin bundling ${commandSummaries.length === 1 ? 'this command' : 'these commands'} with everything they need (skills, agents, rules${hasHooks ? ', hooks' : ''}${hasMcp ? ', MCP servers' : ''}):

${commandSummaries.map(c => `- \`/${c.name}\`${c.description ? ` — ${c.description}` : ''}`).join('\n')}

## Install in Cursor

**Locally (just you):**

\`\`\`bash
cp -r ${name} ~/.cursor/plugins/local/${name}   # or symlink it
\`\`\`

Restart Cursor (or run “Developer: Reload Window”), then find it under **Customize**.

**For a team (marketplace):** push this folder to a Git repo, then an admin imports it via
**Cursor Dashboard → Plugins → Add Marketplace → Import from Repo**. Everyone installs it
from the **Customize** page.

**Into one repo (no plugin):** copy the contents into the repo's \`.cursor/\` directory.

## Contents

${exported.map(f => `- \`${f}\``).join('\n')}
${missing.length > 0 ? `\n## Not found (may be optional)\n\n${missing.map(f => `- \`${f}\``).join('\n')}` : ''}
`;
  await fs.writeFile(path.join(bundleDir, 'README.md'), readme);
  exported.push('README.md');

  return { exported, missing, outputPath: bundleDir };
}
