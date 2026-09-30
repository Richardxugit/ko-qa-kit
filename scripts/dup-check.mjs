#!/usr/bin/env node
// dup-check.mjs — find template resources whose descriptions would compete for
// the same request. Maintenance tooling for THIS repo; not part of the payload.
//
// WHY: two resources covering the same ground is worse than one imperfect one —
// the agent picks between them unpredictably, sometimes the stale one, and
// nobody files a bug because nothing errors. Duplication in a description
// library is not waste, it is nondeterminism.
//
// The signal that matters most is TRIGGER overlap: two descriptions that would
// both fire on the same request. Slash-command mentions are NOT counted — two
// resources naming the same /ko-* command are both driven by it, which is the
// intended shape, not a collision.
//
// USAGE
//   node scripts/dup-check.mjs                  # audit the kit
//   node scripts/dup-check.mjs --strict         # exit 1 on an unaccepted finding
//   node scripts/dup-check.mjs --json
//   node scripts/dup-check.mjs <words...>       # does this capability already exist?
//   node scripts/dup-check.mjs --dir <path>     # audit a different templates dir
//   node scripts/dup-check.mjs --accept <file>  # extra accepted pairs (JSON)

import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_DIR = path.resolve('templates');
const THRESHOLD = 0.45; // Jaccard on description tokens — calibrated against templates/

// Pairs already looked at and deliberately kept. An entry with no reason is not
// an entry — this list is the audit trail.
const ACCEPTED_PAIRS = [];

// Words too common in this kit's descriptions to carry routing signal.
const STOPWORDS = new Set(`
a an the and or but if then than that this these those for with without within from to into of on in
at by as is are be been being use used using when whenever while during also any all every each
kit command agent user should must not do does doing done via per it its
work works working code file files project repo repository set up new create creating created
modify modifying change changing add adding update updating write writing run running
cursor ko-qa-kit installed standalone fallback mode report reports
`.trim().split(/\s+/));

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json');
const QUERY = args.filter((a, i) => !a.startsWith('--') && (i === 0 || args[i - 1] !== '--dir' && args[i - 1] !== '--accept'));
const SCAN_DIR = path.resolve(opt('dir') || TEMPLATE_DIR);

function collect(dir) {
  const out = [];
  const read = (file, id) => {
    const content = fs.readFileSync(file, 'utf-8');
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    const desc = m?.[1].match(/description:\s*(.+)/)?.[1]?.trim() || '';
    if (desc) out.push({ id, description: desc });
  };
  const walk = (sub, mapId) => {
    const base = path.join(dir, sub);
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (sub === 'skills' && entry.isDirectory()) {
        const sk = path.join(base, entry.name, 'SKILL.md');
        if (fs.existsSync(sk)) read(sk, `skills/${entry.name}`);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        read(path.join(base, entry.name), mapId(entry.name));
      }
    }
  };
  walk('commands', (n) => `commands/${n.replace(/\.md$/, '')}`);
  walk('agents', (n) => `agents/${n.replace(/\.md$/, '')}`);
  walk('skills', (n) => n);
  return out;
}

// Light suffix stemming so "review"/"reviews", "diff"/"diffs", "test"/"tests",
// "checking"/"check" collide — exact-token matching misses the pairs that matter.
const stem = (w) => {
  let s = w.replace(/ies$/, 'y');
  if (s.length > 5) s = s.replace(/(ing|ed)$/, '');
  if (s.length > 3) s = s.replace(/s$/, '');
  return s;
};

function tokens(text) {
  // strip slash-command mentions before tokenizing — they are routing, not signal
  const clean = text.replace(/\/ko-[\w-]+/g, ' ');
  return new Set(
    clean.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

function triggerPhrases(description) {
  const phrases = new Set();
  for (const m of description.matchAll(/["""]([^"""]{4,60})["""]/g)) phrases.add(m[1].trim().toLowerCase());
  return phrases;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

function loadAccepted(extraPath) {
  const pairs = [...ACCEPTED_PAIRS];
  if (extraPath) pairs.push(...JSON.parse(fs.readFileSync(extraPath, 'utf-8')));
  return pairs;
}

const pairKey = (a, b) => [a, b].sort().join(' ↔ ');
const accepted = (pairs, a, b) => {
  const key = pairKey(a, b);
  return pairs.find((p) => pairKey(p.a, p.b) === key);
};

function main() {
  const resources = collect(SCAN_DIR);
  const pairs = loadAccepted(opt('accept'));

  if (QUERY.length) {
    const q = tokens(QUERY.join(' '));
    const ranked = resources
      .map((r) => ({ id: r.id, score: jaccard(q, tokens(r.description)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    console.log(ranked.length
      ? ranked.map((r) => `${r.score.toFixed(2)}  ${r.id}`).join('\n')
      : 'No existing capability matches — safe to add.');
    return;
  }

  const findings = [];
  const acceptedHits = [];
  const badAccepts = [];
  for (let i = 0; i < resources.length; i++) {
    for (let j = i + 1; j < resources.length; j++) {
      const a = resources[i];
      const b = resources[j];
      const phrasesA = triggerPhrases(a.description);
      const phrasesB = triggerPhrases(b.description);
      const sharedPhrases = [...phrasesA].filter((p) => phrasesB.has(p));
      const score = sharedPhrases.length ? 1 : jaccard(tokens(a.description), tokens(b.description));
      if (score < THRESHOLD && !sharedPhrases.length) continue;
      const hit = { a: a.id, b: b.id, score: Number(score.toFixed(2)), sharedPhrases };
      const ok = accepted(pairs, a.id, b.id);
      if (!ok) findings.push(hit);
      else if (!ok.reason) badAccepts.push({ ...hit, reason: '(missing)' });
      else acceptedHits.push({ ...hit, reason: ok.reason });
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ findings, acceptedHits, badAccepts }, null, 2));
  } else {
    for (const f of findings) {
      console.log(`OVERLAP ${f.score}  ${f.a}  ×  ${f.b}${f.sharedPhrases.length ? `  (shared trigger: "${f.sharedPhrases[0]}")` : ''}`);
    }
    for (const f of badAccepts) {
      console.log(`BAD-ACCEPT (no reason)  ${f.a}  ×  ${f.b}`);
    }
    for (const f of acceptedHits) {
      console.log(`accepted ${f.score}  ${f.a}  ×  ${f.b} — ${f.reason}`);
    }
    if (!findings.length && !badAccepts.length) {
      console.log(`No unaccepted overlaps (${resources.length} resources, ${acceptedHits.length} accepted).`);
    }
  }
  if (STRICT && (findings.length || badAccepts.length)) process.exit(1);
}

main();
