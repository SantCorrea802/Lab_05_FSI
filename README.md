# LibroYa — laboratorio de sistemas de información

Aplicación académica de comercio electrónico para vender libros electrónicos y ediciones impresas. Implementa catálogo y stock, carrito, pedidos, pago con PayPal Sandbox, entrega digital, gestión de envíos físicos y tablero de pedidos en tiempo real.

La guía adjunta usa PlatoYa como ejemplo. La sección **13. Entregables del laboratorio** pide expresamente una aplicación de libros electrónicos con catálogo, stock y envíos. Este proyecto desarrolla esa actividad propuesta.

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
# Para Atlas, instale Mongoose una vez: npm.cmd run setup:atlas
# Edite server/.env: JWT_SECRET largo y aleatorio; MONGODB_URI de Atlas; opcionalmente credenciales Sandbox.
npm.cmd run seed -w server
npm.cmd run dev:server
# En otra terminal:
npm.cmd run dev:web
```

Abra <http://localhost:3000>. El backend responde en <http://localhost:4000/health>. Las variables `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` son necesarias para completar pagos. Sin ellas, el pedido queda pendiente y se puede cancelar; la aplicación nunca simula una captura exitosa.

Para configurar PayPal Sandbox, cree o seleccione una aplicación **Sandbox** en PayPal Developer y ejecute `powershell -ExecutionPolicy Bypass -File .\scripts\configurar-paypal-completo.ps1` desde la raíz. El script solicita copiar primero el Client ID y luego el Secret con los iconos de PayPal; para cada valor, presione Enter en la terminal **sin pegarlo**. El script lee y borra el portapapeles, verifica la longitud, guarda las credenciales en `server/.env`, valida OAuth y solo entonces las envía a Railway por stdin e inicia un nuevo despliegue. Reinicie la API local si también la usa. Para configurar solo el entorno local, use `scripts/configurar-paypal.ps1`. Use una cuenta **Personal Sandbox** para aprobar compras de prueba, nunca su cuenta PayPal real.

Para comprobar las credenciales sin mostrarlas, ejecute `node scripts/verificar-paypal-sandbox.mjs` desde un equipo con acceso a Internet. La prueba solo solicita un token OAuth; no crea ni cobra un pedido.

Si se configura `MONGODB_URI`, el backend usa Atlas y crea los índices de `users`, `books`, `orders` y `payments`; después, `seed` inserta cinco libros de demostración. Sin esa variable usa SQLite local. Antes de usar Atlas hay que ejecutar `npm.cmd run setup:atlas` en una terminal con acceso a npm. Para guardar la cadena de forma privada, ejecute `powershell -ExecutionPolicy Bypass -File .\scripts\configurar-atlas.ps1`, pegue la cadena de Atlas en el primer aviso oculto y escriba la contraseña de `libroya_app` en el segundo aviso oculto. El script usa los nodos de la cadena y actualiza `server/.env` con el usuario correcto. La carga inicial, pedidos, cancelación, captura PayPal Sandbox y descarga digital se verificaron con Atlas.

El archivo `server/.env` local de este proyecto ya fue generado con una clave aleatoria y una cuenta de personal de demostración. Está excluido de Git. El correo de prueba es `staff@libroya.test`; la contraseña se encuentra solo en `server/.env` bajo `STAFF_PASSWORD` y puede cambiarse regenerando la base local.

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
- Persistencia seleccionable: MongoDB Atlas con Mongoose cuando existe `MONGODB_URI`, o SQLite local mediante `node:sqlite`. Ambas rutas usan transacciones para stock y pedidos. La ruta Atlas se verificó con conexión, carga de datos, cancelación, captura PayPal Sandbox y entrega digital. Consulte [despliegue](docs/DESPLIEGUE.md).
- El precio se guarda en centavos USD y se recalcula desde el catálogo. El navegador no determina precio, pago ni estado.
- Los datos de libros y usuarios de ejemplo son ficticios. Los tres archivos digitales de muestra son texto original del laboratorio. Las cinco portadas del catálogo de muestra se generaron con IA y se guardaron como WebP locales; consulte [prompts y procedencia](docs/PORTADAS_IA.md).
- No hay correos transaccionales: la entrega digital se realiza desde el historial autenticado.
- La aplicación PayPal Sandbox está creada. PayPal devolvió un token OAuth y capturó una compra con saldo ficticio. LibroYa canceló después ese pedido al fallar el procesamiento de la respuesta de PayPal; la recuperación pasó 10/10 pruebas, se desplegó y confirmó el pedido como entregado desde la web. El archivo digital se descargó y abrió. No se han hecho pagos reales.

El [informe PDF](INFORME.pdf) forma parte del repositorio; su fuente editable y las capturas originales permanecen solo en la carpeta local. El flujo digital, el envío físico y la disminución de stock están comprobados.

Documentos: [PRD](PRD.md), [arquitectura y API](docs/ARQUITECTURA.md), [despliegue](docs/DESPLIEGUE.md), [pruebas](docs/RESULTADOS_PRUEBAS.md), [guía de capturas](docs/GUIA_CAPTURAS.md), [prompts](docs/PROMPTS.md), [portadas IA](docs/PORTADAS_IA.md) y [reflexión](docs/REFLEXION.md).

El [plan TestSprite](docs/PLAN_TESTSPRITE.md) documenta las pruebas locales por túnel y la ejecución contra el dominio público mediante `--target-url`. T01, T04 y T05 aprobaron en ambos destinos (3/3 en cada uno). La compra Sandbox, su reconciliación y la descarga digital ya se comprobaron. Falta verificar el flujo impreso y el tablero en la web pública. WebSocket ya tiene una prueba automática local.
