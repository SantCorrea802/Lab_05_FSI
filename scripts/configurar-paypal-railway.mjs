import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const values = new Map();

try {
  for (const line of readFileSync(resolve(root, 'server', '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
} catch {
  console.error('No se pudo leer server/.env. Ejecuta primero configurar-paypal.ps1.');
  process.exit(1);
}

for (const key of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']) {
  if (!values.get(key) || /\s/.test(values.get(key))) {
    console.error(`Falta ${key} o contiene espacios. No se cambió Railway.`);
    process.exit(1);
  }
}

const toSet = [
  ['PAYPAL_CLIENT_ID', values.get('PAYPAL_CLIENT_ID')],
  ['PAYPAL_CLIENT_SECRET', values.get('PAYPAL_CLIENT_SECRET')],
  ['PAYPAL_API_BASE', 'https://api-m.sandbox.paypal.com'],
  ['PAYPAL_CURRENCY', 'USD']
];

function railway(args, input) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'railway';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', `railway.cmd ${args.join(' ')}`] : args;
  return spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

for (const [key, value] of toSet) {
  const result = railway(['variable', 'set', key, '--stdin', '--service', 'libroya-api', '--environment', 'production', '--skip-deploys'], `${value}\n`);
  if (result.error || result.status !== 0) {
    console.error(`No se pudo configurar ${key} en Railway. Las variables anteriores pueden haberse guardado. Revisa la sesión de Railway y vuelve a intentar sin compartir secretos.`);
    process.exit(1);
  }
  console.log(`${key}: configurada`);
}

const redeploy = railway(['redeploy', '--service', 'libroya-api', '--yes']);
if (redeploy.error || redeploy.status !== 0) {
  console.error('Las variables quedaron configuradas, pero no se pudo iniciar el nuevo despliegue de la API. Revisa Railway y reintenta el despliegue.');
  process.exit(1);
}
console.log('Variables PayPal Sandbox enviadas a Railway. Se inició un nuevo despliegue de la API.');
