import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@orchestra/app/vite"
// Config loading externalizes package imports; bundle this TypeScript bootstrap with the config.
import { WorkspacePaths } from "../../packages/script/src/workspace-paths.ts"
import path from "node:path"

const workspace = WorkspacePaths.make(import.meta.dirname)

const channel = (() => {
  const raw = process.env.ORCHESTRA_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.ORCHESTRA_CHANNEL === "latest") return "prod"
  return "dev"
})()

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

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
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.ORCHESTRA_CHANNEL": JSON.stringify(channel),
      "import.meta.env.ORCHESTRA_MAC_SIGNED": JSON.stringify(process.env.ORCHESTRA_MAC_SIGNED === "true" ? "true" : "false"),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts" },
        // Keep this identical to electron-vite's Node 20.11+ shim. Its regex insertion can
        // corrupt bundled TypeScript, while a Rollup banner places the shim safely.
        output: {
          banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`,
        },
      },
      // core ships TypeScript sources, which Node will not load from node_modules: bundle it (its omni loader).
      externalizeDeps: { include: [nodePtyPkg], exclude: ["@orchestra/core"] },
    },
    plugins: [
      {
        name: "orchestra:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts", "live-capture": "src/preload/live-capture.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [appPlugin, sentry],
    publicDir: path.join(workspace.module("app"), "public"),
    root: "src/renderer",
    build: {
      sourcemap: process.env.ORCHESTRA_FAST_BUILD === "1" ? false : true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
      },
    },
  },
})
