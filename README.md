# LibroYa — laboratorio de sistemas de información

Aplicación académica de comercio electrónico para vender libros electrónicos y ediciones impresas. Implementa catálogo y stock, carrito, pedidos, pago con PayPal Sandbox, entrega digital, gestión de envíos físicos y tablero de pedidos en tiempo real.

La guía del laboratorio usa PlatoYa como ejemplo. La sección **13. Entregables del laboratorio** pide expresamente una aplicación de libros electrónicos con catálogo, stock y envíos. Este proyecto desarrolla esa actividad propuesta.

**Despliegue de demostración:** [tienda LibroYa](https://libroya-web-production.up.railway.app) y [API pública](https://libroya-api-production.up.railway.app/health). Catálogo, búsqueda y carrito pasaron tres pruebas de TestSprite tanto localmente como en la tienda desplegada. PayPal Sandbox capturó una compra digital que LibroYa reconcilió, entregó y permitió descargar; un pedido impreso con envío incluido se pagó, avanzó a `Entregado` y mostró su guía en el historial del cliente.

## Actores y alcance

- **Visitante:** consulta y filtra libros.
- **Cliente:** se registra, compra, consulta pedidos y descarga libros digitales pagados.
- **Personal:** administra catálogo y stock, y avanza pedidos y envíos. La cuenta de personal se crea únicamente mediante `server/.env` y el comando `seed`.

Los libros digitales se entregan mediante descarga autenticada después de la captura confirmada por el servidor. Los libros impresos requieren dirección, suman USD 5,00 de envío y admiten guía de seguimiento. Se pueden combinar ambos formatos en un pedido.

## Ejecutar localmente

Requiere Node.js 24 o superior y npm. En PowerShell use `npm.cmd` si `npm.ps1` está bloqueado.

```powershell
npm.cmd install
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (-not (Test-Path web/.env.local)) { Copy-Item web/.env.example web/.env.local }
# Edite server/.env: JWT_SECRET, MONGODB_URI y, si va a probar pagos, credenciales Sandbox.
npm.cmd run seed -w server
npm.cmd run dev:server
# En otra terminal:
npm.cmd run dev:web
```

Abra <http://localhost:3000>. El backend responde en <http://localhost:4000/health>. Las variables `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` son necesarias para completar pagos. Sin ellas, el pedido queda pendiente y se puede cancelar; la aplicación nunca simula una captura exitosa.

Para usar Atlas, configure `MONGODB_URI` en `server/.env`; Mongoose ya se instala con las dependencias del proyecto. Sin esa variable, el backend usa SQLite local. Configure también `JWT_SECRET` con un valor aleatorio de al menos 32 caracteres. Para probar pagos, cree una aplicación en **PayPal Sandbox** y establezca `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` solo en el backend. Use una cuenta compradora Sandbox; no emplee una cuenta PayPal real. Si se requieren funciones de personal, configure `STAFF_EMAIL` y `STAFF_PASSWORD` antes de ejecutar la carga inicial. Los archivos `.env` no se publican.

## Comandos

```powershell
npm.cmd run test             # pruebas de lógica y API
npm.cmd run build            # compilación de Next.js
npm.cmd run seed -w server   # crea catálogo y cuenta de personal si se configuró
npm.cmd run start -w server  # backend de producción
npm.cmd run start -w web     # frontend compilado
```

## Decisiones y límites

- Monorepo con Next.js y Express; WebSocket autenticado con `ws` en el mismo servidor Express.
- Persistencia seleccionable: MongoDB Atlas con Mongoose cuando existe `MONGODB_URI`, o SQLite local mediante `node:sqlite`. Ambas rutas usan transacciones para stock y pedidos. La ruta Atlas se verificó con conexión, carga de datos, cancelación, captura PayPal Sandbox y entrega digital.
- El precio se guarda en centavos USD y se recalcula desde el catálogo. El navegador no determina precio, pago ni estado.
- Los datos de libros y usuarios de ejemplo son ficticios. Los tres archivos digitales de muestra son texto original del laboratorio. Las cinco portadas del catálogo de muestra se generaron con IA y se guardaron como WebP locales.
- No hay correos transaccionales: la entrega digital se realiza desde el historial autenticado.
- La aplicación PayPal Sandbox está creada. PayPal devolvió un token OAuth y capturó una compra con saldo ficticio. LibroYa canceló después ese pedido al fallar el procesamiento de la respuesta de PayPal; la recuperación se probó, se desplegó y confirmó el pedido como entregado desde la web. El archivo digital se descargó y abrió. La suite actual del servidor aprobó 11/11 pruebas. No se han hecho pagos reales.

El [informe PDF](INFORME.pdf) forma parte del repositorio; su fuente editable y las capturas originales permanecen solo en la carpeta local. El flujo digital, el envío físico y la disminución de stock están comprobados.

Documentos: [requisitos y criterios de aceptación](PRD.md), [arquitectura, datos y API](docs/ARQUITECTURA.md), [reflexión individual](docs/REFLEXION.md) e [informe PDF](INFORME.pdf).

La suite de TestSprite contiene los doce casos mínimos adaptados de la guía y todos se ejecutaron al menos una vez. Once aprobaron en la web pública; T10 quedó bloqueado porque la ejecución no ofreció dos sesiones de navegador. Los controles del servidor y el cambio de estado en tiempo real se comprobaron por separado. Los resultados, defectos corregidos y límites están documentados en el [informe PDF](INFORME.pdf).
