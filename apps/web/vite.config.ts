import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig, type Plugin } from "vite"
import desktopPlugin from "@orchestra/app/vite"
import { fileURLToPath } from "node:url"

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./dist/**",
          filesToDeleteAfterUpload: "./dist/**/*.map",
        },
      })
    : false

// Browser fixtures stay with the shared shell in packages/app-shell/e2e. Specs load them from this dev server
// at /e2e/, as they did when the web entry and the shell were one package; /@fs/ keeps Vite's HTML and module
// transforms, and needs forward slashes with no leading slash before a Windows drive letter.
const shellE2E = fileURLToPath(new URL("../../packages/app-shell/e2e", import.meta.url)).replaceAll("\\", "/").replace(/^\//, "")
const shellFixtures: Plugin = {
  name: "orchestra-web:shell-fixtures",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith("/e2e/")) req.url = `/@fs/${shellE2E}${req.url.slice("/e2e".length)}`
      next()
    })
  },
}

export default defineConfig({
  publicDir: fileURLToPath(new URL("../../packages/app-shell/public", import.meta.url)),
  plugins: [desktopPlugin, shellFixtures, sentry] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
