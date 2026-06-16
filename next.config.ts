import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  outputFileTracingIncludes: {
    "/api/worldline/documents/check": [
      "./node_modules/.pnpm/@tesseract.js-data+eng@*/node_modules/@tesseract.js-data/eng/**/*",
      "./node_modules/.pnpm/bmp-js@*/node_modules/bmp-js/**/*",
      "./node_modules/.pnpm/is-url@*/node_modules/is-url/**/*",
      "./node_modules/.pnpm/node-fetch@*/node_modules/node-fetch/**/*",
      "./node_modules/.pnpm/regenerator-runtime@*/node_modules/regenerator-runtime/**/*",
      "./node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/**/*",
      "./node_modules/.pnpm/tesseract.js@*/node_modules/tesseract.js/**/*",
      "./node_modules/.pnpm/wasm-feature-detect@*/node_modules/wasm-feature-detect/**/*",
      "./node_modules/.pnpm/zlibjs@*/node_modules/zlibjs/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
