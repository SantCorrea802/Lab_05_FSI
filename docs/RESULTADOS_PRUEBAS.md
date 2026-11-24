# Informe de resultados

Actualizado: 23 de noviembre de 2026. Entorno local Windows, Node.js 24.18.0, npm 11.16.0.

## Evidencia ejecutada

| Comando o prueba | Resultado | Evidencia |
|---|---|---|
| `npm.cmd run test -w server` | 10/10 pruebas aprobadas tras añadir regresión de PayPal y protección del vencimiento | [Salida WebSocket previa](evidencia-websocket.txt); [resumen actual](#defectos-corregidos-durante-el-desarrollo) |
| `npm.cmd run build -w web` | Compilación aprobada con Next.js 16.4.6 | [Salida local](evidencia-local.txt) |
| `GET /health` | HTTP 200, `{"status":"ok"}` | Verificación local por PowerShell |
| `GET /api/books` | HTTP 200, 5 libros de muestra | Verificación local por PowerShell |
| `GET /api/orders/me` sin token | HTTP 401 | Verificación local por PowerShell |
| `GET /` en frontend | HTTP 200, título LibroYa | Verificación local por PowerShell |
| `npm.cmd run seed -w server` con Atlas | Terminó con «Catálogo de demostración preparado» desde la terminal del estudiante | Salida compartida en la conversación |
| Colección `libroya.books` en Atlas | 5 documentos, 2 índices | `evidencias/e12.png`; recortar nombre personal de la organización antes del informe |
| Catálogo local conectado a Atlas | Interfaz LibroYa muestra las cinco tarjetas con precios y stock | `evidencias/e13.png`; la quinta aparece parcialmente por el tamaño de la captura |
| `GET /api/books` con API conectada a Atlas | 5 libros devueltos por HTTP desde `localhost:4000` | Verificación local en PowerShell durante esta sesión |
| Portadas IA | 5 archivos WebP locales; la compilación de la web con las nuevas imágenes se completó | [Prompts y archivos](PORTADAS_IA.md); `evidencias/e14.png` |
| Catálogo con portadas IA | Cinco portadas visibles en la web | `evidencias/e14.png` |
| Pedido de prueba contra Atlas | Registro ficticio, pedido mixto, segunda solicitud con la misma clave, reserva y cancelación: stock restablecido | Prueba HTTP local contra API conectada a Atlas; `evidencias/e15.png` muestra el pedido `CANCELLED` |
| Variante web para TestSprite local | Compilación Next.js 16.4.6 aprobada; `GET /` devolvió 200 y `GET /backend/api/books` devolvió 5 libros desde el puerto 3100 | Comprobación local en PowerShell previa a TestSprite |
| TestSprite T01 (`CATALOG-001`) | 1/1 aprobado por túnel local en `http://localhost:3100`; 0 fallos y 0 tiempos agotados | Ejecución `55b806d0-7f0b-49b2-b94b-369339a689b1` compartida desde la CLI del estudiante; `evidencias/e20.png` recortada resume las 3 pruebas |
| TestSprite T04 (`SEARCH-001`) y T05 (`CART-001`) | 2/2 aprobados por túnel local en `http://localhost:3100`; 0 fallos y 0 tiempos agotados | Ejecución `a7fb0c97-2e39-4a27-b149-e584d3afc2f8` compartida desde la CLI del estudiante; `evidencias/e20.png` recortada resume las 3 pruebas |
| TestSprite T01, T04 y T05 en Railway | 3/3 aprobados contra `https://libroya-web-production.up.railway.app`; 0 fallos y 0 tiempos agotados | Ejecución `a8f5f91b-acf0-4315-a477-fe09e7dc78a8`; `evidencias/e38.png` requiere recortar la ruta personal antes del informe |
| PayPal Sandbox, aplicación y variables | `LibroYa-Sandbox` creada como Merchant; tras corregir el ingreso de credenciales, PayPal devolvió un token OAuth y se enviaron cuatro variables a Railway, con nuevo despliegue iniciado | [Registro sin secretos](evidencia-paypal-configuracion.txt); `evidencias/e41.png`; `evidencias/e42.png` requiere ocultar Client ID |
| Checkout PayPal Sandbox | La tienda creó una orden digital de US$14,99 y abrió el checkout con saldo de prueba; el estudiante confirmó el dominio `www.sandbox.paypal.com`. La captura quedó completada y luego reconciliada en LibroYa | `evidencias/e46.png`, `evidencias/e49.png`, `evidencias/e50.png` |
| Retorno de PayPal a LibroYa | La interfaz mostró «No se confirmó el pago: Error del servidor». La consulta de solo lectura confirmó PayPal `COMPLETED` y captura `COMPLETED`, con ID, importe y moneda coincidentes, mientras LibroYa seguía pendiente | `evidencias/e47.png`; [diagnóstico sin identificadores](evidencia-paypal-captura-diagnostico.txt) |
| Historial y reconciliación tras el segundo despliegue | `e48.png` muestra ambos pedidos cancelados con «Verificar pago». Tras pulsarlo solo en `84b862fd`, `e49.png` muestra «Pago confirmado», estado `Entregado`, botón «Descargar» y bolsa vacía; `c1a132e5` permanece cancelado | `evidencias/e48.png`, `evidencias/e49.png`; [diagnóstico ampliado](evidencia-paypal-captura-diagnostico.txt) |

Las pruebas automáticas cubren hash y verificación de contraseña; firma de token; total calculado por backend; reserva y devolución de stock; idempotencia; creación de orden PayPal con URL de retorno; captura simulada confirmada una sola vez; captura rechazada si cambia ID, moneda o importe; registro con rol forzado a cliente; 401/403 en rutas protegidas; propiedad del pedido; descarga digital; validación de dirección y guía de envío; rechazo de salto de estado; autenticación WebSocket, rechazo de token inválido y distribución de eventos al cliente dueño y al personal.

## Defectos corregidos durante el desarrollo

| Defecto | Corrección |
|---|---|
| Descarga con ruta de archivo no portable en Windows | Uso de `fileURLToPath` y nombre de archivo controlado. |
| Campo interno de contenido digital visible potencialmente en catálogo | Exclusión de `digitalContent` y `downloadFile` de respuestas públicas. |
| Segundo intento de abrir orden PayPal no devolvía URL de aprobación | Se conserva `approvalUrl` en el registro de pago. |
| Captura real de PayPal devolvía respuesta abreviada y el pedido quedó cancelado | La API solicitaba por defecto `return=minimal` y esperaba `purchase_units`; se añadió `Prefer: return=representation` y consulta de detalle. La segunda corrección reconcilia pedidos cancelados solo tras verificar captura, re-reserva stock y evita que el vencimiento cancele capturas confirmadas. Pasó 10/10 pruebas y se desplegó; `e49.png` y `e50.png` confirman la recuperación y descarga. |
| Cuenta pública podía solicitar rol elevado | El backend asigna siempre `customer`; prueba de integración incluida. |
| Mongoose avisaba que la opción `new` de `findOneAndUpdate()` está obsoleta | Se cambió por `returnDocument: 'after'`; las siete pruebas locales siguen pasando. |
| Next.js 16.4.3 mostró aviso de seguridad en el entorno de desarrollo | Se actualizó a 16.4.6 desde la terminal del estudiante; compilación posterior aprobada. |

## Verificación de servicios externos y pendientes

| Elemento | Motivo | Próximo paso |
|---|---|---|
| PayPal Sandbox aprobado/cancelado | PayPal capturó el saldo ficticio del pedido `84b862fd`; la segunda corrección lo reconcilió en LibroYa. Estado `Entregado`; `e50.png` muestra el archivo descargado y abierto. Otro pedido sin captura sigue `Cancelado`. El pedido impreso `0b3d860e` se pagó por US$29,99, pasó por `Enviado` con guía (`e55.png`), quedó `Entregado` (`e56.png`) y redujo el stock impreso de 12 a 11 (`e57.png`) | Compras digital e impresa aprobadas; flujo físico, guía y stock comprobados. |
| MongoDB Atlas | La IP actual se autorizó, `seed` terminó correctamente, Data Explorer muestra cinco libros y la API local pasó registro, pedido, idempotencia, reserva y cancelación. La API desplegada reconcilió una captura PayPal Sandbox y habilitó la descarga digital. | `evidencias/e15.png`, `evidencias/e49.png` y `evidencias/e50.png`. |
| Railway backend | `railway up` subió el código y pasó 7/7 pruebas; el primer arranque falló por acceso de red de Atlas. Tras autorizar temporalmente `0.0.0.0/0`, `railway redeploy` dejó `libroya-api` online, `seed` terminó, la API escuchó en 8080 y el healthcheck pasó. El dominio HTTPS público respondió `{"status":"ok"}` en `/health` y cinco libros en `/api/books` | `evidencias/e35.png` y `evidencias/e36.png` muestran las respuestas; el registro fallido `evidencias/mira.txt` es solo de apoyo. |
| Railway frontend | `NEXT_PUBLIC_API_URL` se configuró con el dominio HTTPS de la API antes de `railway up`; Next.js 16.4.6 compiló, arrancó en 8080 y pasó el healthcheck `/`. El dominio web se creó, se configuró `CLIENT_ORIGIN` y `e37.png` muestra los cinco libros con portadas | T01, T04 y T05 pasaron en la URL pública; registro, historial, tablero y flujo de envío se usaron en la tienda pública. La reconexión WebSocket no se observó manualmente. |
| TestSprite | Cuenta, API key, proyecto `LibroYa` y entorno `local` creados; CLI 0.17.0 instalada y autenticada por el estudiante con `run:tunnel`. T01, T04 y T05 pasaron localmente (3/3) y en Railway (3/3). El plan Free rechazó guardar un segundo entorno; `--target-url` creó uno temporal para la ejecución pública. | Ampliar cobertura con un caso de pago tras verificar PayPal Sandbox. WebSocket ya cuenta con prueba automática local. |
| Video Zoom | La URL proporcionada no fue accesible desde la herramienta web | Se siguió el texto y las figuras extraíbles del PDF. |
| Carpeta `.git` accidental | El entorno rechazó escribir y también borrar la carpeta `.git` creada antes de la aclaración del estudiante | El estudiante la retirará desde su terminal; los archivos del proyecto no dependen de ella. |

**Tasa de éxito automática local con SQLite:** 100 % (10 de 10), incluidas la respuesta abreviada, la recuperación de un pedido cancelado capturado y la protección del vencimiento. **Railway:** API y web Online tras el despliegue de la segunda corrección; build API con 10/10 pruebas y build web aprobados. **TestSprite local:** 100 % (3 de 3 casos). **TestSprite público en Railway:** 100 % (3 de 3 casos). **PayPal Sandbox:** captura digital, reconciliación, descarga del archivo de muestra y pedido impreso pagado y entregado con guía visible al cliente y disminución de stock comprobados.
