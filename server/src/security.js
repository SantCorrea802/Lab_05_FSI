import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (v) => Buffer.from(v).toString('base64url');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const reference = Buffer.from(expected, 'hex');
  return actual.length === reference.length && timingSafeEqual(actual, reference);
}
export function signToken(user, secret, ttlSeconds = 86400) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: user.id, role: user.role, exp: Math.floor(Date.now()/1000) + ttlSeconds }));
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyToken(token, secret) {
  try {
    const [header, payload, signature, extra] = String(token).split('.');
    if (!header || !payload || !signature || extra) return null;
    const body = `${header}.${payload}`;
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret).update(body).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const h = JSON.parse(Buffer.from(header, 'base64url').toString());
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return h.alg === 'HS256' && p.exp > Date.now()/1000 && typeof p.sub === 'string' ? p : null;
  } catch { return null; }
}
export const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });
