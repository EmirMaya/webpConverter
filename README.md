# WebP Studio

Aplicación Next.js + TypeScript para adjuntar o arrastrar imágenes y carpetas, convertirlas a WebP y descargar cada resultado o un ZIP con las subcarpetas. Conserva el comando de consola y comparte el motor `sharp` / `heic-convert` entre ambos flujos. No necesita base de datos.

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
| Archivo de entrada / resultado web | Hasta 20 MiB cada uno |
| Dimensiones | Hasta 40 millones de píxeles |
| Lote en navegador | 100 archivos, 200 MiB de entrada y 200 MiB de resultados |
| Servidor | 2 solicitudes activas y 120 intentos por minuto por proceso |
| Tiempo | 30 segundos de carga y 30 segundos de conversión |
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

Respuestas: 400 (entrada inválida), 403 (origen no permitido), 408 (tiempo/cancelación), 413 (tamaño), 415 (tipo de solicitud), 422 (imagen no convertible), 429 (frecuencia), 503 (capacidad), 500 (fallo interno). 429/503 incluyen `Retry-After`; se puede reintentar desde la interfaz.

## Verificación

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Las pruebas de navegador arrancan un servidor de producción en el puerto 3100. Usan Edge instalado de manera predeterminada. Para otro entorno, instalar Chromium con `npx playwright install chromium` y definir `PLAYWRIGHT_CHANNEL=chromium` (o `chrome` para Chrome instalado).

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

La aplicación valida contenido, dimensiones, calidad, tamaño real del cuerpo, origen y nombres. Limita concurrencia y frecuencia por proceso, evita cachear resultados y configura CSP, `nosniff`, protección contra iframes y restricciones de permisos. La CSP permite scripts inline para el HTML de Next.js; no constituye una política estricta con nonces. Los workers evitan bloquear el hilo HTTP durante HEIC, pero el límite de heap del worker no limita todas las asignaciones nativas de `sharp`/WASM.

Al publicar: usar HTTPS, mantener dependencias actualizadas y establecer límites de memoria/CPU del proceso o contenedor. Configurar en el proxy un límite de cuerpo de 20 MiB, tiempos adecuados y límites por cliente; los controles en memoria se reinician con el proceso y no se comparten entre instancias. El proxy debe preservar el origen público en el encabezado Host y evitar registrar cuerpos de solicitudes. Revisar los límites de carga, respuesta y duración del proveedor antes de elegir un alojamiento serverless. Esta migración no publica ni configura infraestructura externa.
