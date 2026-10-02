#!/usr/bin/env node
// ko-qa-kit privacy hook (Cursor hook protocol).
// Denies reads / shell access / MCP calls that touch likely-secret files.
// Wired in .cursor/hooks.json to: beforeReadFile, beforeShellExecution, beforeMCPExecution.
//
// Cursor hook contract: receives a JSON event on stdin, writes a JSON decision
// on stdout, exits 0. A "deny" decision blocks the action; anything else allows it.
//
// Policy note: plain `.env` files are READABLE in this family. ko-tests env
// files hold dev-environment values only (no prod / non-prod / UAT credentials),
// and verification workflows need those values (base URLs, flags, test users).
// Secret-grade material — `.env.secret`, keys, certs, credential stores — stays blocked.

const BLOCKED_PATTERNS = [
  /credentials\.json/i,
  /\.secret/i, // covers `.env.secret` and any `*.secret*` file
  /\.pem$/i,
  /\.key$/i,
  /secret[_-]?manager/i,
  /\.npmrc$/i,
  /id_rsa/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.gradle\/gradle\.properties$/i,
];

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { /* allow on unparseable input */ }

  // Collect strings to screen across the supported events (field names vary by event).
  const ti = input.tool_input || input.toolInput || {};
  const candidates = [
    input.file_path, input.path, input.filePath,
    ti.file_path, ti.path,
    input.command, ti.command,
  ].filter(Boolean).map(String);

  const hit = candidates.find((s) => BLOCKED_PATTERNS.some((re) => re.test(s)));

  if (hit) {
    process.stdout.write(JSON.stringify({
      permission: 'deny',
      userMessage: `Blocked by ko-qa-kit privacy hook: "${hit}" may contain secrets.`,
      agentMessage: `Access to "${hit}" was denied by the privacy hook (possible secret/credential file). Do not read, copy, or transmit it.`,
    }));
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
});
