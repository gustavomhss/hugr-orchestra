#!/usr/bin/env bun

import { Script } from "@orchestra/script"
import path from "path"
import { fileURLToPath } from "url"
import { seatSkillsFiles } from "./seat-skills"
import { leanNotices } from "./lean-notices"
import { resolveClaudeCodeResource, stageClaudeCodeResource } from "./claude-code-resources"
import { ClaudeCodeExecutable } from "@orchestra/engine-claude-code/executable"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")
const targetFlag = process.argv.indexOf("--claude-target")
const claudeTarget = targetFlag === -1 ? undefined : process.argv[targetFlag + 1]
if (targetFlag !== -1 && (!claudeTarget || !/^(darwin|win32|linux)-(x64|arm64)(-musl)?$/.test(claudeTarget) ||
  (claudeTarget.endsWith("-musl") && !claudeTarget.startsWith("linux-"))))
  throw new ClaudeCodeExecutable.UnavailableError(`Invalid Node build Claude Code target: ${claudeTarget ?? "missing"}`)
const claudeCode = resolveClaudeCodeResource({
  root: dir, os: claudeTarget?.split("-")[0] ?? process.platform, arch: claudeTarget?.split("-")[1] ?? process.arch,
  abi: claudeTarget ? (claudeTarget.endsWith("-musl") ? "musl" : "glibc") :
    process.platform === "linux" ? ClaudeCodeExecutable.nativeLibc() : undefined,
})

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
    ORCHESTRA_COMPILED: "true",
    ORCHESTRA_CLAUDE_NODE: "true",
    ORCHESTRA_CANDIDATE_BUILD: String(process.argv.slice(2).includes("--lean-candidate")),
    ORCHESTRA_MODELS_DEV: generated.modelsData,
    ORCHESTRA_VERSION: `'${Script.version}'`,
    ORCHESTRA_CHANNEL: `'${Script.channel}'`,
  },
  plugins: [
    {
      // Bun's import.meta.dir does not exist under Node (the desktop's utilityProcess); a module that evaluated it at
      // load time (maestro/backend-skill-root.ts) stopped the desktop server from starting. import.meta.dirname is
      // the same directory on Node and Bun.
      name: "node-import-meta-dir",
      setup(build) {
        build.onLoad({ filter: /[\\/](?:apps[\\/]orchestra|packages[\\/]core)[\\/]src[\\/].*\.ts$/ }, async (args) => {
          const text = await Bun.file(args.path).text()
          if (!/\bimport\.meta\.dir\b(?!name)/.test(text)) return undefined
          return { contents: text.replace(/\bimport\.meta\.dir\b(?!name)/g, "import.meta.dirname"), loader: "ts" }
        })
      },
    },
  ],
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

const external = await Promise.all(
  result.outputs
    .filter((output) => output.path.endsWith(".js"))
    .map(async (output) =>
      (await output.text()).match(/(?:from\s*|import\(\s*|require\(\s*)["']hugr-omni["']/) ? output.path : "",
    ),
)
if (external.some(Boolean))
  throw new Error(`hugr-omni must be bundled, not imported: ${external.filter(Boolean).join(", ")}`)

await leanNotices("./dist/node")
stageClaudeCodeResource(claudeCode, "./dist/node/claude-code")

console.log("Build complete")
