import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'server', '.env');
const values = new Map();

try {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
} catch {
  console.error('No se pudo leer server/.env. Configura Atlas y el usuario de personal antes de continuar.');
  process.exit(1);
}

for (const key of ['MONGODB_URI', 'STAFF_EMAIL', 'STAFF_PASSWORD']) {
  if (!values.get(key)) {
    console.error(`Falta ${key} en server/.env. No se cambió Railway.`);
    process.exit(1);
  }
}

if (!/^mongodb(\+srv)?:\/\//.test(values.get('MONGODB_URI'))) {
  console.error('MONGODB_URI no tiene un formato MongoDB válido. No se cambió Railway.');
  process.exit(1);
}

const toSet = [
  ['NODE_ENV', 'production'],
  ['JWT_SECRET', randomBytes(32).toString('hex')],
  ...['MONGODB_URI', 'STAFF_EMAIL', 'STAFF_PASSWORD'].map((key) => [key, values.get(key)])
];

for (const [key, value] of toSet) {
  const args = ['variable', 'set', key, '--stdin', '--service', 'libroya-api', '--environment', 'production', '--skip-deploys'];
  const command = process.platform === 'win32' ? 'cmd.exe' : 'railway';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', `railway.cmd ${args.join(' ')}`] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    input: `${value}\n`,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    console.error(`No se pudo configurar ${key} en Railway. Revisa que railway.cmd funcione y que el proyecto esté vinculado. No compartas la salida completa si contiene secretos.`);
    process.exit(1);
  }
  console.log(`${key}: configurada`);
}

console.log('Variables de la API preparadas. Revisa los nombres en Railway y aplica los cambios pendientes antes de desplegar.');
