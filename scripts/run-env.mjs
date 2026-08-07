import {spawnSync} from 'node:child_process';

const args = process.argv.slice(2);
const separatorIndex = args.indexOf('--');
if (separatorIndex === -1 || separatorIndex === 0) {
  console.error('Usage: node scripts/run-env.mjs KEY=VALUE... -- command [args...]');
  process.exit(1);
}

const env = { ...process.env };
for (const pair of args.slice(0, separatorIndex)) {
  const [key, ...valueParts] = pair.split('=');
  env[key] = valueParts.join('=');
}

const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 0);
