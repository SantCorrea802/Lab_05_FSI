import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signToken } from '../src/security.js';

test('WebSocket: autentica y envía cada pedido solo a su cliente y al personal', { timeout: 5000 }, async () => {
  const store = openDatabase(':memory:');
  const secret = 'clave-de-prueba-para-websocket-con-32-caracteres';
  const alice = store.saveUser({ id: store.newId(), name: 'Cliente A', email: 'a@example.test', role: 'customer', passwordHash: 'test' });
  const bob = store.saveUser({ id: store.newId(), name: 'Cliente B', email: 'b@example.test', role: 'customer', passwordHash: 'test' });
  const staff = store.saveUser({ id: store.newId(), name: 'Personal', email: 'staff@example.test', role: 'staff', passwordHash: 'test' });
  const { app, wss, publish } = createApp(store, { CLIENT_ORIGIN: 'http://localhost:3000', JWT_SECRET: secret });
  const server = http.createServer(app);
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const sockets = [];
  const connect = async (user) => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    await once(ws, 'open');
    const connected = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'auth', token: signToken(user, secret) }));
    assert.equal(JSON.parse((await connected)[0].toString()).event, 'connected');
    return ws;
  };
  try {
    const clientA = await connect(alice);
    const clientB = await connect(bob);
    const staffSocket = await connect(staff);
    const unexpected = [];
    clientB.on('message', msg => unexpected.push(JSON.parse(msg.toString())));

    const order = { id: store.newId(), userId: alice.id, items: [], totalCents: 100,
      shippingCents: 0, status: 'PAID', paymentStatus: 'CAPTURED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const forA = once(clientA, 'message');
    const forStaff = once(staffSocket, 'message');
    publish(order, 'order:updated');
    for (const result of [await forA, await forStaff]) {
      const message = JSON.parse(result[0].toString());
      assert.equal(message.event, 'order:updated');
      assert.equal(message.order.id, order.id);
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(unexpected, []);

    const invalid = new WebSocket(url);
    sockets.push(invalid);
    await once(invalid, 'open');
    const closed = once(invalid, 'close');
    invalid.send(JSON.stringify({ type: 'auth', token: 'inválido' }));
    assert.equal((await closed)[0], 1008);
  } finally {
    for (const ws of sockets) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});
