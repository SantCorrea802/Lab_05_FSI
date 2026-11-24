import 'dotenv/config';
import http from 'node:http';
import { openStore } from './db.js';
import { createApp } from './app.js';
import { expireUnpaidOrders } from './logic.js';
import { paypalClient } from './paypal.js';

const store = await openStore();
const paypal = paypalClient();
const { app, wss, publish } = createApp(store);
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || req.headers.origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:3000')) {
    socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
const port = Number(process.env.PORT || 4000);
server.listen(port, '0.0.0.0', () => console.log(`API lista en puerto ${port}`));
setInterval(async () => {
  try {
    for (const err of await expireUnpaidOrders(store, paypal, publish))
      console.error('No se pudo revisar un pedido vencido:', err.message);
  } catch (err) { console.error('No se pudieron revisar pedidos vencidos:', err.message); }
}, 60_000).unref();
