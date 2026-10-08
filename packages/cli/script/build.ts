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
const plugin = createSolidTransformPlugin()
if (!targetArgs.length) await rm("dist", { recursive: true, force: true })

if (!skipInstall) await $`bun install --frozen-lockfile --os="*" --cpu="*"`

for (const item of targets) {
  const name = `cli-${item.target}`
  console.log(`building ${name}`)
  if (targetArgs.length) await rm(`dist/${name}`, { recursive: true, force: true })
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
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
