import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env');
let content;
try {
  content = readFileSync(envPath, 'utf8');
} catch {
  console.error('No se pudo leer server/.env.');
  process.exit(1);
}

const values = new Map();
for (const line of content.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

const clientId = values.get('PAYPAL_CLIENT_ID');
const secret = values.get('PAYPAL_CLIENT_SECRET');
const base = values.get('PAYPAL_API_BASE');
if (!clientId || !secret || base !== 'https://api-m.sandbox.paypal.com') {
  console.error('La configuracion local de PayPal Sandbox esta incompleta.');
  process.exit(1);
}

try {
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    await response.arrayBuffer();
    console.error(`PayPal Sandbox rechazo la autenticacion (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else {
    const data = await response.json();
    if (!data.access_token) {
      console.error('PayPal Sandbox no devolvio un token de acceso.');
      process.exitCode = 1;
    } else {
      console.log('PayPal Sandbox: credenciales validas; token OAuth recibido.');
    }
  }
} catch {
  console.error('No se pudo contactar PayPal Sandbox desde este equipo.');
  process.exitCode = 1;
}
