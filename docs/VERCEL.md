# Workflow de seguridad y despliegue en Vercel

## Orden de trabajo

1. Adaptar carga y respuesta web a 4 MiB; conservar 20 MiB para consola. Definir runtime Node.js y duración máxima de la función.
2. Separar contratos de admisión, identificación del cliente, almacenamiento de límites y manejo HTTP (SOLID).
3. Incorporar rate limiting compartido con Upstash Redis, cuotas de bytes y permisos temporales de concurrencia. Ante una falla del servicio de límites, rechazar nuevas conversiones.
4. Agregar reintentos limitados y cancelables que respeten `Retry-After`. Pausar el lote cuando el servicio siga saturado.
5. Reforzar CSP, registrar métricas sin imágenes, nombres ni IP en claro y comprobar el empaquetado del worker y sus dependencias.
6. Ejecutar pruebas de seguridad, conversión, interfaz y compilación. Registrar qué se verificó localmente y qué necesita credenciales reales.
7. Configurar las variables y las reglas del firewall en el proyecto de Vercel, desplegar una Preview y validar allí antes de publicar.

La configuración de la cuenta y la verificación de una Preview son pasos externos; no se consideran realizados por preparar el código local.

## Implementación y SOLID

| Responsabilidad | Archivo | Contrato / principio |
| --- | --- | --- |
| Política de límites | `src/server/security-policy.ts` | Una fuente para los valores del servidor |
| Admisión del trabajo | `src/server/admission-service.ts` | Depende de `RateStore` y `LeaseStore`, no de Redis (DIP) |
| Contratos pequeños | `src/server/security-contracts.ts` | `RateStore`, `LeaseStore`, `AdmissionControl`, `ConversionPermit` (ISP) |
| Almacenamiento distribuido | `src/server/upstash-security-store.ts` | Adaptador con clientes oficiales de Upstash |
| Desarrollo local | `src/server/memory-security-store.ts` | Misma interfaz; sustituible en pruebas (LSP) |
| Composición y configuración | `src/server/admission.ts` | Elige adaptadores; nunca usa memoria en Vercel |
| Identificación | `src/server/client-identity.ts` | IP confiable de Vercel, agrupación IPv6 y HMAC (SRP) |
| Orquestación HTTP | `src/server/convert-handler.ts` | Dependencias inyectables para probar rechazos sin convertir |
| Reintentos del navegador | `src/lib/convert-upload.ts` | Transporte separado del estado de React (SRP) |
| CSP | `src/proxy.ts` | Nonce por solicitud; página dinámica |

Se puede agregar otro backend implementando los contratos, sin modificar el handler ni la conversión (OCP). Los adaptadores comparten las reglas funcionales; en memoria se usa un registro de eventos y en Redis ventanas deslizantes aproximadas de Upstash, por lo que el instante exacto de recuperación de cuota puede variar.

## Política inicial

- Solicitudes por cliente: 60 por minuto, con una ventana adicional de 5 solicitudes cada 5 segundos.
- Solicitudes globales: 120 por minuto.
- Bytes procesados: 64 MiB por minuto por cliente y 256 MiB por minuto globales, medidos tras leer el cuerpo y antes de convertir. Los rechazos posteriores de conversión consumen cuota; no se reembolsan.
- Concurrencia: un permiso por cliente y dos permisos globales, compartidos entre instancias mediante `SET NX PX`.
- Permisos con propietario único y TTL de 90 segundos. Se liberan mediante comparación y borrado atómicos; si la función muere, vencen solos. El TTL supera los 60 segundos máximos configurados para la función. Los rechazos por concurrencia consumen la cuota de solicitudes.
- Los límites y permisos no forman una única transacción entre sí: un rechazo posterior puede consumir una cuota previa. Es una decisión conservadora para controlar el abuso.
- Cada operación Redis tiene un timeout de 2 segundos y no se reintenta automáticamente. El timeout permisivo del SDK de rate limiting se convierte explícitamente en 503. Los fallos de liberación quedan registrados; el TTL recupera la capacidad.
- El navegador reintenta como máximo dos veces ante 429/503, espera `Retry-After` y permite cancelar la espera. Si la pausa excede 120 segundos o persiste el rechazo, conserva el lote pendiente.

Estos valores son un punto de partida conservador y deben ajustarse después de probar tráfico real. La identidad representa una IP o una red IPv6 /64, no una persona autenticada. NAT y VPN pueden compartir límites; un atacante con muchas IP necesita controles adicionales del firewall.

## Configuración en Vercel

1. Crear o conectar una base **Upstash Redis** mediante Vercel Marketplace o Upstash. Elegir una región cercana a la función y mantener un único backend autoritativo para las cuotas.
2. Configurar estas variables privadas en **Settings → Environment Variables**. Nunca usar el prefijo `NEXT_PUBLIC_`:

   | Variable | Valor |
   | --- | --- |
   | `RATE_LIMIT_BACKEND` | `redis` |
   | `UPSTASH_REDIS_REST_URL` | URL HTTPS de la base |
   | `UPSTASH_REDIS_REST_TOKEN` | Token con escritura |
   | `RATE_LIMIT_ID_SECRET` | Secreto aleatorio de al menos 32 caracteres |
   | `RATE_LIMIT_PREFIX` | Por ejemplo, `webp-studio:production` |

3. Usar credenciales/prefijo distintos para Preview y Production. El prefijo de producción debe mantenerse entre despliegues para no reiniciar cuotas ni duplicar permisos durante un rollout. Configurar la misma política en todas las instancias que compartan prefijo.
4. Framework preset **Next.js**, instalación `npm ci`, build `npm run build`, runtime Node.js compatible con `package.json`. No usar Edge ni exportación estática. La ruta declara `runtime = "nodejs"` y `maxDuration = 60`.
5. Mantener los archivos incluidos por `outputFileTracingIncludes`; contienen el worker, el motor y sus dependencias nativas. Compilar en Vercel para obtener los binarios Linux de `sharp`; no subir `node_modules` de Windows.
6. En Vercel Firewall, proteger `POST /api/convert`: comenzar observando tráfico, luego aplicar un límite por IP algo mayor al de la aplicación y reglas ante abuso. Verificar disponibilidad y costo de rate limiting según el plan. Evitar desafíos HTML en respuestas de la API: la interfaz espera un WebP o JSON. Si se incorpora un desafío, hacerlo antes de la carga con su integración de cliente correspondiente.
7. Configurar alertas de gasto y revisar métricas de función: 429/503, duración, errores y volumen. En los logs buscar `event="conversion"`, `code`, `durationMs` y `releaseFailed`.
8. Desplegar Preview y ejecutar la verificación de abajo. Luego promover el despliegue revisado a producción.

Vercel aporta `x-vercel-forwarded-for`; fuera de Vercel no se confía en encabezados de IP y se usa una identidad local compartida. Colocar otro proxy delante requiere revisar esta política. `Origin` controla solicitudes entre sitios, pero no autentica llamadas directas. No hay claves secretas en el frontend.

## Límites de Vercel y privacidad

Las funciones aceptan hasta 4,5 MB de cuerpo de solicitud/respuesta. Se usa **4 MiB** en la aplicación para dejar margen; un archivo mayor puede ser rechazado por Vercel antes de llegar al handler. La consola conserva 20 MiB. Los lotes se envían imagen por imagen y el ZIP se genera en el navegador.

La aplicación procesa los archivos en memoria. Redis solo contiene identificadores HMAC, contadores y permisos con vencimiento. Vercel puede registrar metadatos propios de las solicitudes según su configuración; la aplicación no registra archivos, nombres ni IP. Los identificadores HMAC son seudónimos, no datos anónimos.

Para soportar imágenes mayores a 4 MiB haría falta otro flujo: carga directa autorizada a almacenamiento temporal, conversión con acceso restringido y descarga desde ese almacenamiento con expiración. No está incluido en esta adaptación.

La CSP con nonces impide prerenderizar la página como HTML estático. `src/app/page.tsx` espera una solicitud con `connection()`. Los scripts inline requieren el nonce; los estilos inline siguen permitidos. No habilitar una caché de HTML que reutilice nonces.

## Verificación reproducible

```powershell
$env:HEIC_FIXTURE = 'C:\ruta\foto.heic'
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run verify:bundle
npm.cmd run test:e2e
```

Para probar Redis real, cargar las credenciales de una base de prueba solo en el entorno y ejecutar:

```powershell
$env:RUN_REDIS_INTEGRATION = '1'
node --import tsx --test tests/redis.integration.test.ts
```

La prueba usa un prefijo aleatorio `webp-test:*`, verifica cuotas compartidas y permisos entre dos adaptadores independientes, y deja solo contadores con vencimiento. Sin la variable de activación se omite explícitamente.

`.github/workflows/ci.yml` ejecuta automáticamente tipos, lint, pruebas locales, build, revisión del trazado del worker y pruebas de navegador en Chromium/Linux. No requiere secretos. HEIC real y Redis real se omiten allí si no se configuran explícitamente sus recursos de prueba; no se envían secretos a pull requests.

En Preview verificar:

- JPG, PNG y HEIC real producen WebP y el ZIP conserva subcarpetas.
- La UI rechaza archivos mayores a 4 MiB y la API limita también cuerpos sin tamaño declarado.
- Solicitudes simultáneas desde el mismo cliente devuelven 429; la tercera conversión de clientes distintos devuelve 503.
- Reiniciar/desplegar una instancia no reinicia las cuotas compartidas.
- Si Redis no está disponible, devuelve 503 sin ejecutar el conversor.
- Una espera por cuota puede cancelarse sin perder resultados anteriores.
- El CSP tiene un nonce distinto por documento y la consola del navegador no muestra bloqueos de scripts de la aplicación.
- El worker encuentra los binarios Linux de `sharp` en el despliegue.

## Fuentes oficiales

- [Límites de funciones de Vercel](https://vercel.com/docs/functions/limitations)
- [Duración máxima](https://vercel.com/docs/functions/configuring-functions/duration)
- [Encabezados de IP proporcionados por Vercel](https://vercel.com/docs/headers/request-headers)
- [Rate limiting en Vercel Firewall](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Upstash: ventanas, cuotas y comportamiento de timeout](https://upstash.com/docs/redis/sdks/ratelimit-ts/features)
- [CSP con nonces en Next.js](https://nextjs.org/docs/app/guides/content-security-policy)
