import { readFileSync } from 'node:fs';

function parseEnvFile(path) {
  const values = {};
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileArgIndex = process.argv.indexOf('--env');
const envPath = fileArgIndex >= 0 ? process.argv[fileArgIndex + 1] : '.env';
if (!envPath) throw new Error('Missing value after --env');

const fileEnv = parseEnvFile(envPath);
const env = { ...fileEnv, ...process.env };
const errors = [];
const warnings = [];

function required(key, message = `${key} is required`) {
  if (!env[key]?.trim()) errors.push(message);
}

function requireHttps(key) {
  const value = env[key]?.trim();
  if (!value) return required(key);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') errors.push(`${key} must use https in production`);
  } catch {
    errors.push(`${key} must be a valid URL`);
  }
}

for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) required(key);
requireHttps('APP_URL');
requireHttps('BETTER_AUTH_URL');

if ((env.BETTER_AUTH_SECRET?.length ?? 0) < 32) errors.push('BETTER_AUTH_SECRET must be at least 32 characters');

for (const key of ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_PRO']) required(key);

if (!env.OPENAI_API_KEY?.trim()) warnings.push('OPENAI_API_KEY is empty: AI and embeddings smoke tests cannot run');
if (!env.STORAGE_BUCKET?.trim()) warnings.push('STORAGE_BUCKET is empty: file/RAG smoke tests cannot run');
if (!env.PLATFORM_SECRET_ENCRYPTION_KEY?.trim()) {
  warnings.push('PLATFORM_SECRET_ENCRYPTION_KEY is empty: outbound webhook endpoint secrets cannot be created or delivered');
}

if (errors.length) {
  console.error('Production environment validation failed:');
  for (const error of errors) console.error(`- ${error}`);
}
if (warnings.length) {
  console.warn('Production readiness warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) process.exit(1);
console.log('Production environment validation passed.');
