# Workflow de migración

## Pasos y criterios de aceptación

1. **Motor compartido** — `src/modules/image-engine.js` recibe un Buffer y calidad, inspecciona el contenido y devuelve WebP en memoria. Conserva `sharp`, el paso HEIC → PNG de `heic-convert` y calidad 80. Verificado con JPEG, PNG transparente y HEIC real.
2. **Consola compatible** — `npm run convert` sigue disponible. `converter.js` usa el motor común, conserva conversiones correctas ante errores y escribe sin sobrescribir resultados previos. `file-system.js` recorre subcarpetas y evita colisiones de nombres.
3. **Next.js + TypeScript** — App Router y API `src/app/api/convert/route.ts` con runtime Node.js. Interfaz, adaptadores web y controles HTTP con TypeScript estricto. Los módulos originales compartidos permanecen en JavaScript para ejecutar la consola directamente con Node.
4. **Carga y descarga** — selección múltiple, carpetas, arrastre, calidad, progreso por archivo, cancelación, descarga individual y ZIP con rutas relativas. Los resultados viven en la sesión del navegador.
5. **Controles de seguridad** — límite incremental de carga, inspección real del contenido, rechazo de formatos/multipágina, dimensiones, saneamiento de nombres, admisión global por proceso, worker con tiempo máximo y encabezados HTTP. Los límites por cliente y por múltiples instancias se configuran en el alojamiento.
6. **Verificación** — tipos, lint, pruebas del motor/consola, compilación de producción y navegador. Las pruebas HEIC requieren `HEIC_FIXTURE` y no dependen de descargar imágenes de terceros en cada ejecución.

## Aplicación de SOLID

- **Responsabilidad única:** motor, lectura de carpetas, entrada HTTP, admisión, selección y descargas están separados.
- **Abierto/cerrado:** un nuevo formato puede incorporarse en el motor y la política de formatos sin mezclar lógica de UI o de consola.
- **Sustitución:** el contrato del motor es una entrada binaria con opciones y una salida WebP; las comprobaciones de formato, dimensiones y errores verifican ese comportamiento.
- **Interfaces pequeñas:** `SelectedFile`, `ConversionItem`, la función binaria del motor y la función del worker describen solo sus responsabilidades.
- **Inversión de dependencias:** el motor no depende de los mecanismos de entrada (HTTP, React o disco). Los adaptadores web y CLI lo consumen. No se agrega un contenedor de inyección o una jerarquía de clases para un único motor.

## Decisiones

- Conversión en servidor para reutilizar las bibliotecas actuales. El navegador debe subir las imágenes; el texto de la interfaz lo informa.
- Una imagen por solicitud, con cuerpo binario. Permite límites de lectura antes de acumular todo el contenido, progreso por archivo y errores parciales sin un formulario multipart de todo el lote.
- Cola secuencial por navegador y hasta dos solicitudes activas por proceso. Evita disparar una conversión por cada imagen del lote simultáneamente.
- ZIP en el navegador, con nombres saneados y sufijos ante colisiones. No necesita almacenamiento temporal del servidor.
- Se rechazan animaciones/multipágina en vez de extraer silenciosamente un fotograma.
- No se agrega base de datos, registro de usuarios, almacenamiento remoto ni despliegue automático.

## Mantenimiento

1. Instalar con `npm ci` para respetar el lockfile.
2. Ejecutar tipos, lint y pruebas al modificar la conversión o validación.
3. Compilar antes de las pruebas de navegador, que verifican la versión de producción.
4. Incluir una imagen HEIC real con `HEIC_FIXTURE` al cambiar dependencias del motor.
5. Revisar dependencias y límites del proveedor antes de publicar; validar un lote real sobre la infraestructura elegida.
