// ko-qa-kit/tests/dup-check.test.js
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'dup-check.mjs');

const run = (args) => {
  try {
    const out = execFileSync('node', [script, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: (err.stdout || '') + (err.stderr || '') };
  }
};

// fixture templates dir: commands/<name>.md, skills/<name>/SKILL.md, agents/<name>.md
const mkTemplates = (spec) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ko-qa-dup-'));
  for (const [rel, description] of Object.entries(spec)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nname: x\ndescription: ${description}\n---\n\n# body\n`);
  }
  return dir;
};

describe('dup-check.mjs', () => {
  it('flags two skills whose descriptions would catch the same request', () => {
    const dir = mkTemplates({
      'skills/alpha/SKILL.md': 'Review a pull request diff for correctness and test quality',
      'skills/beta/SKILL.md': 'Reviews pull request diffs checking correctness and tests',
    });
    const { code, out } = run(['--dir', dir]);
    expect(code).toBe(0); // report mode never fails
    expect(out).toContain('skills/alpha');
    expect(out).toContain('skills/beta');
  });

  it('--strict exits 1 on an unaccepted finding', () => {
    const dir = mkTemplates({
      'skills/alpha/SKILL.md': 'Review a pull request diff for correctness and test quality',
      'skills/beta/SKILL.md': 'Reviews pull request diffs checking correctness and tests',
    });
    expect(run(['--dir', dir, '--strict']).code).toBe(1);
  });

  it('an accepted pair (with a reason) passes --strict', () => {
    const dir = mkTemplates({
      'skills/alpha/SKILL.md': 'Review a pull request diff for correctness and test quality',
      'skills/beta/SKILL.md': 'Reviews pull request diffs checking correctness and tests',
    });
    const accept = path.join(dir, 'accept.json');
    fs.writeFileSync(accept, JSON.stringify([
      { a: 'skills/alpha', b: 'skills/beta', reason: 'deliberate wrapper/implementation pair' },
    ]));
    const { code, out } = run(['--dir', dir, '--strict', '--accept', accept]);
    expect(code).toBe(0);
    expect(out).toMatch(/accepted/i);
  });

  it('an accepted-pair entry with NO reason is rejected', () => {
    const dir = mkTemplates({
      'skills/alpha/SKILL.md': 'Review a pull request diff for correctness and test quality',
      'skills/beta/SKILL.md': 'Reviews pull request diffs checking correctness and tests',
    });
    const accept = path.join(dir, 'accept.json');
    fs.writeFileSync(accept, JSON.stringify([{ a: 'skills/alpha', b: 'skills/beta' }]));
    expect(run(['--dir', dir, '--strict', '--accept', accept]).code).toBe(1);
  });

  it('a shared quoted trigger phrase is a finding even with low token overlap', () => {
    const dir = mkTemplates({
      'commands/ko-alpha.md': 'Handles widget embedding. Use when "drive the checkout widget"',
      'commands/ko-beta.md': 'Totally different purpose. But also fires on "drive the checkout widget"',
    });
    const { out } = run(['--dir', dir]);
    expect(out).toContain('ko-alpha');
    expect(out).toContain('ko-beta');
  });

  it('slash-command cross-references do NOT count as overlap', () => {
    const dir = mkTemplates({
      'commands/ko-alpha.md': 'Orchestrates the release flow; delegates to /ko-beta for the build',
      'commands/ko-beta.md': 'Builds the artifact; invoked by /ko-alpha',
    });
    const { out } = run(['--dir', dir, '--strict']);
    expect(out).toMatch(/no unaccepted/i);
  });

  it('quiet fixture: distinct resources produce no findings', () => {
    const dir = mkTemplates({
      'commands/ko-test.md': 'Run the project test suites and report failures',
      'agents/design-system-engineer.md': 'Implements accessible UI components from Figma specs',
    });
    const { code, out } = run(['--dir', dir, '--strict']);
    expect(code).toBe(0);
    expect(out).toMatch(/no unaccepted/i);
  });

  it('query mode surfaces the nearest existing capability', () => {
    const dir = mkTemplates({
      'commands/ko-test.md': 'Run the project test suites and report failures',
      'commands/ko-review.md': 'Review a pull request diff for correctness',
    });
    const { out } = run(['--dir', dir, 'review', 'pull', 'request', 'diff']);
    expect(out).toContain('ko-review');
    expect(out).not.toContain('ko-test'); // zero overlap with the query → not listed
  });

  it('the real templates/ tree passes --strict (all findings accepted with reasons)', () => {
    const { code, out } = run(['--strict']);
    expect(code, out).toBe(0);
  });
});
