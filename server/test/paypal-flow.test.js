import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { cancelOrder } from '../src/logic.js';

test('API: captura Sandbox simulada confirma una sola vez y entrega eBook', async () => {
  const store = openDatabase(':memory:');
  const book = store.saveBook({ id: store.newId(), title: 'Digital', author: 'Editorial', description: 'Libro de prueba digital',
    category: 'Datos', format: 'ebook', priceCents: 999, stock: 1, available: true, digitalContent: 'Contenido' });
  let captureCalls = 0;
  let detailsCalls = 0;
  let capturedOrderId;
  const paypal = {
    currency: 'USD', configured: true,
    createOrder: async () => ({ id: 'paypal-123', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=paypal-123' }] }),
    captureOrder: async (_id, orderId) => { captureCalls++; capturedOrderId = orderId; return { id: 'paypal-123', status: 'COMPLETED', links: [] }; },
    getOrder: async () => { detailsCalls++; return { id: 'paypal-123', status: 'COMPLETED', purchase_units: [{
      custom_id: capturedOrderId, payments: { captures: [{ id: 'capture-123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' } }] }
    }] }; }
  };
  const { app } = createApp(store, { CLIENT_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'otra-clave-larga-de-prueba-para-tests' }, { paypal });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, token) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  try {
    const registered = await call('/api/auth/register', { name: 'Cliente ficticio', email: 'cliente@example.test', password: 'password-123456' });
    const token = registered.data.token;
    const order = (await call('/api/orders', { items: [{ bookId: book.id, quantity: 1 }] }, token)).data.order;
    const provider = await call('/api/payments/paypal/order', { orderId: order.id }, token);
    assert.equal(provider.status, 201);
    assert.equal(provider.data.paypalOrderId, 'paypal-123');
    const first = await call('/api/payments/paypal/capture', { orderId: order.id, paypalOrderId: 'paypal-123' }, token);
    assert.equal(first.status, 200);
    assert.equal(first.data.order.status, 'DELIVERED');
    assert.equal(first.data.order.paymentStatus, 'CAPTURED');
    const repeated = await call('/api/payments/paypal/capture', { orderId: order.id, paypalOrderId: 'paypal-123' }, token);
    assert.equal(repeated.status, 200);
    assert.equal(captureCalls, 1);
    assert.equal(detailsCalls, 1);
    assert.equal(store.getPaymentByOrder(order.id).captureId, 'capture-123');
    assert.equal(store.getBook(book.id).stock, 0);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('API: reconcilia una captura ya completada por PayPal tras un fallo local', async () => {
  const store = openDatabase(':memory:');
  const book = store.saveBook({ id: store.newId(), title: 'Digital', author: 'Editorial', description: 'Libro de prueba digital',
    category: 'Datos', format: 'ebook', priceCents: 1499, stock: 2, available: true, digitalContent: 'Contenido' });
  let orderId;
  const paypal = {
    currency: 'USD', configured: true,
    createOrder: async () => ({ id: 'paypal-recovery', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/pay/checkout?token=paypal-recovery' }] }),
    captureOrder: async () => { throw new Error('ORDER_ALREADY_CAPTURED'); },
    getOrder: async () => ({ id: 'paypal-recovery', status: 'COMPLETED', purchase_units: [{
      custom_id: orderId, payments: { captures: [{ id: 'capture-recovery', status: 'COMPLETED', amount: { currency_code: 'USD', value: '14.99' } }] }
    }] })
  };
  const { app } = createApp(store, { CLIENT_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'otra-clave-larga-de-prueba-para-tests' }, { paypal });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, token) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  try {
    const registered = await call('/api/auth/register', { name: 'Cliente ficticio', email: 'recovery@example.test', password: 'password-123456' });
    const token = registered.data.token;
    const order = (await call('/api/orders', { items: [{ bookId: book.id, quantity: 1 }] }, token)).data.order;
    orderId = order.id;
    await call('/api/payments/paypal/order', { orderId }, token);
    const cancelled = await call(`/api/orders/${orderId}/cancel`, {}, token);
    assert.equal(cancelled.status, 409);
    assert.equal(store.getOrder(orderId).status, 'PENDING_PAYMENT');
    await cancelOrder(store, store.getOrder(orderId));
    assert.equal(store.getOrder(orderId).status, 'CANCELLED');
    assert.equal(store.getBook(book.id).stock, 2);
    const history = await fetch(base + '/api/orders/me', { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json());
    assert.equal(history.orders.find(item => item.id === orderId).canVerifyPayment, true);
    const response = await call('/api/payments/paypal/capture', { orderId }, token);
    assert.equal(response.status, 200);
    assert.equal(response.data.order.status, 'DELIVERED');
    assert.equal(response.data.order.paymentStatus, 'CAPTURED');
    assert.equal(store.getPaymentByOrder(orderId).captureId, 'capture-recovery');
    assert.equal(store.getBook(book.id).stock, 1);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('API: cancelación sin captura oculta verificación y libera stock', async () => {
  const store = openDatabase(':memory:');
  const book = store.saveBook({ id: store.newId(), title: 'Digital', author: 'Editorial', description: 'Libro de prueba digital',
    category: 'Datos', format: 'ebook', priceCents: 1299, stock: 2, available: true, digitalContent: 'Contenido' });
  const paypal = {
    currency: 'USD', configured: true,
    createOrder: async () => ({ id: 'paypal-cancelled', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/pay/checkout?token=paypal-cancelled' }] }),
    getOrder: async () => ({ id: 'paypal-cancelled', status: 'PAYER_ACTION_REQUIRED', purchase_units: [] })
  };
  const { app } = createApp(store, { CLIENT_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'otra-clave-larga-de-prueba-para-tests' }, { paypal });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method, body, token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  try {
    const registered = await call('/api/auth/register', 'POST', { name: 'Cliente ficticio', email: 'cancel@example.test', password: 'password-123456' });
    const token = registered.data.token;
    const order = (await call('/api/orders', 'POST', { items: [{ bookId: book.id, quantity: 1 }] }, token)).data.order;
    assert.equal((await call('/api/payments/paypal/order', 'POST', { orderId: order.id }, token)).status, 201);
    assert.equal((await call(`/api/orders/${order.id}/cancel`, 'POST', {}, token)).status, 200);
    const history = await call('/api/orders/me', 'GET', null, token);
    assert.equal(history.status, 200);
    assert.equal(history.data.orders.find(item => item.id === order.id).status, 'CANCELLED');
    assert.equal(history.data.orders.find(item => item.id === order.id).canVerifyPayment, false);
    assert.equal(store.getBook(book.id).stock, 2);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
