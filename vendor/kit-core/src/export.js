// packages/kit-core/src/export.js
import fs from 'fs-extra';
import path from 'path';
import { parseFrontmatter } from './frontmatter.js';
import { getCommandEntries } from './scaffold-engine.js';

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
  if (data && ['skills', 'agents', 'rules', 'skills-optional'].some(k => k in data)) {
    return {
      skills: [...(data.skills ?? []), ...(data['skills-optional'] ?? [])],
      agents: data.agents ?? [],
      rules: [...new Set([...(data.rules ?? []), 'coding-standards'])],
    };
  }

  const skills = new Set();
  const agents = new Set();
  const rules = new Set();

  // Skills: patterns like `skill-name` skill, Read the `skill-name` skill
  const skillPatterns = [
    /`([a-z0-9-]+)`\s+skill/gi,
    /skills?[:\s]+[^.]*`([a-z0-9-]+)`/gi,
    /Read the\s+`([a-z0-9-]+)`/gi,
  ];
  for (const pattern of skillPatterns) {
    for (const match of commandContent.matchAll(pattern)) {
      skills.add(match[1]);
    }
  }

  // Agents: patterns like `agent-name` agent, delegate to `agent-name`
  const agentPatterns = [
    /`([a-z0-9-]+)`\s+(sub-?)?agent/gi,
    /delegate[d]?\s+to\s+(?:the\s+)?(?:\*\*)?`([a-z0-9-]+)`/gi,
    /the\s+\*\*`([a-z0-9-]+)`\*\*\s+(?:sub-?)?agent/gi,
  ];
  for (const pattern of agentPatterns) {
    for (const match of commandContent.matchAll(pattern)) {
      const name = match[2] || match[1];
      agents.add(name);
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
    await fs.ensureDir(path.join(bundleDir, '.cursor-plugin'));
    await fs.writeJson(
      path.join(bundleDir, '.cursor-plugin', 'plugin.json'),
      { name: normalizedName, description, version },
      { spaces: 2 }
    );
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
export async function exportPlugin({ name, commands, templateDir, outputDir, description, version = '1.0.0', resourceMap = {} }) {
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

  // MCP config: merge the mcp.<archetype>.json variant of every archetype the
  // selected commands are restricted to (shared commands contribute none).
  const mcpServers = {};
  const archetypesNeeded = new Set(
    normalized.flatMap(cmd => resourceMap.commands?.[cmd] ?? [])
  );
  for (const archetype of [...archetypesNeeded].sort()) {
    const variant = path.join(templateDir, 'settings', `mcp.${archetype}.json`);
    if (await fs.pathExists(variant)) {
      Object.assign(mcpServers, (await fs.readJson(variant)).mcpServers ?? {});
    }
  }
  if (Object.keys(mcpServers).length > 0) {
    await fs.writeJson(path.join(bundleDir, 'mcp.json'), { mcpServers }, { spaces: 2 });
    exported.push('mcp.json');
  }

  const commandList = normalized.map(c => `/${c}`).join(', ');
  await fs.ensureDir(path.join(bundleDir, '.cursor-plugin'));
  await fs.writeJson(
    path.join(bundleDir, '.cursor-plugin', 'plugin.json'),
    { name, description: description || `Custom ko plugin: ${commandList}`, version },
    { spaces: 2 }
  );
  exported.push('.cursor-plugin/plugin.json');

  const readme = `# ${name}

A Cursor plugin bundling ${commandSummaries.length === 1 ? 'this command' : 'these commands'} with everything they need (skills, agents, rules${Object.keys(mcpServers).length > 0 ? ', MCP servers' : ''}):

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
