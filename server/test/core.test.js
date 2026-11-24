import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { makeOrder, cancelOrder, expireUnpaidOrders } from '../src/logic.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/security.js';
import { paypalClient, verifyCapture } from '../src/paypal.js';

function fixture() {
  const db = openDatabase(':memory:');
  const book = db.saveBook({ id: db.newId(), title: 'Libro de prueba', format: 'ebook', priceCents: 1299, stock: 2, available: true });
  return { db, book };
}
test('registro: la contraseña se cifra y el token vence y se verifica', () => {
  const hash = hashPassword('contrasena-de-prueba');
  assert.notEqual(hash, 'contrasena-de-prueba');
  assert.equal(verifyPassword('contrasena-de-prueba', hash), true);
  assert.equal(verifyPassword('incorrecta', hash), false);
  const token = signToken({ id: 'u1', role: 'customer' }, 'clave-de-prueba');
  assert.equal(verifyToken(token, 'clave-de-prueba').sub, 'u1');
  assert.equal(verifyToken(token, 'otra-clave'), null);
});
test('pedido: el servidor calcula precio, reserva stock y respeta idempotencia', async () => {
  const { db, book } = fixture();
  const payload = { items: [{ bookId: book.id, quantity: 2, priceCents: 1 }] };
  const order = await makeOrder(db, 'u1', payload, 'key-1');
  assert.equal(order.totalCents, 2598);
  assert.equal(db.getBook(book.id).stock, 0);
  assert.equal((await makeOrder(db, 'u1', payload, 'key-1')).id, order.id);
  assert.equal(db.getBook(book.id).stock, 0);
  await assert.rejects(() => makeOrder(db, 'u2', payload, 'key-2'), /stock/);
  db.close();
});
test('vencimiento: no cancela una captura confirmada en PayPal y libera solo pagos sin captura', async () => {
  const { db, book } = fixture();
  try {
    const order = await makeOrder(db, 'u1', { items: [{ bookId: book.id, quantity: 1 }] }, 'expired-payment');
    db.saveOrder({ ...order, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    db.savePayment({ id: db.newId(), orderId: order.id, providerOrderId: 'paypal-expired', provider: 'PAYPAL', status: 'CREATED' });
    const events = [];
    const publish = (_order, event) => events.push(event);
    const captured = { getOrder: async () => ({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ status: 'COMPLETED' }] } }] }) };
    assert.deepEqual(await expireUnpaidOrders(db, captured, publish), []);
    assert.equal(db.getOrder(order.id).status, 'PENDING_PAYMENT');
    assert.equal(db.getBook(book.id).stock, 1);
    const unapproved = { getOrder: async () => ({ status: 'PAYER_ACTION_REQUIRED' }) };
    assert.deepEqual(await expireUnpaidOrders(db, unapproved, publish), []);
    assert.equal(db.getOrder(order.id).status, 'CANCELLED');
    assert.equal(db.getBook(book.id).stock, 2);
    assert.deepEqual(events, ['order:updated']);
  } finally { db.close(); }
});
test('pedido: cantidades inválidas no cambian stock y cancelación lo libera', async () => {
  const { db, book } = fixture();
  await assert.rejects(() => makeOrder(db, 'u1', { items: [{ bookId: book.id, quantity: -1 }] }), /Cantidad/);
  assert.equal(db.getBook(book.id).stock, 2);
  const order = await makeOrder(db, 'u1', { items: [{ bookId: book.id, quantity: 1 }] });
  await cancelOrder(db, order);
  assert.equal(db.getBook(book.id).stock, 2);
  await assert.rejects(() => cancelOrder(db, order), /cancelarse/);
  db.close();
});
test('captura: rechaza importe, moneda e identificador distintos', () => {
  const order = { id: 'o1', totalCents: 1299 };
  const response = { id: 'p1', status: 'COMPLETED', purchase_units: [{ custom_id: 'o1', payments: { captures: [{ id: 'c1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '12.99' } }] } }] };
  assert.equal(verifyCapture(response, order, 'p1', 'USD'), 'c1');
  assert.throws(() => verifyCapture(response, { ...order, totalCents: 100 }, 'p1', 'USD'), /importe/);
  assert.throws(() => verifyCapture(response, order, 'p2', 'USD'), /coincide/);
  assert.throws(() => verifyCapture(response, order, 'p1', 'COP'), /importe/);
});
test('PayPal: crea orden con importe del servidor y URL de retorno', async () => {
  const oldFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/v1/oauth2/token') ? { access_token: 'test-token' } : { id: 'paypal-1', links: [] } };
  };
  try {
    const client = paypalClient({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', CLIENT_ORIGIN: 'https://example.test', PAYPAL_CURRENCY: 'USD' });
    await client.createOrder({ id: 'order-1', totalCents: 2598, items: [{ format: 'ebook' }] });
    const body = JSON.parse(requests[1].options.body);
    assert.equal(body.purchase_units[0].amount.value, '25.98');
    assert.equal(body.purchase_units[0].custom_id, 'order-1');
    assert.equal(body.payment_source.paypal.experience_context.return_url, 'https://example.test/?checkout=return');
    assert.equal(body.payment_source.paypal.experience_context.shipping_preference, 'NO_SHIPPING');
    await client.captureOrder('paypal-1', 'order-1');
    assert.equal(requests[3].options.headers.Prefer, 'return=representation');
  } finally { globalThis.fetch = oldFetch; }
});
