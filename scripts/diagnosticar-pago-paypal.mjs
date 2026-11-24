import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { openMongoDatabase } from '../server/src/mongo.js';
import { paypalClient } from '../server/src/paypal.js';
import { money } from '../server/src/logic.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(root, 'server', '.env'), quiet: true });

if (!process.env.MONGODB_URI || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.error('Faltan variables privadas de Atlas o PayPal en server/.env.');
  process.exitCode = 1;
} else {
  let store;
  try {
    store = await openMongoDatabase(process.env.MONGODB_URI);
    const orders = (await store.listOrders()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    const paypal = paypalClient(process.env);
    console.log(`Pedidos examinados: ${orders.length}. Los identificadores se muestran solo con 8 caracteres.`);
    let discrepancies = 0;
    for (const order of orders) {
      const payment = await store.getPaymentByOrder(order.id);
      if (!payment?.providerOrderId) {
        console.log(`${order.id.slice(0, 8)}: LibroYa=${order.status}, sin orden PayPal.`);
        continue;
      }
      try {
        const provider = await paypal.getOrder(payment.providerOrderId);
        const unit = provider.purchase_units?.[0];
        const capture = unit?.payments?.captures?.[0];
        const matches = unit?.custom_id === order.id && capture?.amount?.value === money(order.totalCents) &&
          capture?.amount?.currency_code === (process.env.PAYPAL_CURRENCY || 'USD');
        console.log(`${order.id.slice(0, 8)}: LibroYa=${order.status}/${order.paymentStatus}, PayPal=${provider.status || 'desconocido'}/${capture?.status || 'sin captura'}, datos coinciden=${matches}.`);
        if (provider.status === 'COMPLETED' && capture?.status === 'COMPLETED' && order.paymentStatus !== 'CAPTURED') {
          discrepancies++;
          console.log(`  ALERTA: ${order.status === 'CANCELLED' ? 'pedido cancelado localmente' : 'pedido no reconciliado'} tras captura de prueba; no crear otra compra.`);
        }
      } catch {
        console.log(`${order.id.slice(0, 8)}: no se pudo consultar la orden PayPal; no se cambiaron datos.`);
      }
    }
    console.log(`Capturas PayPal sin registrar en LibroYa: ${discrepancies}.`);
  } catch {
    console.error('No se pudo consultar el estado del pedido. Revisa la conexion a Atlas y PayPal.');
    process.exitCode = 1;
  } finally {
    if (store) await store.close().catch(() => {});
  }
}
