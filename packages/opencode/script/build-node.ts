#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

// hugr-omni is bundled, never external (integration plan WP4): the desktop ships its addon and supervisor in
// Resources/omni, not in node_modules. Bun bakes this checkout's __dirname into the bundle (plan section 7, P5), so
// the bundle must never find omni by itself; core's loader hands the binding explicit paths (configure(), or
// HUGR_OMNI_ADDON / HUGR_OMNI_SUPERVISOR from the desktop's fork env), which turns the checkout fallback off.
const result = await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    OPENCODE_MODELS_DEV: generated.modelsData,
    OPENCODE_VERSION: `'${Script.version}'`,
    OPENCODE_CHANNEL: `'${Script.channel}'`,
  },
  plugins: [
    {
      // Bun's import.meta.dir does not exist under Node (the desktop's utilityProcess); a module that evaluated it at
      // load time (maestro/backend-skill-root.ts) stopped the desktop server from starting. import.meta.dirname is
      // the same directory on Node and Bun.
      name: "node-import-meta-dir",
      setup(build) {
        build.onLoad({ filter: /[\\/]packages[\\/](opencode|core)[\\/]src[\\/].*\.ts$/ }, async (args) => {
          const text = await Bun.file(args.path).text()
          if (!/\bimport\.meta\.dir\b(?!name)/.test(text)) return undefined
          return { contents: text.replace(/\bimport\.meta\.dir\b(?!name)/g, "import.meta.dirname"), loader: "ts" }
        })
      },
    },
  ],
  files: {
    "opencode-web-ui.gen.ts": "",
    // No embedded backend skill tree under Node: BackendSkillRoot falls back to its source path.
    "opencode-backend-skills.gen.ts": "export default undefined",
  },
})

const external = await Promise.all(
  result.outputs
    .filter((output) => output.path.endsWith(".js"))
    .map(async (output) =>
      (await output.text()).match(/(?:from\s*|import\(\s*|require\(\s*)["']hugr-omni["']/) ? output.path : "",
    ),
)
if (external.some(Boolean))
  throw new Error(`hugr-omni must be bundled, not imported: ${external.filter(Boolean).join(", ")}`)

console.log("Build complete")
