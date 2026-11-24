export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const cents = (v) => Math.round(Number(v) * 100);
export const money = (v) => (v / 100).toFixed(2);
export function requireText(value, label, min = 1, max = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) throw new AppError(400, `${label} inválido`);
  return text;
}
export async function makeOrder(store, userId, payload, key) {
  try { return await store.transaction(async () => {
    const old = await store.findOrderByKey(userId, key);
    if (old) return old;
    if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 30) throw new AppError(400, 'Carrito inválido');
    const quantities = new Map();
    for (const item of payload.items) {
      if (typeof item.bookId !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
        throw new AppError(400, 'Cantidad inválida');
      quantities.set(item.bookId, (quantities.get(item.bookId) || 0) + item.quantity);
    }
    const items = [];
    let totalCents = 0;
    for (const [bookId, quantity] of quantities) {
      const book = await store.getBook(bookId);
      if (!book || !book.available || quantity > book.stock) throw new AppError(409, 'Libro no disponible o sin stock');
      if (quantity > 20) throw new AppError(400, 'Cantidad inválida');
      items.push({ bookId, title: book.title, format: book.format, quantity, unitCents: book.priceCents });
      totalCents += book.priceCents * quantity;
      await store.saveBook({ ...book, stock: book.stock - quantity, updatedAt: new Date().toISOString() });
    }
    const needsShipping = items.some(i => i.format === 'physical');
    const address = needsShipping ? requireText(payload.address, 'Dirección', 10, 300) : '';
    const shippingCents = needsShipping ? 500 : 0;
    const now = new Date().toISOString();
    const order = {
      id: store.newId(), userId, items, address, shippingCents, totalCents: totalCents + shippingCents,
      status: 'PENDING_PAYMENT', paymentStatus: 'CREATED', idempotencyKey: key || null,
      createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 30*60*1000).toISOString()
    };
    await store.saveOrder(order);
    return order;
  }); } catch (err) {
    if (key && err.code === 11000) {
      const existing = await store.findOrderByKey(userId, key);
      if (existing) return existing;
    }
    throw err;
  }
}
export async function cancelOrder(store, order) {
  return store.transaction(async () => {
    const current = await store.getOrder(order.id);
    if (current.status !== 'PENDING_PAYMENT') throw new AppError(409, 'El pedido ya no puede cancelarse');
    for (const item of current.items) {
      const book = await store.getBook(item.bookId);
      if (book) await store.saveBook({ ...book, stock: book.stock + item.quantity });
    }
    const result = { ...current, status: 'CANCELLED', paymentStatus: 'CANCELLED', updatedAt: new Date().toISOString() };
    await store.saveOrder(result);
    return result;
  });
}
export async function expireUnpaidOrders(store, paypal, publish, now = Date.now()) {
  const errors = [];
  for (const order of await store.listOrders()) {
    if (order.status !== 'PENDING_PAYMENT' || Date.parse(order.expiresAt) >= now) continue;
    try {
      const payment = await store.getPaymentByOrder(order.id);
      if (payment?.providerOrderId) {
        const provider = await paypal.getOrder(payment.providerOrderId);
        if (provider.status === 'COMPLETED' || provider.purchase_units?.some(unit => unit.payments?.captures?.some(capture => capture.status === 'COMPLETED')))
          continue;
      }
      publish(await cancelOrder(store, order), 'order:updated');
    } catch (err) { errors.push(err); }
  }
  return errors;
}
export function publicOrder(order, includeAddress = false) {
  const { id, userId, items, totalCents, shippingCents, status, paymentStatus, createdAt, updatedAt, trackingCode, address } = order;
  return { id, userId, items, totalCents, shippingCents, status, paymentStatus, createdAt, updatedAt,
    ...(trackingCode ? { trackingCode } : {}), ...(includeAddress ? { address } : {}) };
}
