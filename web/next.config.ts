import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// 配置后端地址后（例如 API_PROXY_TARGET=http://localhost:3001），
// /api/* 会优先转发给 Fastify，src/app/api 下的 mock 接口不再生效。
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "");
const creationTarget = (process.env.CREATION_API_TARGET ?? "http://127.0.0.1:3002").replace(/\/$/, "");

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/v1/creation/:path*", destination: `${creationTarget}/v1/creation/:path*` },
        ...(apiProxyTarget ? [{ source: "/api/:path*", destination: `${apiProxyTarget}/:path*` }] : []),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
