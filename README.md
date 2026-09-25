# WebP Studio

Aplicación Next.js + TypeScript para adjuntar o arrastrar imágenes y carpetas, convertirlas a WebP y descargar cada resultado o un ZIP con las subcarpetas. Conserva el comando de consola y comparte el motor `sharp` / `heic-convert` entre ambos flujos. En Vercel usa Upstash Redis exclusivamente para cuotas y concurrencia; las imágenes no se almacenan allí.

**Despliegue en Vercel:** seguir el [workflow de seguridad, variables y publicación](docs/VERCEL.md). La web admite imágenes de hasta **4 MiB**, tanto de entrada como de salida. La consola mantiene **20 MiB** de entrada.

## Ejecutar la web

Requiere Node.js 22 o superior y npm. Desde la raíz del proyecto:

```bash
npm ci
npm run dev
```

Abrir <http://localhost:3000>. En PowerShell, si la política de ejecución bloquea `npm.ps1`, usar `npm.cmd` en lugar de `npm`.

1. Elegir imágenes o una carpeta, o arrastrarlas a la zona de carga.
2. Ajustar la calidad (80 por defecto) y pulsar **Convertir a WebP**.
3. Descargar archivos individuales o **Descargar ZIP**.

Un error afecta solamente a esa imagen. Se pueden quitar archivos, limpiar el lote, cancelar o volver a convertir los pendientes y los que fallaron. Los resultados ya completados conservan la calidad con la que fueron generados; para convertirlos con otra calidad hay que volver a agregarlos.

Las imágenes se envían al servidor y se procesan en memoria; la aplicación no las escribe en disco ni las registra. El ZIP se arma en el navegador. Cerrar o recargar la página elimina los resultados de la sesión. La descarga individual usa el nombre del archivo; el ZIP conserva las rutas relativas saneadas. La selección y el arrastre de carpetas dependen del navegador; el selector de múltiples archivos sirve como alternativa.

## Consola original

```bash
npm run convert -- ./ruta/a/imagenes
```

Genera una carpeta hermana con sufijo `-webp`, recorriendo también las subcarpetas. Mantiene calidad 80. Nombres repetidos reciben sufijos como `foto (2).webp`; los archivos que ya existan de una ejecución anterior no se sobrescriben. Informa errores individuales y termina con código 1 si hubo alguno, conservando las conversiones correctas. No sigue enlaces simbólicos de entrada. `npm start` ahora inicia la web de producción; para consola usar `npm run convert`.

## Formatos y límites

| Regla | Valor |
| --- | --- |
| Entrada | JPG/JPEG, PNG, HEIC/HEIF con compresión HEVC |
| Calidad WebP | 1–100; valor inicial 80 |
| Archivo de entrada / resultado web | Hasta 4 MiB cada uno (consola: 20 MiB de entrada) |
| Dimensiones | Hasta 40 millones de píxeles |
| Lote en navegador | 100 archivos, 200 MiB de entrada y 200 MiB de resultados |
| Solicitudes por cliente | 60/minuto y hasta 5 en una ventana de 5 segundos |
| Solicitudes globales | 120/minuto, compartidas entre instancias con Redis |
| Concurrencia | 1 por cliente y 2 globales; permisos con vencimiento a 90 segundos |
| Cuota de bytes | 64 MiB/minuto por cliente y 256 MiB/minuto globales |
| Tiempo | 15 segundos de carga, 25 segundos de conversión, función Vercel hasta 60 segundos |
| Arrastre de carpetas | Hasta 1000 entradas y 20 niveles |

Se conservan dimensiones y transparencia y se aplica la orientación de la imagen. Se omiten metadatos del resultado. Se rechazan animaciones y archivos con múltiples páginas; SVG, GIF, WebP y AVIF no están admitidos como entrada. WebP no garantiza un tamaño menor que el original, especialmente al convertir HEIC.

## Arquitectura

```text
src/app/                    Páginas y API de Next.js (TypeScript)
src/components/             Interfaz React
src/lib/                    Selección, cola y descargas del navegador
src/server/                 Admisión, carga limitada y ejecución del worker
src/workers/convert.mjs      Worker Node para aislar la conversión
src/modules/image-engine.js Motor compartido: Buffer → Buffer WebP
src/modules/converter.js    Adaptador de carpetas para la consola
src/modules/file-system.js  Recorrido y nombres de salida
src/shared/policy.js        Límites y saneamiento compartidos
src/index.js                Entrada original de consola
```

La aplicación web usa TypeScript estricto. Los módulos compartidos y la consola permanecen en JavaScript para conservar `node src/index.js` sin compilación adicional; el contrato del motor está documentado con JSDoc. El motor no conoce React, HTTP ni rutas de archivos. Ver [workflow y decisiones SOLID](docs/WORKFLOW.md).

### API

`POST /api/convert?quality=80`, con el archivo como cuerpo binario y `Content-Type: application/octet-stream`. Devuelve `image/webp` o JSON `{ "error": "..." }`. Se usa una imagen por solicitud y lectura incremental del cuerpo para aplicar el límite aun sin `Content-Length`, sin tener que cargar un formulario completo antes de validarlo. La extensión y el MIME declarados no reemplazan la inspección del contenido real.

Respuestas: 400 (entrada inválida), 403 (origen no permitido), 408 (tiempo/cancelación), 413 (tamaño), 415 (tipo de solicitud), 422 (imagen no convertible), 429 (cuota/concurrencia del cliente), 503 (capacidad o controles de seguridad no disponibles), 500 (fallo interno). Los errores incluyen `code` y `requestId`; todas las respuestas incluyen `X-Request-Id`. La interfaz respeta `Retry-After` en 429/503 y reintenta hasta dos veces; si sigue saturado, pausa el lote conservando los pendientes.

## Verificación

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Las pruebas de navegador arrancan un servidor de producción en el puerto 3100. Usan Edge instalado de manera predeterminada. Para otro entorno, instalar Chromium con `npx playwright install chromium` y definir `PLAYWRIGHT_CHANNEL=chromium` (o `chrome` para Chrome instalado).

El servidor de pruebas usa explícitamente `RATE_LIMIT_BACKEND=memory` fuera de Vercel. La prueba de Redis real se omite por defecto; habilitarla con `RUN_REDIS_INTEGRATION=1`, `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` de una base de prueba. Usa claves efímeras con prefijo único. Ver [validación de Redis y Preview](docs/VERCEL.md).

Las pruebas HEIC se activan con `HEIC_FIXTURE` apuntando a un archivo real. Sin esa variable se omiten explícitamente. Para reproducirlas en PowerShell:

```powershell
$env:HEIC_FIXTURE = 'C:\ruta\foto.heic'
npm.cmd test
npm.cmd run test:e2e
```

La verificación inicial utilizó el [HEIC de una sola imagen enlazado por heic-convert](https://github.com/catdad-experiments/heic-convert/blob/master/scripts/images.js), de 1440 × 960 píxeles. SHA-256: `c02a2d70040fa05840231c29f183ce51d045bea027839e3d2ca4a6e968371541`. El archivo de terceros no se distribuye en el repositorio.

## Producción y seguridad

```bash
npm run build
npm start
```

Requiere alojamiento Node.js; la API no funciona como una exportación estática. Ejecutar desde la raíz del proyecto y conservar `src/workers`, `src/modules/image-engine.js`, `src/shared/policy.js` y las dependencias del motor. `next.config.ts` incluye esos archivos en el trazado de la ruta para empaquetadores compatibles.

Para probar `npm start` localmente sin Redis, definir explícitamente `RATE_LIMIT_BACKEND=memory` antes de iniciarlo. `npm run dev` ya usa memoria de forma predeterminada. En Vercel ese modo se rechaza, incluso si está configurado por error: hacen falta las variables privadas descritas en `.env.example` y `docs/VERCEL.md`.

La aplicación valida contenido, dimensiones, calidad, tamaño real del cuerpo, origen y nombres. Redis mantiene las cuotas y los permisos temporales compartidos. Ante credenciales ausentes, errores o timeout del servicio de límites, devuelve 503 antes de convertir. La identificación usa el encabezado de IP de Vercel, agrupa IPv6 por /64 y lo transforma con HMAC; no guarda IP en claro en Redis. Personas que comparten IP comparten cuota.

La CSP utiliza nonces distintos por solicitud para scripts y requiere renderizado dinámico de la página. Se conservan `nosniff`, bloqueo de iframes y permisos restringidos. En Vercel se agrega HSTS. Los logs contienen identificador de solicitud, estado, duración, tamaños y fallos de liberación, sin archivos, nombres ni IP. El worker no es un aislamiento de seguridad del proceso ni limita toda la memoria nativa de `sharp`/WASM.

Antes de publicar, configurar Redis, reglas del Vercel Firewall, alertas de consumo y una Preview siguiendo [docs/VERCEL.md](docs/VERCEL.md). Los controles de la aplicación no reemplazan la protección temprana del proveedor contra abuso. Esta adaptación no crea recursos externos ni despliega automáticamente.
