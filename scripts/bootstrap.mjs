import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MIN_NODE_MAJOR = 22;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
  console.error(`Node ${MIN_NODE_MAJOR}+ is required. Current: ${process.versions.node}`);
  process.exit(1);
}

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example. Review provider credentials before using paid integrations.');
}

run('corepack', ['enable']);
run('corepack', ['prepare', 'pnpm@10.33.0', '--activate']);
run('pnpm', ['install', '--frozen-lockfile']);
run('docker', ['compose', 'up', '-d']);
run('pnpm', ['db:migrate']);

console.log('\nBootstrap complete. Start the app with: pnpm dev');
console.log('Web: http://localhost:3000');
console.log('Mailpit: http://localhost:8025');
