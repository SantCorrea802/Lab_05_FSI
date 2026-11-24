# Plan de pruebas TestSprite — LibroYa

**Estado:** la cuenta, API key `LibroYa-local`, CLI 0.17.0, proyecto `LibroYa` y entorno predeterminado `local` (`http://localhost:3100`) están configurados. T01 (`CATALOG-001`), T04 (`SEARCH-001`) y T05 (`CART-001`) pasaron en dos ejecuciones reales por túnel local: 3/3, sin fallos ni tiempos agotados. Los mismos tres casos pasaron contra `https://libroya-web-production.up.railway.app` (3/3, ejecución `a8f5f91b-acf0-4315-a477-fe09e7dc78a8`). El plan Free permite un solo entorno guardado, por lo que se usó `--target-url` con un entorno temporal sin eliminar `local`. La compra digital de PayPal Sandbox se capturó, reconcilió y descargó desde LibroYa.

## Alcance para la primera ejecución local

La web de prueba se sirve en `http://localhost:3100`. El proxy `/backend` envía las solicitudes REST al backend local en el puerto 4000, de modo que el navegador remoto de TestSprite puede consultar el catálogo y usar la aplicación a través de un solo túnel. El proxy solo se activa con `LIBROYA_LOCAL_TEST_PROXY=1`; la web normal conserva su configuración. El WebSocket no está cubierto por este proxy y T10/T12 se reservan para el despliegue público.

| ID | Procedimiento | Resultado esperado | Estado |
|---|---|---|---|
| T01 | Abrir la portada sin iniciar sesión | Se ven cinco libros; no se muestra el tablero de personal | Aprobado en TestSprite |
| T04 | Buscar `Datos` y seleccionar una categoría | Los resultados corresponden al filtro y al texto | Aprobado en TestSprite |
| T05 | Añadir un eBook, subir y bajar la cantidad desde la bolsa | La cantidad y el subtotal cambian de forma coherente | Aprobado en TestSprite |
| T02 | Registrar una cuenta ficticia nueva e iniciar sesión | La cuenta tiene rol cliente y aparecen sus pedidos | Requiere datos ficticios de prueba |
| T11 | Intentar pedido impreso sin dirección | El servidor rechaza la solicitud; no se completa compra | Requiere cuenta ficticia; prueba preferible por API |
| T03, T06, T09, T13, T14 | Permisos, precio alterado, propiedad, descarga y guía | Se mantienen las respuestas de seguridad esperadas | Cubiertos en pruebas locales de servidor; ampliar en TestSprite tras cuenta |
| T07, T08 | Pago aprobado y cancelado | Pedido pagado solo tras captura; cancelación sigue pendiente | Compra digital aprobada y otro pedido cancelado comprobados manualmente en Sandbox; no automatizados en TestSprite |
| T10, T12 | Tablero en tiempo real y reconexión | Estado coherente en sesiones distintas | Despliegue público listo; falta comprobación visual entre cliente y personal |

Datos de ejemplo: libros ficticios cargados por `seed`. Para el registro usar una cuenta de prueba nueva con un correo ficticio del dominio `.test`. No usar una cuenta personal, una contraseña real ni datos reales de envío.

Detalles de la interfaz para revisar las propuestas de TestSprite: el catálogo inicial de esta demostración tiene exactamente cinco libros; el eBook `Datos que cuentan historias` tiene stock suficiente para probar tres unidades. La búsqueda compara texto sin distinguir mayúsculas, pero no elimina tildes. El carrito se guarda en `localStorage` y sobrevive a una recarga. No existe un botón independiente de «quitar»: se pulsa el control `−` hasta que la cantidad llega a cero. Las primeras pruebas son públicas y no requieren una cuenta de prueba.

## Preparación en Windows

1. Mantener el backend en ejecución (`npm.cmd run dev:server`) y comprobar `http://localhost:4000/health`.
2. En otra terminal de la raíz del proyecto, ejecutar `powershell -ExecutionPolicy Bypass -File .\scripts\iniciar-web-testsprite.ps1`. Este comando compila una variante aislada en `web/.next-testsprite` y abre `http://localhost:3100`. Mantener esa terminal abierta.
3. Crear una cuenta en [TestSprite](https://www.testsprite.com/) y generar una API key desde el panel. No pegarla en el chat ni en capturas.
4. Instalar la [CLI oficial](https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md) con `npm.cmd install -g @testsprite/testsprite-cli`. Verificar con `testsprite.cmd --version`. La guía consultada describe CLI 0.17; si se instala otra versión, revisar `testsprite.cmd --help` antes de ejecutar comandos.
5. Ejecutar `testsprite.cmd setup --no-agent --no-gitignore` e introducir la API key en la entrada oculta. `--no-gitignore` evita que la herramienta modifique archivos relacionados con Git. Verificar con `testsprite.cmd auth status`.
6. Crear el proyecto y el entorno local:

   ```powershell
   testsprite.cmd project create --type frontend --name "LibroYa"
   $projectId = "PEGA_AQUI_EL_ID_DEVUELTO"
   testsprite.cmd project env create $projectId --name local --local 3100 --sign-in public
   ```

7. Solicitar casos iniciales a partir de este plan, sin usar `--diff` porque no se trabaja con un repositorio Git:

   ```powershell
   testsprite.cmd plan "Propón pruebas de interfaz T01, T04 y T05 para LibroYa, una tienda de libros. Usa el entorno local, evita pagos y datos reales. Muestra pasos y aserciones antes de guardar." --file docs/PLAN_TESTSPRITE.md --file PRD.md --project $projectId --steps
   ```

8. Revisar la propuesta. Si es correcta, `testsprite.cmd apply --output json` la guarda; anotar los IDs devueltos. Ejecutar un caso con `testsprite.cmd run ID_DEL_CASO --env local --wait --output json`. La CLI abre y mantiene el túnel mientras espera el resultado. Guardar captura del panel de resultados y, si falla, descargar la evidencia con `testsprite.cmd result get ID_DEL_RESULTADO --out .testsprite/results/ID_DEL_RESULTADO`.

La ejecución usa créditos de TestSprite. El agente de TestSprite no explora una aplicación accesible solo en `localhost` al preparar el plan; necesita el PRD y esta especificación. Los resultados reales se registrarán en `docs/RESULTADOS_PRUEBAS.md`.

## Ejecución contra el sitio público en el plan Free

El plan Free rechazó un segundo entorno guardado. La CLI 0.17.0 acepta `--target-url` y crea un entorno temporal para la ejecución sin contar contra ese límite. Ejecutar los tres casos existentes desde la raíz del proyecto, sin `--env local` y sin túnel:

```powershell
testsprite.cmd run ed659ae2-b514-4bba-be7d-fd14ccef647b 9640e314-28c9-43ae-a058-8bd5595aab72 f5f07041-e5e3-460b-8c63-ede5c9c8c019 --target-url https://libroya-web-production.up.railway.app --max-concurrency 1 --timeout 1200 --wait
```

Resultado real: T01, T04 y T05 aprobados (3/3; 0 fallos; 0 tiempos agotados). `evidencias/e38.png` captura la salida, pero requiere recortar la primera línea con la ruta personal de Windows antes de incluirla en el informe. La [documentación oficial de TestSprite](https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md) explica que los entornos temporales se eliminan al acabar y no ocupan la cuota de entornos guardados.

## Evidencia para el informe

- `evidencias/e19.png`: proyecto `LibroYa` y entorno `local` en TestSprite, sin API key visible. Ya tomada y revisada.
- `evidencias/e20.png`: ejecución con casos y resultados reales (aprobados/fallidos), sin contraseñas ni datos personales.

Fuentes: [CLI oficial, proyecto y entorno local](https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md), [ejecución mediante túnel](https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md#local-frontend-testing-and-tunnels).
