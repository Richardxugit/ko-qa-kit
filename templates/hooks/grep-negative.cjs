#!/usr/bin/env node
// ko-qa-kit grep-negative hook (Cursor hook protocol).
// Wired in .cursor/hooks.json to: postToolUse with matcher "Grep".
//
// A case-sensitive Grep that returns nothing is routinely read as proof the
// thing does not exist. It only proves that literal is absent — the call site
// may be the accessor (getExternalUrl), a constant (EXTERNAL_URL), or a
// snake/kebab variant. When a case-sensitive Grep comes back empty, name what
// would actually settle it.
//
// Scoped narrowly on purpose: a search that already passed a case-insensitive
// flag has earned its negative and gets nothing from this hook. And when the
// event carries no tool_response at all we cannot establish emptiness, so we
// stay silent rather than nag on every search.
//
// Contract: JSON event on stdin, JSON on stdout, exit 0. This hook only adds
// context; it can never block. Every failure path is silent.
//
// Cursor's postToolUse payload carries the result as `tool_output` (a string,
// often itself JSON like {"pattern":"…","success":true}); Claude Code uses
// `tool_response`. Read both. When neither is present we cannot establish
// emptiness, so we stay silent rather than nag on every search.

const EMPTY_MARKERS = ['No matches found', 'No files found', 'Found 0 '];
const RESULT_KEYS = ['matches', 'files', 'results', 'lines', 'content', 'text', 'output'];

const finish = (obj) => {
  process.stdout.write(JSON.stringify(obj || {}));
  process.exit(0);
};

const responseText = (input) => {
  const response = input.tool_output ?? input.tool_response;
  if (response == null) return null; // absent — not evidence of emptiness
  if (typeof response === 'string') return response;
  try { return JSON.stringify(response); } catch { return null; }
};

const isEmptyResult = (text) => {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '{}' || trimmed === '[]' || trimmed === '""') return true;
  if (EMPTY_MARKERS.some((m) => trimmed.includes(m))) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.length === 0;
      // an object carrying no recognizable non-empty result payload = no matches
      for (const key of RESULT_KEYS) {
        const v = parsed[key];
        if (Array.isArray(v) && v.length > 0) return false;
        if (typeof v === 'string' && v.trim()) return false;
      }
      return true;
    } catch { /* not JSON — fall through */ }
  }
  return false;
};

const wasCaseInsensitive = (ti) =>
  ti['-i'] === true || ti.i === true || ti.case_insensitive === true || ti.caseInsensitive === true;

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
  if (input.tool_name && input.tool_name !== 'Grep') return finish({});

  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  if (wasCaseInsensitive(ti)) return finish({});

  const text = responseText(input);
  if (text === null || !isEmptyResult(text)) return finish({});

  const pattern = String(ti.pattern || '').slice(0, 80);
  finish({
    additional_context:
      `grep-negative: the case-sensitive search for \`${pattern}\` returned nothing. ` +
      'That establishes the literal is absent, not the concept. Before asserting absence, re-run ' +
      'case-insensitively and with the variants this codebase uses — the accessor (`getFoo`), the ' +
      'property (`foo`), the constant (`FOO`), snake/kebab forms, and the plural. If you were ' +
      'locating a known symbol rather than proving absence, carry on.',
  });
}
