#!/usr/bin/env bun

import { $ } from "bun"
import { rm } from "fs/promises"
import path from "path"
import { Script } from "@orchestra/script"
import { copyOmni, resolveOmni } from "@orchestra/script/omni"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import pkg from "../package.json"
import { modelsData } from "./generate"
import { namedTargets } from "./targets"

const dir = path.resolve(import.meta.dirname, "..")
const binary = "orchestra"
process.chdir(dir)

await rm("dist", { recursive: true, force: true })

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()

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

// Resolved before anything is built, so a release build with a missing omni artifact fails at once.
const builds = targets.map((item) => {
  const name = `cli-${item.target}`
  return { item, name, ...resolveOmni({ name, target: item.target, os: item.os, single: singleFlag }) }
})

if (!skipInstall) await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`

for (const { item, name, omni, omniFiles } of builds) {
  console.log(`building ${name} (omni ${omni.enabled ? omni.id : "off"})`)
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
      ORCHESTRA_VERSION: `'${Script.version}'`,
      ORCHESTRA_CLI_NAME: `'${binary}'`,
      ORCHESTRA_MODELS_DEV: modelsData,
      ORCHESTRA_CHANNEL: `'${Script.channel}'`,
      OMNI_ENABLED: JSON.stringify(omni.enabled),
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

  await Bun.write(
    `./dist/${name}/package.json`,
    JSON.stringify(
      {
        name: `@orchestra/${name}`,
        version: Script.version,
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/anomalyco/opencode.git" },
        os: [item.os],
        cpu: [item.arch],
      },
      null,
      2,
    ),
  )
}
