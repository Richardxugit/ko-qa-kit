#!/usr/bin/env node
// ko-qa-kit edit-lint hook (Cursor hook protocol).
// Wired in .cursor/hooks.json to: postToolUse with matcher "Write".
//
// After the agent edits a TS/JS file, run the project's own eslint on that one
// file and feed errors back to the agent via `additional_context` — it fixes
// them on the spot instead of rediscovering them at verify time.
//
// Contract: JSON event on stdin, JSON on stdout, exit 0. This hook only adds
// context; it can never block. Every failure path is silent (fail-open +
// fail-silent) — a hook that interrupts the loop is worse than no hook.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LINT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);
const COOLDOWN_MS = Number(process.env.KO_EDIT_LINT_COOLDOWN_MS || 1500);
const LINT_TIMEOUT_MS = 8000;
const MAX_ERRORS = 10;
const MAX_OUT = 3000;

const finish = (obj) => {
  process.stdout.write(JSON.stringify(obj || {}));
  process.exit(0);
};

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    main(JSON.parse(raw || '{}'));
  } catch {
    finish({});
  }
});

function main(input) {
  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const filePath = ti.file_path || ti.path || ti.target_file || input.file_path || input.path;
  if (!filePath || typeof filePath !== 'string') return finish({});
  if (!LINT_EXTS.has(path.extname(filePath))) return finish({});

  const root = process.env.CURSOR_PROJECT_DIR
    || (Array.isArray(input.workspace_roots) && input.workspace_roots[0])
    || process.cwd();
  const eslintJs = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!fs.existsSync(eslintJs)) return finish({}); // project has no eslint — nothing to add

  if (inCooldown(filePath)) return finish({});

  let messages;
  try {
    const out = execFileSync(process.execPath, [eslintJs, filePath, '--format', 'json'], {
      cwd: root,
      timeout: LINT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, CI: '1' },
    });
    messages = parseEslint(out, filePath);
  } catch (err) {
    // eslint exits 1 when it finds problems — stdout still carries the report
    messages = parseEslint(err.stdout, filePath);
    if (!messages && err.code === 'ENOENT') return finish({});
    if (!messages) return finish({}); // real crash/config error — stay silent
  }

  const errors = messages.filter((m) => m.severity === 2);
  if (errors.length === 0) return finish({});

  const rel = path.relative(root, filePath) || filePath;
  const lines = errors.slice(0, MAX_ERRORS).map(
    (m) => `  ${m.line}:${m.column} ${m.ruleId || 'fatal'} ${m.message}`,
  );
  let body = `edit-lint: ${rel} has ${errors.length} eslint error(s):\n${lines.join('\n')}`;
  if (errors.length > MAX_ERRORS) body += `\n  … and ${errors.length - MAX_ERRORS} more`;
  if (body.length > MAX_OUT) body = `${body.slice(0, MAX_OUT)}\n  … (truncated)`;
  finish({ additional_context: body });
}

// eslint --format json prints the report to stdout even on exit 1; a crash or
// config error prints prose we can't parse — return null and stay silent.
function parseEslint(stdout, filePath) {
  if (!stdout) return null;
  try {
    const results = JSON.parse(stdout);
    if (!Array.isArray(results)) return null;
    const hit = results.find((r) => path.resolve(r.filePath || '') === path.resolve(filePath))
      || results[0];
    return (hit && hit.messages) || [];
  } catch {
    return null;
  }
}

// Agent edits arrive in bursts — lint each file at most once per cooldown window.
function inCooldown(filePath) {
  const dir = process.env.KO_EDIT_LINT_STATE_DIR
    || path.join(os.tmpdir(), 'ko-edit-lint');
  const key = path.join(dir, Buffer.from(filePath).toString('base64url'));
  try {
    const stat = fs.statSync(key);
    if (Date.now() - stat.mtimeMs < COOLDOWN_MS) return true;
  } catch { /* no sentinel yet */ }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(key, String(Date.now()));
  } catch { /* cooldown is best-effort */ }
  return false;
}
