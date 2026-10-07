import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const portableBuild = process.env.PASCAL_PORTABLE_BUILD === '1'
// N's factory: GitHub Pages 向けの静的書き出し（`bun run build:static`）。
// サーバー保存(API)・動的ページは含めず、`*.static.tsx` のページだけをビルドする。
const staticExport = process.env.PASCAL_STATIC_EXPORT === '1'
const staticBasePath = process.env.PASCAL_STATIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  ...(portableBuild
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(appDirectory, '../..') }
    : {}),
  ...(staticExport
    ? {
        output: 'export' as const,
        distDir: '.next-static',
        env: { NEXT_PUBLIC_PASCAL_STATIC: '1', NEXT_PUBLIC_PASCAL_STATIC_BASE_PATH: staticBasePath },
        basePath: staticBasePath,
        trailingSlash: true,
        pageExtensions: ['static.tsx'],
        outputFileTracingRoot: path.join(appDirectory, '../..'),
      }
    : {}),
  logging: {
    browserToTerminal: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // MCP / package metadata returns `/editor/<id>` (hosted route). This open-source
  // app serves saved scenes at `/scene/<id>` — redirect so links and bookmarks work.
  ...(staticExport
    ? {}
    : {
        async redirects() {
          return [
            {
              source: '/editor/:id',
              destination: '/scene/:id',
              permanent: false,
            },
          ]
        },
      }),
  transpilePackages: [
    'three',
    '@pascal-app/viewer',
    '@pascal-app/core',
    '@pascal-app/editor',
    '@pascal-app/mcp',
    '@pascal-app/plugin-pool',
    '@pascal-app/plugin-streetscape',
    '@pascal-app/plugin-trees',
    '@mint/pascal-plugin',
    '@pascal-app/plugin-bones',
    '@webxr/plugin',
    '@pascal-app/plugin-environment',
    '@dgreenheck/ez-tree',
  ],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized:
      portableBuild ||
      staticExport ||
      (process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
