import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebP Studio · Convertidor de imágenes",
  description: "Convertí tus imágenes JPG, PNG y HEIC a WebP. Adjuntá imágenes o carpetas y descargá los resultados.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
