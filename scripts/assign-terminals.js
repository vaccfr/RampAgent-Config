/**
 * Assigns the Terminal property to LFPG stands.
 *
 *   node assign-terminals.js            # dry run - prints what it would do
 *   node assign-terminals.js --write    # applies the change
 *
 * Terminal is what opts a stand in to the Hoppie gate notification: a stand
 * without it is never notified, so leaving one unmapped is safe rather than
 * wrong. Anything the rules below do not cover is reported and left alone.
 *
 * Rules are evaluated in order, first match wins, so the explicit stand lists
 * take precedence over the prefix rules that would otherwise claim them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AIRPORT = path.join(__dirname, 'airports', 'LFPG.json');
const SCHEMA = path.join(__dirname, '.github', 'schema', 'airportConfig.schema.json');
const WRITE = process.argv.includes('--write');

const set = (...names) => new Set(names);

// Satellite 3 draws from three piers, so it is a stand list rather than a prefix.
const S3 = set(
  'F03', 'F09', 'F15',
  'E01', 'E05', 'E09', 'E15', 'E17', 'E21', 'E25', 'E27', 'E29',
  'K01', 'K05', 'K09', 'K13', 'K17', 'K21', 'K53', 'K59', 'K65', 'K71'
);

const RULES = [
  { terminal: 'S3', match: (n) => S3.has(n) },

  { terminal: '2A', match: (n) => /^A\d/.test(n) },
  { terminal: '2B', match: (n) => /^B\d/.test(n) },
  // Every C stand belongs to 2C, including the CF9/CFE/CFW remote positions,
  // so this one matches the letter rather than letter-then-digit.
  { terminal: '2C', match: (n) => /^C/.test(n) },
  { terminal: '2D', match: (n) => /^D\d/.test(n) },
  { terminal: '2E', match: (n) => /^E\d/.test(n) },
  { terminal: '2F', match: (n) => /^F\d/.test(n) },
  { terminal: '2G', match: (n) => /^J\d/.test(n) },

  // Whatever K and L stands S3 did not claim.
  { terminal: 'S4', match: (n) => /^[KL]\d/.test(n) },

  { terminal: '3', match: (n) => /^Q\d/.test(n) },
  { terminal: 'H', match: (n) => /^H\d/.test(n) },
  { terminal: 'GA', match: (n) => /^G\d/.test(n) },
  { terminal: 'R', match: (n) => /^R\d/.test(n) },
  { terminal: '1', match: (n) => /^[UWXYZS]\d/.test(n) },
  { terminal: 'FREIGHT', match: (n) => /^[MNP]\d/.test(n) },
  { terminal: 'FEDEX', match: (n) => /^I\d/.test(n) },
];

function terminalFor(name) {
  for (const rule of RULES) if (rule.match(name)) return rule.terminal;
  return null;
}

const raw = fs.readFileSync(AIRPORT, 'utf8');
const crlf = raw.includes('\r\n');
const airport = JSON.parse(raw);

const assigned = new Map(); // terminal -> [stand]
const unmapped = [];
const changed = [];
const unchanged = [];

for (const [name, stand] of Object.entries(airport.Stands)) {
  const terminal = terminalFor(name);
  if (!terminal) {
    unmapped.push(name);
    continue;
  }
  (assigned.get(terminal) ?? assigned.set(terminal, []).get(terminal)).push(name);
  if (stand.Terminal === terminal) unchanged.push(name);
  else changed.push(`${name}: ${stand.Terminal ?? '(none)'} -> ${terminal}`);
  stand.Terminal = terminal;
}

console.log(`${Object.keys(airport.Stands).length} stands in ${path.basename(AIRPORT)}\n`);
console.log('terminal   count  stands');
for (const terminal of [...assigned.keys()].sort()) {
  const list = assigned.get(terminal);
  console.log(
    `${terminal.padEnd(10)} ${String(list.length).padStart(4)}   ${list.join(' ').slice(0, 110)}${list.join(' ').length > 110 ? ' ...' : ''}`
  );
}

console.log(`\nassigned ${changed.length}, already correct ${unchanged.length}, unmapped ${unmapped.length}`);
if (unmapped.length) {
  console.log('\nNOT ASSIGNED - no rule covers these, so they stay silent:');
  const grouped = {};
  for (const n of unmapped) {
    const p = n.match(/^([A-Z]+)/)[1];
    (grouped[p] = grouped[p] ?? []).push(n);
  }
  for (const p of Object.keys(grouped).sort()) {
    console.log(`  ${p.padEnd(4)} (${String(grouped[p].length).padStart(2)})  ${grouped[p].join(' ')}`);
  }
}

// Every Terminal written has to satisfy the schema, or the config PR fails CI.
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(airport);
console.log(`\nschema: ${valid ? 'valid' : 'INVALID'}`);
if (!valid) {
  for (const e of validate.errors.slice(0, 8)) console.log(`  ${e.instancePath} ${e.message}`);
  process.exit(1);
}

if (!WRITE) {
  console.log('\ndry run - nothing written. Re-run with --write to apply.');
  process.exit(0);
}

let out = JSON.stringify(airport, null, 4) + '\n';
if (crlf) out = out.replace(/\n/g, '\r\n');
fs.writeFileSync(AIRPORT, out);
console.log(`\nwritten to ${AIRPORT}`);
console.log('Remember to bump "version" in the airport file so the API reloads it.');
