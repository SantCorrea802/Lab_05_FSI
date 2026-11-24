import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const parse = (row) => row ? JSON.parse(row.data) : null;

export function openDatabase(file = process.env.DB_FILE || './libroya.sqlite') {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, idem_key TEXT, data TEXT NOT NULL,
      UNIQUE(user_id, idem_key));
    CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, provider_order_id TEXT UNIQUE, data TEXT NOT NULL);`);
  const get = (table, id) => parse(db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id));
  const list = (table) => db.prepare(`SELECT data FROM ${table}`).all().map(parse);
  const save = (table, value, extra = {}) => {
    const cols = ['id', ...Object.keys(extra), 'data'];
    const vals = [value.id, ...Object.values(extra), JSON.stringify(value)];
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
      ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(...vals);
    return value;
  };
  let transactionTail = Promise.resolve();
  const transaction = async (fn) => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    await previous;
    let begun = false;
    try {
      db.exec('BEGIN IMMEDIATE');
      begun = true;
      const result = await fn();
      db.exec('COMMIT');
      begun = false;
      return result;
    }
    catch (err) { if (begun) db.exec('ROLLBACK'); throw err; }
    finally { release(); }
  };
  return {
    close: () => db.close(),
    health: () => true,
    getUser: (id) => get('users', id),
    findUserByEmail: (email) => parse(db.prepare('SELECT data FROM users WHERE email=?').get(email)),
    saveUser: (u) => save('users', u, { email: u.email }),
    getBook: (id) => get('books', id),
    listBooks: () => list('books'),
    saveBook: (b) => save('books', b),
    getOrder: (id) => get('orders', id),
    listOrders: () => list('orders'),
    findOrderByKey: (userId, key) => key ? parse(db.prepare('SELECT data FROM orders WHERE user_id=? AND idem_key=?').get(userId, key)) : null,
    saveOrder: (o) => save('orders', o, { user_id: o.userId, idem_key: o.idempotencyKey || null }),
    getPaymentByOrder: (orderId) => parse(db.prepare('SELECT data FROM payments WHERE order_id=?').get(orderId)),
    savePayment: (p) => save('payments', p, { order_id: p.orderId, provider_order_id: p.providerOrderId || null }),
    transaction,
    newId: randomUUID
  };
}

export async function openStore(env = process.env) {
  if (env.MONGODB_URI) {
    const { openMongoDatabase } = await import('./mongo.js');
    return openMongoDatabase(env.MONGODB_URI);
  }
  return openDatabase(env.DB_FILE || './libroya.sqlite');
}
