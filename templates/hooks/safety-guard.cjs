#!/usr/bin/env node
// ko-qa-kit safety hook (Cursor hook protocol).
// Denies destructive shell commands before they run, and names the safe
// alternative so the agent can recover on its own.
// Wired in .cursor/hooks.json to: beforeShellExecution.
//
// WHAT TO BLOCK IS POLICY, AND POLICY LIVES IN DATA — destructive-rules.json
// next to this script. Teams edit the JSON; this file only detects. The
// deny/ask split is deliberate: a guard that hard-blocks routine work gets
// switched off, and a switched-off guard protects nothing.
//
// Cursor hook contract: receives a JSON event on stdin, writes a JSON decision
// on stdout, exits 0. "deny" blocks, "ask" prompts the user, anything else
// allows. Fails OPEN (with a warning) when the policy file is missing — an
// inert guard must announce itself, not silently stop protecting.

const fs = require('node:fs');
const path = require('node:path');

const POLICY_PATH = path.join(__dirname, 'destructive-rules.json');

const answer = (obj) => {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
};

const loadPolicy = () => {
  try {
    return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf-8'));
  } catch {
    return null;
  }
};

// For exemptWhenSafeDelete rules: extract every path target of each matched
// `rm -rf ...` invocation (up to the next shell separator) and require every
// basename to be in safeDeleteTargets. One unsafe target poisons the command.
const allTargetsSafe = (cmd, safeDeleteTargets) => {
  const safe = new Set(safeDeleteTargets || []);
  const tails = [...cmd.matchAll(/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f([^;&|]*)/gi)];
  if (tails.length === 0) return false;
  for (const m of tails) {
    const targets = m[1].split(/\s+/).filter((t) => t && !t.startsWith('-'));
    if (targets.length === 0) return false; // `rm -rf` with no visible target — not provably safe
    for (const t of targets) {
      const base = t.replace(/\/+$/, '').split('/').pop();
      if (!safe.has(base)) return false;
    }
  }
  return true;
};

let policy = null;
let rules = [];
try {
  policy = loadPolicy();
  if (policy && Array.isArray(policy.rules)) {
    rules = policy.rules.map((r) => ({ ...r, re: new RegExp(r.pattern, r.flags || 'i') }));
  }
} catch {
  rules = []; // corrupt policy → inert, announced below
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { /* allow on unparseable input */ }

  if (!policy || rules.length === 0) {
    answer({
      permission: 'allow',
      userMessage: 'ko-qa-kit safety hook: destructive-rules.json is missing or unreadable — the guard is INERT. Re-run `ko-qa-kit init` to restore it.',
    });
    return;
  }

  const ti = input.tool_input || input.toolInput || {};
  const command = input.command ?? ti.command;
  const cmd = command == null ? '' : String(command);
  if (!cmd) {
    answer({ permission: 'allow' });
    return;
  }

  // deny beats ask: evaluate every matching deny rule before any ask.
  const hits = rules.filter((r) => {
    if (!r.re.test(cmd)) return false;
    if (r.exemptWhenSafeDelete && allTargetsSafe(cmd, policy.safeDeleteTargets)) return false;
    return true;
  });
  const hit = hits.find((r) => r.action === 'deny') || hits.find((r) => r.action === 'ask');

  if (!hit) {
    answer({ permission: 'allow' });
    return;
  }

  if (hit.action === 'ask') {
    answer({
      permission: 'ask',
      userMessage: `ko-qa-kit safety hook asks before running: "${cmd}" — ${hit.reason}.`,
      agentMessage: `The command "${cmd}" requires user confirmation (${hit.reason}). ${hit.alternative || 'Proceed only once the user confirms'}.`,
    });
    return;
  }

  answer({
    permission: 'deny',
    userMessage: `Blocked by ko-qa-kit safety hook: "${cmd}" — ${hit.reason}.`,
    agentMessage: `The command "${cmd}" was denied by the safety hook (${hit.reason}). ${hit.alternative}. If the user explicitly asked for this exact operation, stop and let them run it themselves.`,
  });
});
