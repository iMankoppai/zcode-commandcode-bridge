#!/usr/bin/env node
/**
 * Zero-dependency static checks for this repo.
 *
 *   node scripts/check-static.mjs
 *
 * Checks (all things that have actually bitten us):
 *   .cmd / .vbs  - pure ASCII (cmd.exe parses these in the OEM codepage; non-ASCII
 *                  bytes can break the parser and split commands mid-line)
 *                - every `goto X` / `call :X` has a matching `:X` label
 *                - parentheses outside double quotes balance across the file
 *                - double quotes balance on every line
 *                - no lone CR, no tab indentation
 *   .json        - parses (BOM tolerated)
 *   .yaml/.yml   - no tab indentation, no lone CR, ends with a newline
 *   all text     - ends with a newline (keeps diffs clean)
 *
 * JavaScript syntax is checked separately by CI (`node --check`), so this script
 * never spawns a child process.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? '.');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);
const errors = [];
const checked = { cmd: 0, vbs: 0, ps1: 0, json: 0, yaml: 0, other: 0 };

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const fail = (file, line, msg) => errors.push(`${rel(file)}${line ? ':' + line : ''}  ${msg}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else out.push(path.join(dir, e.name));
  }
  return out;
}

const isAscii = (s) => /^[\x00-\x7F]*$/.test(s);

function checkCmdOrVbs(file, text, kind) {
  const lines = text.split(/\r\n|\n/);
  // lone CR (old-Mac endings / corrupted merges)
  if (/\r(?!\n)/.test(text)) fail(file, 0, 'contains a lone CR');
  if (kind === 'cmd' && !isAscii(text)) {
    const bad = lines.findIndex((l) => !isAscii(l));
    fail(file, bad + 1, 'non-ASCII byte in a .cmd file (cmd.exe parses it in the OEM codepage)');
  }
  if (kind === 'vbs' && !isAscii(text)) {
    const bad = lines.findIndex((l) => !isAscii(l));
    fail(file, bad + 1, 'non-ASCII byte in a .vbs file (keep scripts ASCII)');
  }
  const labels = new Set();
  const jumps = [];
  let parens = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (/\t/.test(raw)) fail(file, i + 1, 'tab character (use spaces)');
    if (line.startsWith(':') && !line.startsWith('::')) labels.add(line.slice(1).split(/[\s:]/)[0].toLowerCase());
    // quotes must balance per line
    if ((raw.match(/"/g) || []).length % 2 !== 0) fail(file, i + 1, 'odd number of double quotes');
    // parentheses outside double quotes, tracked across the file.
    // `echo`/`rem`/`::` lines are text: a bare `)` there is not syntax.
    const isTextLine = /^@?(echo|rem|::)/i.test(line);
    const bare = isTextLine ? '' : raw.replace(/"[^"]*"/g, '');
    parens += (bare.match(/\(/g) || []).length - (bare.match(/\)/g) || []).length;
    // goto / call targets
    const m = /^(?:goto|call)\s+:?([A-Za-z0-9_.\-]+)/i.exec(line);
    if (m && !/^eof$/i.test(m[1])) jumps.push({ target: m[1].toLowerCase(), line: i + 1 });
  });
  if (parens !== 0) fail(file, 0, `unbalanced parentheses outside quotes (net ${parens > 0 ? '+' : ''}${parens})`);
  for (const j of jumps) if (!labels.has(j.target)) fail(file, j.line, `goto/call target ":${j.target}" has no matching label`);
}

function checkJson(file, text) {
  try { JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (e) { fail(file, 0, `invalid JSON: ${e.message}`); }
}

function checkYaml(file, text) {
  if (/\r(?!\n)/.test(text)) fail(file, 0, 'contains a lone CR');
  text.split(/\r\n|\n/).forEach((l, i) => {
    if (/^\t/.test(l) || /^ +\t/.test(l)) fail(file, i + 1, 'tab used for indentation (YAML forbids tabs)');
  });
}

function checkTrailingNewline(file, text) {
  if (text.length && !text.endsWith('\n')) fail(file, 0, 'file does not end with a newline');
}

const files = walk(ROOT).sort();
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (base === 'package-lock.json') continue;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (ext === '.cmd' || ext === '.bat') { checked.cmd++; checkCmdOrVbs(file, text, 'cmd'); checkTrailingNewline(file, text); }
  else if (ext === '.vbs') { checked.vbs++; checkCmdOrVbs(file, text, 'vbs'); checkTrailingNewline(file, text); }
  else if (ext === '.ps1') {
    checked.ps1++;
    // Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI, so non-ASCII text garbles
    if (!isAscii(text)) {
      const bad = text.split(/\r\n|\n/).findIndex((l) => !isAscii(l));
      fail(file, bad + 1, 'non-ASCII byte in a .ps1 file (PowerShell 5.1 reads BOM-less scripts as ANSI)');
    }
    if (/\r(?!\n)/.test(text)) fail(file, 0, 'contains a lone CR');
    checkTrailingNewline(file, text);
  }
  else if (ext === '.json') { checked.json++; checkJson(file, text); checkTrailingNewline(file, text); }
  else if (ext === '.yaml' || ext === '.yml') { checked.yaml++; checkYaml(file, text); checkTrailingNewline(file, text); }
  else if (['.mjs', '.js', '.py', '.md', '.txt', '.patch', '.gitignore', '.gitattributes'].includes(ext) || !ext) {
    checked.other++;
    if (/\r(?!\n)/.test(text)) fail(file, 0, 'contains a lone CR');
    checkTrailingNewline(file, text);
  }
}

console.log(`check-static: ${files.length} files scanned`);
console.log(`  .cmd/.bat ${checked.cmd}   .vbs ${checked.vbs}   .ps1 ${checked.ps1}   .json ${checked.json}   .yaml ${checked.yaml}   other ${checked.other}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nOK - all static checks passed');
