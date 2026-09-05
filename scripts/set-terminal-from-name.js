/**
 * Sets each stand's Terminal to its own name, for airports where the stand
 * naming already carries the terminal (LFML's "2A", "3C", ...).
 *
 *   node set-terminal-from-name.js LFML            # dry run
 *   node set-terminal-from-name.js LFML --write    # apply
 *   node set-terminal-from-name.js LFML --write --no-bump
 *
 * Terminal is what opts a stand in to the Hoppie gate notification, and its
 * value is substituted straight into the TELEX, so it has to satisfy the same
 * constraints as the message. The allowed pattern and length are read from the
 * schema rather than repeated here, so the two cannot drift apart. Any stand
 * whose name does not qualify is reported and left untouched instead of writing
 * config that would fail validation.
 *
 * Writing bumps the airport's patch version, because the API only reloads an
 * airport when its version changes - without that the edit sits on disk and
 * never takes effect.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AIRPORTS = path.join(__dirname, '../airports');
const SCHEMA = path.join(__dirname, '../.github', 'schema', 'airportConfig.schema.json');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const BUMP = !args.includes('--no-bump');
const icaoArg = args.find((a) => !a.startsWith('--'));

if (!icaoArg) {
  console.error('usage: node set-terminal-from-name.js <ICAO> [--write] [--no-bump]');
  process.exit(2);
}

const icao = icaoArg.toUpperCase();
const file = path.join(AIRPORTS, `${icao}.json`);
if (!fs.existsSync(file)) {
  console.error(`No such airport: ${icao}`);
  console.error(
    'Available: ' +
      fs.readdirSync(AIRPORTS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).join(' ')
  );
  process.exit(2);
}

// Take the Terminal constraints from the schema so this stays in step with it.
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const terminalSchema = schema.properties.Stands.additionalProperties.properties.Terminal;
const allowed = new RegExp(terminalSchema.pattern);
const maxLength = terminalSchema.maxLength ?? Infinity;

const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const airport = JSON.parse(raw);
const stands = airport.Stands ?? {};

const applied = [];
const unchanged = [];
const skipped = [];

for (const [name, stand] of Object.entries(stands)) {
  const reason = !allowed.test(name)
    ? `does not match ${terminalSchema.pattern}`
    : name.length > maxLength
      ? `longer than ${maxLength} characters`
      : null;

  if (reason) {
    skipped.push({ name, reason });
    continue;
  }
  if (stand.Terminal === name) unchanged.push(name);
  else applied.push(`${name}${stand.Terminal ? ` (was ${stand.Terminal})` : ''}`);
  stand.Terminal = name;
}

console.log(`${icao}: ${Object.keys(stands).length} stands\n`);
console.log(`  set        ${String(applied.length).padStart(4)}`);
console.log(`  unchanged  ${String(unchanged.length).padStart(4)}`);
console.log(`  skipped    ${String(skipped.length).padStart(4)}`);

if (applied.length) {
  const shown = applied.slice(0, 30).join(' ');
  console.log(`\nset: ${shown}${applied.length > 30 ? ` ... +${applied.length - 30} more` : ''}`);
}

if (skipped.length) {
  console.log('\nSKIPPED - the name cannot be used as a Terminal value:');
  for (const s of skipped) console.log(`  ${JSON.stringify(s.name).padEnd(18)} ${s.reason}`);
}

// Terminal does nothing on its own: the airport also needs a Hoppie block.
if (!airport.Hoppie || !airport.Hoppie.MessageTemplate) {
  console.log(
    `\nNOTE: ${icao} has no Hoppie.MessageTemplate, so these stands will not notify.` +
      '\n      Terminal only opts a stand in once the airport itself opts in.'
  );
}

if (BUMP && WRITE && applied.length) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(airport.version ?? '');
  if (m) {
    const bumped = `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
    console.log(`\nversion ${airport.version} -> ${bumped}`);
    airport.version = bumped;
  } else {
    console.log(`\nWARNING: version ${JSON.stringify(airport.version)} is not vX.Y.Z, not bumping.`);
    console.log('         Bump it by hand or the API will keep serving the cached config.');
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(airport)) {
  console.log('\nschema: INVALID - nothing written');
  for (const e of validate.errors.slice(0, 8)) console.log(`  ${e.instancePath} ${e.message}`);
  process.exit(1);
}
console.log('\nschema: valid');

if (!WRITE) {
  console.log('dry run - nothing written. Re-run with --write to apply.');
  process.exit(0);
}

let out = JSON.stringify(airport, null, 4) + '\n';
if (crlf) out = out.replace(/\n/g, '\r\n');
fs.writeFileSync(file, out);
console.log(`written to ${file}`);
