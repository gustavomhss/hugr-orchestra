#!/usr/bin/env bun

import { $ } from "bun"
import { rm } from "fs/promises"
import path from "path"
import { namedTargets } from "./targets"

const dir = path.resolve(import.meta.dirname, "..")
const binary = "orchestra"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")

const targetArgs = process.argv.slice(2).flatMap((arg, index, args) =>
  arg === "--target" ? [args[index + 1] ?? ""] : arg.startsWith("--target=") ? [arg.slice(9)] : [],
)
if (targetArgs.length > 1 || (targetArgs.length === 1 && !namedTargets.some((item) => item.target === targetArgs[0])))
  throw new Error(
    `Invalid --target: ${targetArgs.join(", ") || "missing value"}. Expected one of: ${namedTargets.map((item) => item.target).join(", ")}`,
  )

const targets = targetArgs.length
  ? namedTargets.filter((item) => item.target === targetArgs[0])
  : singleFlag
    ? namedTargets.filter((item) => {
        if (item.os !== process.platform || item.arch !== process.arch) return false
        if (item.avx2 === false) return baselineFlag
        return item.abi === undefined
      })
    : namedTargets

// Validate before loading build-time snapshots/dependencies or replacing any artifact.
process.chdir(dir)
const { Script } = await import("@orchestra/script")
const { createSolidTransformPlugin } = await import("@opentui/solid/bun-plugin")
const { modelsData } = await import("./generate")
const { copyOmni, resolveOmni } = await import("@orchestra/script/omni")
const { copyTreeSitter, resolveTreeSitter } = await import("@orchestra/script/tree-sitter-prebuilds")
const { RipgrepBundle } = await import("@orchestra/core/ripgrep/bundle")
const plugin = createSolidTransformPlugin()
if (!targetArgs.length) await rm("dist", { recursive: true, force: true })

// Resolved before anything is built, so a release build with a missing omni artifact fails at once.
const builds = targets.map((item) => {
  const name = `cli-${item.target}`
  return { item, name, ...resolveOmni({ name, target: item.target, os: item.os, single: singleFlag }) }
})

// Each build ships the pinned rg in bin/ripgrep and never downloads one (ORCHESTRA_RIPGREP_BESIDE_BINARY below), unless
// RIPGREP_BUNDLED=false declares that the packager puts rg on PATH (Nix). ripgrep has no arm64 musl build.
const ripgrep = RipgrepBundle.enabled()
if (!ripgrep) console.warn(`${RipgrepBundle.BUNDLED}=false: no ripgrep bundled, the packager puts rg on PATH`)
for (const build of builds.filter((build) => ripgrep && !RipgrepBundle.key(build.item)))
  console.warn(`${build.name}: ripgrep publishes no build for this target, none bundled`)

if (!skipInstall) await $`bun install --frozen-lockfile --os="*" --cpu="*"`

// After the install, which owns node_modules, and before any build: a target whose bindings this host cannot provide
// stops here with the named error.
const prepared = builds.map((build) => ({
  ...build,
  treeSitter: resolveTreeSitter({
    root: path.resolve(dir, "../.."),
    artifacts: process.env.TREE_SITTER_ARTIFACTS,
    ...build.item,
  }),
}))

for (const { item, name, omni, omniFiles, treeSitter } of prepared) {
  console.log(`building ${name} (omni ${omni.enabled ? omni.id : "off"})`)
  if (targetArgs.length) await rm(`dist/${name}`, { recursive: true, force: true })
  const result = await Bun.build({
    // The omni preflight runs first and imports ./src/index.ts.
    entrypoints: ["./src/omni-entry.ts"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    external: ["node-gyp"],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    splitting: true,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: `bun-${item.target}` as Bun.Build.CompileTarget,
      outfile: `./dist/${name}/bin/${binary}${item.os === "win32" ? ".exe" : ""}`,
      execArgv: [`--user-agent=${binary}/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    define: {
      ORCHESTRA_VERSION: JSON.stringify(Script.version),
      ORCHESTRA_CLI_NAME: JSON.stringify(binary),
      ORCHESTRA_MODELS_DEV: modelsData,
      ORCHESTRA_CHANNEL: `'${Script.channel}'`,
      OMNI_ENABLED: JSON.stringify(omni.enabled),
      // A packaged CLI runs the rg in ripgrep/ beside it (or on PATH) and never downloads one.
      ORCHESTRA_RIPGREP_BESIDE_BINARY: "true",
      ORCHESTRA_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "undefined",
      // FFF_LIBC selects the fff native lib variant: "musl" or "gnu".
      FFF_LIBC: item.os === "linux" ? `'${item.abi ?? "gnu"}'` : "undefined",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  copyOmni(omniFiles, `dist/${name}/bin`)
  copyTreeSitter(treeSitter, `dist/${name}/bin/tree-sitter`, item)
  const key = RipgrepBundle.key(item)
  if (ripgrep && key)
    await RipgrepBundle.stage({
      key,
      directory: `dist/${name}/bin/ripgrep`,
      archives: process.env[RipgrepBundle.ARCHIVES],
    })

  await Bun.write(
    `./dist/${name}/package.json`,
    JSON.stringify(
      {
        name: `@orchestra/${name}`,
        version: Script.version,
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/gustavomhss/hugr-orchestra.git" },
        os: [item.os],
        cpu: [item.arch],
      },
      null,
      2,
    ),
  )
}
