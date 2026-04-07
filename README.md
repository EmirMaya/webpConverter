# Convertidor JPG a WEBP

Proyecto simple en Node.js para convertir todas las imagenes `.jpg` o `.jpeg` de una carpeta a una nueva carpeta con archivos `.webp`.

## Requisitos

- Node.js 20 o superior

## Instalacion

```bash
npm install
```

## Uso

```bash
npm run convert -- ./ruta/a/imagenes
```

Si la carpeta de entrada es `./imagenes`, el script genera `./imagenes-webp` con todos los archivos convertidos.

## Notas

- Solo procesa archivos del primer nivel de la carpeta indicada.
- Crea la carpeta de salida si no existe.
- Falla con mensaje claro si la carpeta no existe o no contiene `.jpg`/`.jpeg`.