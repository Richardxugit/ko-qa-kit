#!/usr/bin/env node
// ko-qa-kit/scripts/context-budget.mjs
// Measures the kit's context footprint and checks size budgets.
//
//   node scripts/context-budget.mjs            report only (exit 0)
//   node scripts/context-budget.mjs --enforce  exit 1 on any budget breach
//
// Budgets (chars, ~4 chars/token):
//   ALWAYS_APPLY_TOTAL  5000 — sum of all alwaysApply rules; paid on EVERY message
//   COMMAND_CORE        9000 — per command body
// These exist to stop slow re-bloat: every token here is re-paid every turn/invocation.
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(__dirname, '..', 'templates');

const BUDGETS = { ALWAYS_APPLY_TOTAL: 5000, COMMAND_CORE: 9000 };
const enforce = process.argv.includes('--enforce');
let breaches = 0;

const check = (label, size, budget) => {
  const over = size > budget;
  if (over) breaches++;
  console.log(`  ${over ? '✗ OVER ' : '✓'} ${label}: ${size} / ${budget}`);
};

console.log('alwaysApply rules (paid every message):');
let alwaysTotal = 0;
for (const f of fs.readdirSync(path.join(TEMPLATES, 'rules')).filter(f => f.endsWith('.mdc'))) {
  const content = fs.readFileSync(path.join(TEMPLATES, 'rules', f), 'utf-8');
  if (/^alwaysApply:\s*true/m.test(content)) {
    alwaysTotal += content.length;
    console.log(`    ${f}: ${content.length}`);
  }
}
check('TOTAL', alwaysTotal, BUDGETS.ALWAYS_APPLY_TOTAL);

console.log('\ncommand bodies (paid per invocation):');
for (const f of fs.readdirSync(path.join(TEMPLATES, 'commands')).filter(f => f.endsWith('.md')).sort()) {
  const size = fs.readFileSync(path.join(TEMPLATES, 'commands', f), 'utf-8').length;
  check(f.replace(/\.md$/, ''), size, BUDGETS.COMMAND_CORE);
}

console.log(breaches === 0 ? '\ncontext-budget: all within budget' : `\ncontext-budget: ${breaches} breach(es)`);
if (enforce && breaches > 0) process.exit(1);
