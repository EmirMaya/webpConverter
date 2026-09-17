import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "heic-convert"],
  outputFileTracingIncludes: {
    "/api/convert": ["./src/workers/**/*", "./src/modules/image-engine.js", "./src/shared/policy.js", "./node_modules/heic-convert/**/*", "./node_modules/heic-decode/**/*", "./node_modules/libheif-js/**/*", "./node_modules/pngjs/**/*", "./node_modules/jpeg-js/**/*", "./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") + "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
      ],
    }];
  },
};
export default nextConfig;
