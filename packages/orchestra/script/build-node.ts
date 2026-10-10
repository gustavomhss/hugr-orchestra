#!/usr/bin/env bun

import { Script } from "@orchestra/script"
import path from "path"
import { fileURLToPath } from "url"
import { seatSkillsFiles } from "./seat-skills"
import { leanNotices } from "./lean-notices"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    ORCHESTRA_COMPILED: "true",
    ORCHESTRA_CANDIDATE_BUILD: String(process.argv.slice(2).includes("--lean-candidate")),
    ORCHESTRA_MODELS_DEV: generated.modelsData,
    ORCHESTRA_VERSION: `'${Script.version}'`,
    ORCHESTRA_CHANNEL: `'${Script.channel}'`,
  },
  files: {
    "orchestra-web-ui.gen.ts": "",
    ...await seatSkillsFiles(),
  },
})

// Every generated module must be provided above: an unresolved one survives as a bare import that breaks the desktop
// bundle (electron-vite) or fails at runtime, and only the Bun build is otherwise exercised.
const unresolved = (
  await Promise.all(
    (await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: "./dist/node" }))).map(async (file) =>
      [...(await Bun.file(path.join("./dist/node", file)).text()).matchAll(/["']([\w./-]+\.gen\.ts)["']/g)].map(
        (match) => `${file}: ${match[1]}`,
      ),
    ),
  )
).flat()
if (unresolved.length > 0) throw new Error(`Unresolved generated modules in the Node build:\n${unresolved.join("\n")}`)

await leanNotices("./dist/node")
console.log("Build complete")
