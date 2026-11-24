import { AppError, money } from './logic.js';

export function paypalClient(env = process.env) {
  const base = env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
  if (!/^https:\/\//.test(base)) throw new Error('PAYPAL_API_BASE debe usar HTTPS');
  const configured = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  async function accessToken() {
    if (!configured) throw new AppError(503, 'PayPal Sandbox no está configurado');
    const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: {
      Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded'
    }, body: 'grant_type=client_credentials' });
    if (!response.ok) throw new AppError(502, 'No se pudo conectar con PayPal');
    return (await response.json()).access_token;
  }
  async function request(path, method = 'GET', body, requestId, preferRepresentation = false) {
    const token = await accessToken();
    const response = await fetch(`${base}${path}`, { method, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      ...(preferRepresentation ? { Prefer: 'return=representation' } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new AppError(502, 'PayPal no pudo completar la operación');
    return data;
  }
  return {
    configured,
    currency: env.PAYPAL_CURRENCY || 'USD',
    createOrder: (order) => request('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      payment_source: { paypal: { experience_context: {
        return_url: `${env.CLIENT_ORIGIN || 'http://localhost:3000'}/?checkout=return`,
        cancel_url: `${env.CLIENT_ORIGIN || 'http://localhost:3000'}/?checkout=cancel`,
        ...(order.items.every(item => item.format === 'ebook') ? { shipping_preference: 'NO_SHIPPING' } : {})
      } } },
      purchase_units: [{ custom_id: order.id, amount: { currency_code: env.PAYPAL_CURRENCY || 'USD', value: money(order.totalCents) } }]
    }, `create-${order.id}`),
    captureOrder: (providerOrderId, orderId) => request(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, 'POST', {}, `capture-${orderId}`, true),
    getOrder: (providerOrderId) => request(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`)
  };
}

export function verifyCapture(data, order, providerOrderId, currency) {
  if (data.id !== providerOrderId || data.status !== 'COMPLETED' || data.purchase_units?.length !== 1)
    throw new AppError(502, 'La captura de PayPal no coincide con el pedido');
  const unit = data.purchase_units[0];
  const capture = unit.payments?.captures?.[0];
  if (unit.custom_id !== order.id || !capture || capture.status !== 'COMPLETED' ||
      capture.amount?.currency_code !== currency || capture.amount?.value !== money(order.totalCents))
    throw new AppError(502, 'La captura de PayPal no coincide con el importe');
  return capture.id;
}
