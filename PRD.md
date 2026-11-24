# PRD — LibroYa

## Objetivo

Permitir que una persona encuentre y compre libros digitales o impresos, mientras el personal administra el catálogo, el stock y el avance de los envíos. Todos los pagos de laboratorio utilizan PayPal Sandbox.

## Requisitos funcionales

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| F01 | Registro y login | El servidor asigna `customer`; contraseña almacenada con scrypt y salt; errores genéricos. |
| F02 | Catálogo público | Lista libros, categoría, formato, precio y disponibilidad; búsqueda por título/autor. |
| F03 | Gestión de catálogo | Solo `staff` crea o edita libros, precio, disponibilidad y stock. |
| F04 | Carrito | Cambia cantidades y muestra subtotal; el servidor valida cada cantidad. |
| F05 | Pedido | El servidor toma el precio vigente, reserva stock en transacción, guarda instantánea e impide repetir con la misma clave de idempotencia. |
| F06 | Envíos | Pedido con libro impreso requiere dirección; costo fijo USD 5,00; personal registra guía y avanza estado. |
| F07 | PayPal Sandbox | Orden y captura se realizan en backend; se comprueban ID, estado, moneda, importe y pedido antes de confirmar. |
| F08 | Entrega digital | Solo propietario de pedido capturado descarga el archivo del libro digital. |
| F09 | Historial | Cliente ve únicamente sus pedidos. |
| F10 | Tablero | Personal ve pedidos pagados y cambia estados en secuencia. Cliente recibe actualizaciones por WebSocket. |
| F11 | Cancelación | Cliente cancela pedido pendiente; se libera stock. Pedidos pagados no se cancelan desde esta interfaz. |

## Reglas de negocio

1. Los precios se expresan en centavos USD; no se acepta un precio enviado desde el carrito.
2. Cada línea de pedido conserva título, formato y precio al momento de comprar.
3. El stock se reserva al crear el pedido y se devuelve al cancelar o al vencer tras 30 minutos.
4. Para impresos, el orden de estados es `PENDING_PAYMENT → PAID → PREPARING → READY → SHIPPED → DELIVERED`. Un pedido solo digital pasa a `DELIVERED` tras la captura verificada. `CANCELLED` solo sale de `PENDING_PAYMENT`.
5. El pago solo cambia a `CAPTURED` después de validar la respuesta de PayPal.
6. La descarga digital no exige que el envío físico esté entregado, pero sí una captura confirmada.

## Requisitos no funcionales

- API con validación, errores sin secretos, CORS limitado, autenticación en REST y WebSocket.
- Interfaz responsive y mensajes claros al usuario.
- Contraseñas y claves fuera del repositorio.
- Pruebas automáticas para permisos, precio, stock, idempotencia y validación de captura.

## Escenarios de prueba

| ID | Escenario | Resultado esperado | Prioridad |
|---|---|---|---|
| T01 | Abrir catálogo sin sesión | Menú visible, panel privado oculto | Alta |
| T02 | Registro y login válido/inválido | Acceso correcto o error genérico | Alta |
| T03 | Cliente abre gestión | 403 desde servidor | Alta |
| T04 | Filtrar por categoría | Resultados coherentes | Media |
| T05 | Sumar/quitar libros | Totales visuales correctos | Alta |
| T06 | Enviar precio alterado | Total del servidor sin alteración | Alta |
| T07 | Comprar en PayPal Sandbox | Una captura y pedido pagado | Alta |
| T08 | Cancelar aprobación de PayPal | Pedido sigue sin pagar | Alta |
| T09 | Consultar pedido ajeno | 403 | Alta |
| T10 | Cambiar estado y observar otra sesión | Actualización automática | Alta |
| T11 | Cantidad negativa/dirección vacía | Error 400 | Media |
| T12 | Recargar rutas y reconectar WebSocket | Estado recuperado por REST | Media |
**Datos de prueba:** cuentas ficticias dedicadas, catálogo creado por `seed`, PayPal Sandbox. No introducir credenciales personales en TestSprite. Los resultados se presentan en el [informe PDF](INFORME.pdf).

Los recorridos de interfaz se guardaron en TestSprite. Las respuestas HTTP y las reglas del servidor que el navegador automatizado no pudo observar se comprobaron con pruebas de API; el cambio de estado entre dos sesiones se verificó manualmente y con una prueba WebSocket. El informe distingue esas evidencias del resultado de la suite.
