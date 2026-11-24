import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';

test('API: registro, permisos, precio y propiedad de pedidos', async () => {
  const store = openDatabase(':memory:');
  const book = store.saveBook({ id: store.newId(), title: 'Prueba', author: 'Editorial de prueba', description: 'Contenido de prueba', category: 'Datos',
    format: 'ebook', priceCents: 1500, stock: 3, available: true, digitalContent: 'Contenido de muestra' });
  const staff = store.saveUser({ id: store.newId(), name: 'Gestión', email: 'staff@example.test', role: 'staff', passwordHash: hashPassword('staff-password-123') });
  const { app } = createApp(store, { CLIENT_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'una-clave-larga-de-prueba-para-tests' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body, token, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await call('/health')).status, 200);
    assert.equal((await call('/api/orders/me')).status, 401);
    const a = await call('/api/auth/register', 'POST', { name: 'Cliente de prueba', email: 'a@example.test', password: 'password-123456', role: 'staff' });
    assert.equal(a.status, 201);
    assert.equal(a.data.user.role, 'customer');
    const b = await call('/api/auth/register', 'POST', { name: 'Otro cliente', email: 'b@example.test', password: 'password-123456' });
    const admin = await call('/api/auth/login', 'POST', { email: staff.email, password: 'staff-password-123' });
    assert.equal((await call('/api/staff/orders', 'GET', null, a.data.token)).status, 403);
    assert.equal((await call('/api/books', 'POST', { title: 'Libro malicioso' }, a.data.token)).status, 403);
    const created = await call('/api/orders', 'POST', { items: [{ bookId: book.id, quantity: 2, priceCents: 1 }] }, a.data.token, { 'Idempotency-Key': 'api-test' });
    assert.equal(created.status, 201);
    assert.equal(created.data.order.totalCents, 3000);
    const id = created.data.order.id;
    assert.equal((await call(`/api/orders/${id}`, 'GET', null, b.data.token)).status, 403);
    assert.equal((await call(`/api/orders/${id}/download/${book.id}`, 'GET', null, a.data.token)).status, 403);
    assert.equal((await call(`/api/orders/${id}/status`, 'PATCH', { status: 'DELIVERED' }, admin.data.token)).status, 409);
    assert.equal((await call('/api/payments/paypal/order', 'POST', { orderId: id }, b.data.token)).status, 403);
    assert.equal((await call(`/api/orders/${id}/cancel`, 'POST', {}, a.data.token)).status, 200);
    assert.equal(store.getBook(book.id).stock, 3);
    const ebookOrder = (await call('/api/orders', 'POST', { items: [{ bookId: book.id, quantity: 1 }] }, a.data.token)).data.order;
    store.saveOrder({ ...store.getOrder(ebookOrder.id), status: 'PAID', paymentStatus: 'CAPTURED' });
    const download = await fetch(`${base}/api/orders/${ebookOrder.id}/download/${book.id}`, { headers: { Authorization: `Bearer ${a.data.token}` } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'Contenido de muestra');
    assert.equal((await call(`/api/orders/${ebookOrder.id}/download/${book.id}`, 'GET', null, b.data.token)).status, 403);
    const physical = store.saveBook({ id: store.newId(), title: 'Impreso', author: 'Editorial', description: 'Libro impreso de prueba', category: 'Datos',
      format: 'physical', priceCents: 2000, stock: 1, available: true });
    assert.equal((await call('/api/orders', 'POST', { items: [{ bookId: physical.id, quantity: 1 }], address: '' }, a.data.token)).status, 400);
    assert.equal(store.getBook(physical.id).stock, 1);
    const physicalOrder = (await call('/api/orders', 'POST', { items: [{ bookId: physical.id, quantity: 1 }], address: 'Calle 1 # 2-3, Bogotá' }, a.data.token)).data.order;
    assert.equal(physicalOrder.totalCents, 2500);
    store.saveOrder({ ...store.getOrder(physicalOrder.id), status: 'PAID', paymentStatus: 'CAPTURED' });
    assert.equal((await call(`/api/orders/${physicalOrder.id}/status`, 'PATCH', { status: 'PREPARING' }, admin.data.token)).status, 200);
    assert.equal((await call(`/api/orders/${physicalOrder.id}/status`, 'PATCH', { status: 'READY' }, admin.data.token)).status, 200);
    assert.equal((await call(`/api/orders/${physicalOrder.id}/status`, 'PATCH', { status: 'SHIPPED' }, admin.data.token)).status, 400);
    assert.equal((await call(`/api/orders/${physicalOrder.id}/status`, 'PATCH', { status: 'SHIPPED', trackingCode: 'GUIA-1234' }, admin.data.token)).data.order.trackingCode, 'GUIA-1234');
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
