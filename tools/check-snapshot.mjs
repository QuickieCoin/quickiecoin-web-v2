#!/usr/bin/env node
// Diffs Component.SNAPSHOT in index.html against the live Sanity machine
// directory and exits non-zero when they disagree.
//
// SNAPSHOT is the fallback list rendered when the CMS fetch fails. Nothing
// otherwise keeps it in sync with the CMS, so its failure mode is showing a
// list of WRONG addresses at exactly the moment the real feed is unavailable.
// This check makes that drift loud instead of silent.
//
//   node tools/check-snapshot.mjs
//
// Run it after any change to the machine directory in Sanity. It needs network
// access and no credentials — the directory is served from the public CDN.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUERY = '*[_type == "machine"]';
const ENDPOINT =
  'https://dkkl7znc.apicdn.sanity.io/v2021-10-21/data/query/production?query=' +
  encodeURIComponent(QUERY);

// Fields that actually drive what a customer sees on the card and the map.
const FIELDS = ['location', 'address', 'lat', 'long', 'open'];

function extractSnapshot(html) {
  const start = html.indexOf('static SNAPSHOT = [');
  if (start < 0) throw new Error('Could not find `static SNAPSHOT = [` in index.html');
  const open = html.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']' && --depth === 0) {
      return eval(html.slice(open, i + 1)); // trusted, first-party source file
    }
  }
  throw new Error('Unterminated SNAPSHOT array');
}

const norm = (m) => {
  const o = {};
  for (const f of FIELDS) o[f] = typeof m[f] === 'number' ? Number(m[f].toFixed(3)) : m[f];
  return o;
};
const keyOf = (m) => String(m.location || '').trim().toLowerCase();

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const snapshot = extractSnapshot(html);

const res = await fetch(ENDPOINT);
if (!res.ok) {
  console.error(`Sanity query failed: HTTP ${res.status}`);
  process.exit(2);
}
const live = (await res.json()).result || [];

const problems = [];
const liveByKey = new Map(live.map((m) => [keyOf(m), m]));
const snapByKey = new Map(snapshot.map((m) => [keyOf(m), m]));

if (live.length !== snapshot.length) {
  problems.push(`count: CMS has ${live.length} machines, SNAPSHOT has ${snapshot.length}`);
}
for (const [k, m] of liveByKey) {
  if (!snapByKey.has(k)) problems.push(`missing from SNAPSHOT: "${m.location}"`);
}
for (const [k, m] of snapByKey) {
  if (!liveByKey.has(k)) problems.push(`stale in SNAPSHOT (not in CMS): "${m.location}"`);
}
for (const [k, s] of snapByKey) {
  const l = liveByKey.get(k);
  if (!l) continue;
  const a = norm(s), b = norm(l);
  for (const f of FIELDS) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
      problems.push(`"${l.location}" ${f}: SNAPSHOT ${JSON.stringify(a[f])} != CMS ${JSON.stringify(b[f])}`);
    }
  }
}

if (problems.length) {
  console.error('SNAPSHOT is out of sync with the Sanity machine directory:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nUpdate Component.SNAPSHOT in index.html to match, then re-run.');
  process.exit(1);
}

console.log(`SNAPSHOT matches the live directory (${live.length} machines).`);
