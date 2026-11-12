import type { NextConfig } from "next";

// 配置后端地址后（例如 API_PROXY_TARGET=http://localhost:3001），
// /api/* 会优先转发给 Fastify，src/app/api 下的 mock 接口不再生效。
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: apiProxyTarget
        ? [{ source: "/api/:path*", destination: `${apiProxyTarget}/:path*` }]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
