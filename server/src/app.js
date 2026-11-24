import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { hashPassword, verifyPassword, signToken, verifyToken, publicUser } from './security.js';
import { AppError, requireText, makeOrder, cancelOrder, publicOrder, paypalOrderCaptured } from './logic.js';
import { paypalClient, verifyCapture } from './paypal.js';
import { fileURLToPath } from 'node:url';

const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function createApp(store, env = process.env, services = {}) {
  const app = express();
  const origin = env.CLIENT_ORIGIN || 'http://localhost:3000';
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('Configura JWT_SECRET con al menos 32 caracteres');
  const paypal = services.paypal || paypalClient(env);
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map();
  const loginHits = new Map();
  app.disable('x-powered-by');
  app.use(cors({ origin, methods: ['GET','POST','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'] }));
  app.use(express.json({ limit: '100kb' }));
  const tokenUser = async (token) => {
    const payload = verifyToken(token, secret);
    const user = payload && await store.getUser(payload.sub);
    return user && user.role === payload.role ? user : null;
  };
  const auth = (req, _res, next) => {
    tokenUser(req.headers.authorization?.replace(/^Bearer\s+/i, ''))
      .then(user => { if (!user) throw new AppError(401, 'Inicia sesión'); req.user = user; next(); })
      .catch(next);
  };
  const staff = (req, _res, next) => req.user.role === 'staff' ? next() : next(new AppError(403, 'Acceso denegado'));
  const owned = async (req) => {
    const order = await store.getOrder(req.params.id);
    if (!order) throw new AppError(404, 'Pedido no encontrado');
    if (order.userId !== req.user.id && req.user.role !== 'staff') throw new AppError(403, 'Acceso denegado');
    return order;
  };
  const canVerifyCanceledPayment = async (order) => {
    if (order.status !== 'CANCELLED') return false;
    const payment = await store.getPaymentByOrder(order.id);
    if (!payment?.providerOrderId) return false;
    try { return paypalOrderCaptured(await paypal.getOrder(payment.providerOrderId)); }
    catch { return false; }
  };
  const publish = (order, event) => {
    const summary = publicOrder(order);
    for (const [ws, user] of clients) {
      if (ws.readyState === 1 && (user.id === order.userId || user.role === 'staff'))
        ws.send(JSON.stringify({ event, order: summary }));
    }
  };
  wss.on('connection', (ws) => {
    let timeout = setTimeout(() => ws.close(1008, 'Autenticación requerida'), 10000);
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (clients.has(ws)) return;
        const user = msg.type === 'auth' && await tokenUser(msg.token);
        if (!user) return ws.close(1008, 'No autorizado');
        clearTimeout(timeout); timeout = null;
        clients.set(ws, user);
        ws.send(JSON.stringify({ event: 'connected' }));
      } catch { ws.close(1008, 'Mensaje inválido'); }
    });
    ws.on('close', () => { if (timeout) clearTimeout(timeout); clients.delete(ws); });
  });
  app.get('/health', route(async (_req, res) => {
    if (!await store.health()) throw new AppError(503, 'Base de datos no disponible');
    res.json({ status: 'ok' });
  }));
  app.post('/api/auth/register', route(async (req, res) => {
    const name = requireText(req.body.name, 'Nombre', 2, 100);
    const email = requireText(req.body.email, 'Correo', 5, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Correo inválido');
    const password = requireText(req.body.password, 'Contraseña', 10, 128);
    if (await store.findUserByEmail(email)) throw new AppError(409, 'No se pudo crear la cuenta');
    const user = await store.saveUser({ id: store.newId(), name, email, passwordHash: hashPassword(password), role: 'customer', createdAt: new Date().toISOString() });
    res.status(201).json({ user: publicUser(user), token: signToken(user, secret) });
  }));
  app.post('/api/auth/login', route(async (req, res) => {
    const key = `${req.ip}:${String(req.body.email || '').toLowerCase()}`;
    const hit = loginHits.get(key) || { count: 0, at: Date.now() };
    if (Date.now() - hit.at > 15*60*1000) { hit.count = 0; hit.at = Date.now(); }
    if (++hit.count > 10) throw new AppError(429, 'Demasiados intentos. Espera unos minutos');
    loginHits.set(key, hit);
    const user = await store.findUserByEmail(String(req.body.email || '').trim().toLowerCase());
    if (!user || !verifyPassword(String(req.body.password || ''), user.passwordHash)) throw new AppError(401, 'Credenciales inválidas');
    hit.count = 0;
    res.json({ user: publicUser(user), token: signToken(user, secret) });
  }));
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.get('/api/books', route(async (req, res) => {
    let books = (await store.listBooks()).map(withoutFile);
    if (req.query.category) books = books.filter(b => b.category === req.query.category);
    if (req.query.q) books = books.filter(b => `${b.title} ${b.author}`.toLowerCase().includes(String(req.query.q).toLowerCase()));
    res.json({ books });
  }));
  app.get('/api/books/:id', route(async (req, res) => {
    const book = await store.getBook(req.params.id);
    if (!book) throw new AppError(404, 'Libro no encontrado');
    res.json({ book: withoutFile(book) });
  }));
  app.post('/api/books', auth, staff, route(async (req, res) => {
    const book = validateBook({ ...req.body, downloadFile: null }, store.newId());
    await store.saveBook(book); res.status(201).json({ book: withoutFile(book) });
  }));
  app.patch('/api/books/:id', auth, staff, route(async (req, res) => {
    const old = await store.getBook(req.params.id);
    if (!old) throw new AppError(404, 'Libro no encontrado');
    const book = validateBook({ ...old, ...req.body, downloadFile: old.downloadFile }, old.id);
    await store.saveBook(book); res.json({ book: withoutFile(book) });
  }));
  app.post('/api/orders', auth, route(async (req, res) => {
    if (req.user.role !== 'customer') throw new AppError(403, 'Acceso denegado');
    const key = req.headers['idempotency-key'];
    if (key && (typeof key !== 'string' || key.length > 100)) throw new AppError(400, 'Clave de idempotencia inválida');
    const order = await makeOrder(store, req.user.id, req.body, key);
    res.status(201).json({ order: publicOrder(order, true) });
  }));
  app.get('/api/orders/me', auth, route(async (req, res) => {
    const ownedOrders = (await store.listOrders()).filter(o => o.userId === req.user.id);
    const orders = await Promise.all(ownedOrders.map(async order => ({
      ...publicOrder(order, true),
      canVerifyPayment: await canVerifyCanceledPayment(order)
    })));
    res.json({ orders });
  }));
  app.get('/api/orders/:id', auth, route(async (req, res) => res.json({ order: publicOrder(await owned(req), true) })));
  app.post('/api/orders/:id/cancel', auth, route(async (req, res) => {
    const order = await owned(req);
    if (order.userId !== req.user.id) throw new AppError(403, 'Acceso denegado');
    const payment = await store.getPaymentByOrder(order.id);
    if (payment?.providerOrderId) {
      const provider = await paypal.getOrder(payment.providerOrderId);
      if (paypalOrderCaptured(provider))
        throw new AppError(409, 'Pago ya capturado en PayPal; usa Verificar pago');
    }
    const result = await cancelOrder(store, order); publish(result, 'order:updated');
    res.json({ order: publicOrder(result, true) });
  }));
  app.get('/api/staff/orders', auth, staff, route(async (_req, res) => res.json({ orders: (await store.listOrders()).filter(o => !['PENDING_PAYMENT','CANCELLED'].includes(o.status)).map(o => publicOrder(o, true)) })));
  app.patch('/api/orders/:id/status', auth, staff, route(async (req, res) => {
    const order = await owned(req);
    if (order.items.every(i => i.format === 'ebook')) throw new AppError(409, 'La entrega digital es automática');
    const next = { PAID: 'PREPARING', PREPARING: 'READY', READY: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status];
    if (req.body.status !== next) throw new AppError(409, 'Transición de estado no permitida');
    if (next === 'SHIPPED' && order.items.some(i => i.format === 'physical'))
      order.trackingCode = requireText(req.body.trackingCode, 'Guía de envío', 4, 100);
    order.status = next; order.updatedAt = new Date().toISOString(); await store.saveOrder(order);
    publish(order, 'order:statusChanged'); res.json({ order: publicOrder(order, true) });
  }));
  app.post('/api/payments/paypal/order', auth, route(async (req, res) => {
    const order = await store.getOrder(req.body.orderId);
    if (!order) throw new AppError(404, 'Pedido no encontrado');
    if (order.userId !== req.user.id) throw new AppError(403, 'Acceso denegado');
    if (order.status !== 'PENDING_PAYMENT') throw new AppError(409, 'Pedido no pendiente');
    const old = await store.getPaymentByOrder(order.id);
    if (old) return res.json({ paypalOrderId: old.providerOrderId, approvalUrl: old.approvalUrl });
    const created = await paypal.createOrder(order);
    const payment = { id: store.newId(), orderId: order.id, provider: 'PAYPAL', providerOrderId: created.id,
      amountCents: order.totalCents, currency: paypal.currency, status: 'CREATED', createdAt: new Date().toISOString(),
      approvalUrl: created.links?.find(l => l.rel === 'payer-action')?.href || created.links?.find(l => l.rel === 'approve')?.href };
    await store.savePayment(payment);
    res.status(201).json({ paypalOrderId: created.id, approvalUrl: payment.approvalUrl });
  }));
  app.post('/api/payments/paypal/capture', auth, route(async (req, res) => {
    const order = await store.getOrder(req.body.orderId);
    if (!order) throw new AppError(404, 'Pedido no encontrado');
    if (order.userId !== req.user.id) throw new AppError(403, 'Acceso denegado');
    const payment = await store.getPaymentByOrder(order.id);
    if (!payment || (req.body.paypalOrderId && payment.providerOrderId !== req.body.paypalOrderId)) throw new AppError(400, 'Orden PayPal inválida');
    if (order.paymentStatus === 'CAPTURED') return res.json({ order: publicOrder(order, true) });
    if (!['PENDING_PAYMENT', 'CANCELLED'].includes(order.status)) throw new AppError(409, 'El pedido no puede verificarse');
    let captured;
    if (order.status === 'CANCELLED') captured = await paypal.getOrder(payment.providerOrderId);
    else {
      try { captured = await paypal.captureOrder(payment.providerOrderId, order.id); }
      catch { captured = await paypal.getOrder(payment.providerOrderId); }
    }
    if (!captured.purchase_units?.[0]?.custom_id || !captured.purchase_units[0].payments?.captures?.[0]?.amount)
      captured = await paypal.getOrder(payment.providerOrderId);
    if (order.status === 'CANCELLED' && captured.status !== 'COMPLETED')
      throw new AppError(409, 'El pedido cancelado no tiene una captura PayPal confirmada');
    const captureId = verifyCapture(captured, order, payment.providerOrderId, paypal.currency);
    const updated = await store.transaction(async () => {
      const current = await store.getOrder(order.id);
      if (current.paymentStatus === 'CAPTURED') return current;
      if (!['PENDING_PAYMENT', 'CANCELLED'].includes(current.status)) throw new AppError(409, 'Estado de pedido inconsistente');
      if (current.status === 'CANCELLED') {
        for (const item of current.items) {
          const book = await store.getBook(item.bookId);
          if (!book || book.stock < item.quantity) throw new AppError(409, 'No hay stock para reconciliar la compra capturada');
          await store.saveBook({ ...book, stock: book.stock - item.quantity, updatedAt: new Date().toISOString() });
        }
      }
      current.status = current.items.every(i => i.format === 'ebook') ? 'DELIVERED' : 'PAID';
      current.paymentStatus = 'CAPTURED'; current.updatedAt = new Date().toISOString();
      await store.saveOrder(current);
      await store.savePayment({ ...payment, captureId, status: 'CAPTURED', updatedAt: current.updatedAt });
      return current;
    });
    publish(updated, 'order:created'); res.json({ order: publicOrder(updated, true) });
  }));
  app.get('/api/orders/:id/download/:bookId', auth, route(async (req, res) => {
    const order = await owned(req);
    if (order.userId !== req.user.id || order.paymentStatus !== 'CAPTURED' ||
        !order.items.some(i => i.bookId === req.params.bookId && i.format === 'ebook')) throw new AppError(403, 'Descarga no disponible');
    const book = await store.getBook(req.params.bookId);
    if (book?.digitalContent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="libro-${book.id}.txt"`);
      return res.send(book.digitalContent);
    }
    if (!book?.downloadFile || !/^[a-z0-9_-]+\.txt$/.test(book.downloadFile)) throw new AppError(404, 'Archivo no disponible');
    res.download(fileURLToPath(new URL(`../assets/${book.downloadFile}`, import.meta.url)), `libro-${book.id}.txt`);
  }));
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('Error de servidor:', err.message);
    res.status(status).json({ error: status >= 500 ? 'Error del servidor' : err.message });
  });
  return { app, wss, publish, tokenUser };
}

function withoutFile({ downloadFile, digitalContent, ...book }) { return book; }
function validateBook(value, id) {
  const title = requireText(value.title, 'Título', 2, 150);
  const author = requireText(value.author, 'Autor', 2, 100);
  const description = requireText(value.description, 'Descripción', 10, 1000);
  const category = requireText(value.category, 'Categoría', 2, 80);
  const format = value.format === 'physical' ? 'physical' : value.format === 'ebook' ? 'ebook' : null;
  if (!format || !Number.isInteger(value.priceCents) || value.priceCents < 1 ||
      !Number.isInteger(value.stock) || value.stock < 0) throw new AppError(400, 'Precio, formato o stock inválido');
  const digitalContent = format === 'ebook' ? (typeof value.digitalContent === 'string' ? value.digitalContent.trim() : '') : '';
  if (format === 'ebook' && !digitalContent && !value.downloadFile) throw new AppError(400, 'Añade el contenido del libro digital');
  if (digitalContent.length > 90000) throw new AppError(400, 'Contenido digital demasiado largo');
  return { id, title, author, description, category, format, priceCents: value.priceCents,
    stock: value.stock, available: Boolean(value.available), coverColor: /^#[0-9a-fA-F]{6}$/.test(value.coverColor) ? value.coverColor : '#324d73',
    downloadFile: format === 'ebook' ? (value.downloadFile || null) : null, digitalContent,
    updatedAt: new Date().toISOString() };
}
