import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// use absolute paths relative to this script file
const airportSchemaPath = path.join(__dirname, '.github', 'schema', 'airportConfig.schema.json');
const configSchemaPath  = path.join(__dirname, '.github', 'schema', 'config.schema.json');
const schema = JSON.parse(fs.readFileSync(airportSchemaPath, 'utf8'));
const configSchema = JSON.parse(fs.readFileSync(configSchemaPath, 'utf8'));

const validateAirport = ajv.compile(schema);
const validateConfig = ajv.compile(configSchema);

const configDir = path.join(__dirname, 'airports');
const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));

let failed = false;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
  if (!validateAirport(data)) {
    console.error(`❌ ${file} failed validation:`);
    console.error(validateAirport.errors);
    failed = true;
  } else {
    console.log(`✅ ${file} passed validation`);
  }
}

const configData = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
if (!validateConfig(configData)) {
  console.error('❌ config.json failed validation:');
  console.error(validateConfig.errors);
  failed = true;
} else {
  console.log('✅ config.json passed validation');
}

if (failed) {
  console.error('One or more configs are invalid. Exiting.');
  process.exit(1);
}
console.log('Validation complete.');