// src/frontmatter.js
//
// YAML frontmatter parsing for kit templates (commands, agents, skills).
//
// Command frontmatter schema:
//   name         (required) — must equal the filename without extension
//   description  (required) — one-line summary shown in Cursor's command picker
//   args         (optional) — usage hint, e.g. "<ComponentName> [--discovery]"
//   skills          (optional, string[]) — skills the command depends on
//   agents          (optional, string[]) — agents the command delegates to
//   rules           (optional, string[]) — rules the command relies on (beyond coding-standards)
//   skills-optional (optional, string[]) — skills used when present but not required
//                    (exempt from archetype-compatibility validation)
//
// The dependency keys are authoritative: `export` bundles exactly these, and
// tests/consistency.test.js validates they exist on disk and are archetype-compatible.
import YAML from 'yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const DEPENDENCY_KEYS = ['skills', 'agents', 'rules', 'skills-optional'];

/**
 * Parse YAML frontmatter from a markdown template.
 *
 * @param {string} content - Full file content.
 * @returns {{ data: object|null, body: string }} `data` is null when the file
 *   has no frontmatter block; `body` is the content after the block (or the
 *   full content when there is none). Throws on malformed YAML.
 */
export function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { data: null, body: content };
  const data = YAML.parse(match[1]);
  return { data: data ?? {}, body: content.slice(match[0].length) };
}
