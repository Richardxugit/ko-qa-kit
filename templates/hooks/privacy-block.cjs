#!/usr/bin/env node
// ko-qa-kit privacy hook (Cursor hook protocol).
// Denies reads / shell access / MCP calls that touch likely-secret files.
// Wired in .cursor/hooks.json to: beforeReadFile, beforeShellExecution, beforeMCPExecution.
//
// Cursor hook contract: receives a JSON event on stdin, writes a JSON decision
// on stdout, exits 0. A "deny" decision blocks the action; anything else allows it.

const BLOCKED_PATTERNS = [
  // \b (not just end-or-dot) so `cat .env | grep KEY` can't pipe past the guard.
  /\.env\b/i,
  /credentials\.json/i,
  /\.secret/i,
  /\.pem$/i,
  /\.key$/i,
  /secret[_-]?manager/i,
  /\.npmrc$/i,
  /id_rsa/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.gradle\/gradle\.properties$/i,
];

// Allow-listed: example/template env files are meant to be committed and hold
// placeholders, not secrets. They are SCRUBBED from the candidate before the
// blocked patterns run — scrubbing (rather than a veto) keeps
// `cat .env.example && cat .env` from slipping the real .env past the guard.
const ALLOW_PATTERNS = [
  /\.env[-.](example|sample|template|dist|defaults)\b/gi,
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

  // Scrub allow-listed mentions, then screen what remains; report the
  // ORIGINAL candidate in the message so the block is explainable.
  const scrubbed = candidates.map((s) => {
    let out = s;
    for (const re of ALLOW_PATTERNS) out = out.replace(re, '');
    return out;
  });
  const hitIndex = scrubbed.findIndex((s) => BLOCKED_PATTERNS.some((re) => re.test(s)));
  const hit = hitIndex >= 0 ? candidates[hitIndex] : undefined;

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
