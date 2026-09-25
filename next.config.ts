import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "heic-convert"],
  outputFileTracingIncludes: {
    "/api/convert": ["./package.json", "./src/workers/**/*", "./src/modules/image-engine.js", "./src/shared/policy.js", "./node_modules/heic-convert/**/*", "./node_modules/heic-decode/**/*", "./node_modules/libheif-js/**/*", "./node_modules/pngjs/**/*", "./node_modules/jpeg-js/**/*", "./node_modules/sharp/**/*", "./node_modules/@img/**/*", "./node_modules/semver/**/*", "./node_modules/detect-libc/**/*"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ...(process.env.VERCEL === "1" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
      ],
    }, {
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
    }];
  },
};
export default nextConfig;
