// Comprobación de solo lectura. No imprime correo, contraseña, URI ni token.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openMongoDatabase } from '../server/src/mongo.js';
import { hashPassword, verifyPassword } from '../server/src/security.js';

const root = resolve(import.meta.dirname, '..');
const repair = process.argv.includes('--repair');
const env = new Map();
for (const line of readFileSync(resolve(root, 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const match = /^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/.exec(line);
  if (match) env.set(match[1], match[2]);
}
for (const key of ['MONGODB_URI', 'STAFF_EMAIL', 'STAFF_PASSWORD']) {
  if (!env.get(key)) { console.log(`Falta ${key} en server/.env.`); process.exit(1); }
}

let store;
try {
  store = await openMongoDatabase(env.get('MONGODB_URI'));
  const user = await store.findUserByEmail(env.get('STAFF_EMAIL').trim().toLowerCase());
  if (!user) {
    console.log('Atlas: la cuenta de personal configurada no existe.');
  } else {
    console.log(`Atlas: cuenta encontrada; rol ${user.role === 'staff' ? 'staff' : 'distinto de staff'}.`);
    const matches = verifyPassword(env.get('STAFF_PASSWORD'), user.passwordHash);
    console.log(`Atlas: la contraseña de server/.env ${matches ? 'COINCIDE' : 'NO COINCIDE'} con la guardada para esa cuenta.`);
    if (repair && !matches && user.role === 'staff') {
      await store.saveUser({ ...user, passwordHash: hashPassword(env.get('STAFF_PASSWORD')) });
      console.log('Atlas: contraseña de la cuenta staff sincronizada con server/.env.');
    } else if (repair && user.role !== 'staff') {
      console.log('Atlas: no se modificó la cuenta porque su rol no es staff.');
    }
  }
} catch (error) {
  console.log(`Atlas: no se pudo completar la comprobación (${error.code || error.name}).`);
  process.exitCode = 1;
} finally {
  if (store) await store.close();
}

if (!process.exitCode) {
  try {
    const response = await fetch('https://libroya-api-production.up.railway.app/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.get('STAFF_EMAIL'), password: env.get('STAFF_PASSWORD') }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    console.log(`API pública: HTTP ${response.status}; ${response.ok ? `acceso ${data.user?.role === 'staff' ? 'staff' : 'con otro rol'}` : 'acceso rechazado'}.`);
  } catch (error) {
    console.log(`API pública: no se pudo completar la comprobación (${error.code || error.name}).`);
    process.exitCode = 1;
  }
}
