# Ingeniería de prompts aplicada

La guía recomienda un plan previo, construcción incremental y revisión de seguridad. Este proyecto se construyó con esos criterios.

## Prompt de planificación reutilizable

> Construye LibroYa, una tienda de libros electrónicos y físicos para un laboratorio de sistemas de información. El entregable pide catálogo, stock y envíos. Usa frontend Next.js y backend Express separado; el backend debe controlar autenticación, roles, precios, pedidos, PayPal Sandbox y eventos en tiempo real. Define entidades, rutas, reglas de transición, variables de entorno, pruebas y criterios de aceptación. No escribas código todavía: entrega primero un plan revisable y señala servicios externos requeridos.

## Criterios usados al revisar el plan

1. El registro público crea solo clientes; la cuenta de personal no se puede solicitar desde el navegador.
2. El carrito envía identificadores y cantidades; el servidor toma precio y stock de la base.
3. Una orden PayPal no confirma el pedido; la captura verificada sí.
4. La entrega digital requiere pedido propio y pagado; los impresos requieren dirección y guía de envío.
5. Los eventos en tiempo real se envían solo a clientes involucrados o personal.
6. Los secretos permanecen en variables de backend y no se muestran en la interfaz ni en los archivos versionados.

## Secuencia de construcción

1. Estructura de monorepo, base SQLite local y seguridad.
2. Catálogo, carrito, pedidos, stock y entrega.
3. PayPal Sandbox, WebSocket y tablero.
4. Pruebas, compilación, documentación y preparación de despliegue.

## Prompt de auditoría recomendado

> Revisa el código de LibroYa sin modificarlo. Busca secretos expuestos, falta de autorización por rol o propiedad, confianza en precios o estados enviados por el navegador, captura PayPal duplicada o inconsistente, riesgos de WebSocket/CORS, validación insuficiente y pruebas faltantes. Clasifica cada hallazgo por severidad y cita archivo y línea.

El PDF contiene el ejemplo PlatoYa. La actividad final se interpretó como una **adaptación de sus requisitos técnicos a la librería**, según la aclaración expresa del estudiante en esta conversación.

Los cinco prompts de generación visual utilizados para las portadas y sus archivos finales se registran en [Portadas IA](PORTADAS_IA.md).
