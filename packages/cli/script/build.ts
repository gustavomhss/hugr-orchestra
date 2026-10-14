#!/usr/bin/env bun

import { $ } from "bun"
import { lstat, realpath, rm } from "fs/promises"
import path from "path"
import { namedTargets } from "./targets"

const dir = path.resolve(import.meta.dirname, "..")
const binary = "orchestra"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const compileEvidence = !process.argv.includes("--no-compile-evidence")

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
const { packagedSkills } = await import("./packaged-skills")
const skillTrees = await packagedSkills()
const plugin = createSolidTransformPlugin()
if (!targetArgs.length) await rm("dist", { recursive: true, force: true })

// Resolved before anything is built, so a release build with a missing omni artifact fails at once.
const builds = targets.map((item) => {
  const name = `cli-${item.target}`
  return { item, name, ...resolveOmni({ name, target: item.target, os: item.os, single: singleFlag }) }
})

// Each build ships the pinned rg in bin/ripgrep and never downloads one (ORCHESTRA_RIPGREP_BESIDE_BINARY below), unless
// RIPGREP_BUNDLED=false declares that the packager puts rg on PATH (Nix).
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
  const options: Bun.BuildConfig = {
    // The omni preflight runs first and imports ./src/index.ts.
    entrypoints: ["./src/omni-entry.ts"],
    target: "bun",
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    metafile: compileEvidence,
    external: ["node-gyp"],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    splitting: true,
    define: {
      // Noncompile analysis needs the same native constants as --compile so
      // foreign optional dependency branches disappear before resolution.
      "process.platform": JSON.stringify(item.os),
      "process.arch": JSON.stringify(item.arch),
      ORCHESTRA_VERSION: JSON.stringify(Script.version),
      ORCHESTRA_CLI_NAME: JSON.stringify(binary),
      ORCHESTRA_MODELS_DEV: modelsData,
      ORCHESTRA_PACKAGED_SKILLS: JSON.stringify(skillTrees),
      ORCHESTRA_CHANNEL: `'${Script.channel}'`,
      OMNI_ENABLED: JSON.stringify(omni.enabled),
      // A packaged CLI runs the rg in ripgrep/ beside it (or on PATH) and never downloads one.
      ORCHESTRA_RIPGREP_BESIDE_BINARY: "true",
      ORCHESTRA_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "undefined",
      // FFF_LIBC selects the fff native lib variant: "musl" or "gnu".
      FFF_LIBC: item.os === "linux" ? `'${item.abi ?? "gnu"}'` : "undefined",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  }
  const toolchain = compileEvidence ? await solidToolchain() : undefined
  // Original, unwrapped plugin in BOTH builds. Catch-all onLoad observers corrupt
  // Bun 1.3.14 FILE-asset bookkeeping under --compile (appendIsolatedHashesForImportedChunks).
  // No outdir/compile: the analysis outputs are memory-only and are never shipped.
  const analysis = compileEvidence ? await Bun.build({ ...options, sourcemap: sourcemapsFlag ? "external" : "none" }) : undefined
  const analysisMetafile = analysis?.metafile
  if (analysis && (!analysis.success || !analysisMetafile || !Object.keys(analysisMetafile.inputs).length))
    throw new Error("CLI_COMPILER_ANALYSIS_FAILED_OR_EMPTY")
  const before = analysisMetafile ? await Promise.all(Object.keys(analysisMetafile.inputs).map(async (key): Promise<CompilerInput> => {
    const source = await sourceFile(path.resolve(dir, key))
    const replacement = /[/\\]node_modules[/\\]solid-js[/\\]dist[/\\]server\.js$/.test(source.path)
      ? "solid.js"
      : /[/\\]node_modules[/\\]solid-js[/\\]store[/\\]dist[/\\]server\.js$/.test(source.path) ? "store.js" : undefined
    const backing = replacement ? await sourceFile(path.join(path.dirname(source.path), replacement)) : undefined
    const packageFile = replacement ? await sourceFile(path.resolve(path.dirname(source.path), replacement === "solid.js" ? "../package.json" : "../../package.json")) : undefined
    const packageData = packageFile ? await Bun.file(packageFile.path).json() : undefined
    if (packageFile && (!packageData || packageData.name !== "solid-js" || !["1.9.10", "1.9.12"].includes(packageData.version)))
      throw new Error(`CLI_SOLID_RUNTIME_VERSION_UNAUDITED: ${source.path}`)
    if (backing && backing.bytes !== analysisMetafile.inputs[key].bytes) throw new Error(`CLI_SOLID_BACKING_CONTENT_SIZE_MISMATCH: ${key}`)
    return { analysisKey: key, ...source, capture: "raw-resolved-file" as const,
      analysisBytes: analysisMetafile.inputs[key].bytes,
      transform: replacement ? "solid-runtime-replacement" as const
        : /\.[cm]?[jt]sx$/.test(source.path) && !source.path.includes(`${path.sep}node_modules${path.sep}`)
          ? "solid-jsx-babel" as const : "bun-native" as const,
      ...(backing && packageFile ? { backing, packageFile, packageVersion: String(packageData.version), loader: "js" as const } : {}),
    }
  })) : []
  const observed = new Map(before.map((input) => [input.path, input]))
  const result = await Bun.build({ ...options, compile: {
    autoloadBunfig: false,
    autoloadDotenv: false,
    autoloadTsconfig: true,
    autoloadPackageJson: true,
    target: `bun-${item.target}` as Bun.Build.CompileTarget,
    outfile: `./dist/${name}/bin/${binary}${item.os === "win32" ? ".exe" : ""}`,
    execArgv: [`--user-agent=${binary}/${Script.version}`, "--use-system-ca", "--"],
    windows: {},
  } })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  if (compileEvidence) {
    const metafile = result.metafile
    if (!metafile || !Object.keys(metafile.inputs).length || !Object.keys(metafile.outputs).length)
      throw new Error("CLI_COMPILE_METAFILE_MISSING_OR_EMPTY")
    const inputs = await Promise.all(Object.keys(metafile.inputs).map(async (key) => {
      const canonical = await realpath(path.resolve(dir, key)).catch((cause: unknown) => {
        throw new Error(`CLI_COMPILER_INPUT_NOT_OBSERVED: ${key}`, { cause })
      })
      const input = observed.get(canonical)
      if (!input) throw new Error(`CLI_COMPILER_INPUT_NOT_OBSERVED: ${key}`)
      if (JSON.stringify(await sourceFile(canonical)) !== JSON.stringify({ path: input.path, bytes: input.bytes, sha256: input.sha256, gitBlob: input.gitBlob }))
        throw new Error(`CLI_COMPILER_INPUT_CHANGED_DURING_BUILD: ${key}`)
      if (input.analysisBytes !== metafile.inputs[key].bytes) throw new Error(`CLI_COMPILER_EFFECTIVE_INPUT_CHANGED: ${key}`)
      if (input.backing) {
        if (!input.packageFile || JSON.stringify(await sourceFile(input.backing.path)) !== JSON.stringify(input.backing) ||
            JSON.stringify(await sourceFile(input.packageFile.path)) !== JSON.stringify(input.packageFile))
          throw new Error(`CLI_SOLID_BACKING_CHANGED_DURING_BUILD: ${key}`)
      }
      return { key, ...input, compilerBytes: metafile.inputs[key].bytes }
    }))
    if (inputs.length !== before.length || new Set(inputs.map((input) => input.path)).size !== observed.size ||
        before.some((input) => !inputs.some((compiled) => compiled.path === input.path)))
      throw new Error("CLI_COMPILER_ANALYSIS_INPUT_SET_DIFFERENT")
    if (JSON.stringify(await solidToolchain()) !== JSON.stringify(toolchain)) throw new Error("CLI_SOLID_TOOLCHAIN_CHANGED_DURING_BUILD")
    const executable = path.resolve(dir, `dist/${name}/bin/${binary}${item.os === "win32" ? ".exe" : ""}`)
    if (!(await lstat(executable)).isFile()) throw new Error("CLI_COMPILE_BINARY_NOT_REGULAR")
    // Sibling of the payload root: distribution-payload admits only package.json
    // and bin/**. Versioned sibling survives the next native buildVersions turn.
    await Bun.write(path.join(dir, "dist", `compile-evidence-${item.target}-${Script.version}.json`), JSON.stringify({
      schema: "orchestra-compile-evidence-v2", bun: process.versions.bun, cwd: await realpath(dir),
      version: Script.version, target: item.target, entrypoints: ["./src/omni-entry.ts"],
      binary: { path: executable, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(executable).arrayBuffer()).digest("hex") },
      inputs, metafile, analysisMetafile,
      transformLedger: { toolchain, scope: "Raw resolved files and audited backing files captured before/after original-plugin compile; JSX effective data is compiler byte-count evidence, not a claimed raw-file hash" },
    }, null, 2))
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

type CompilerInput = Awaited<ReturnType<typeof sourceFile>> & {
  analysisKey: string
  capture: "raw-resolved-file"
  analysisBytes: number
  transform: "bun-native" | "solid-runtime-replacement" | "solid-jsx-babel"
  backing?: Awaited<ReturnType<typeof sourceFile>>
  packageFile?: Awaited<ReturnType<typeof sourceFile>>
  packageVersion?: string
  loader?: "js"
}

async function sourceFile(file: string) {
  const canonical = await realpath(file).catch((cause: unknown) => {
    throw new Error(`CLI_COMPILER_SOURCE_UNOBSERVED: ${file}`, { cause })
  })
  if (!(await lstat(canonical)).isFile()) throw new Error(`CLI_COMPILER_SOURCE_NOT_REGULAR: ${file}`)
  const bytes = new Uint8Array(await Bun.file(canonical).arrayBuffer())
  return { path: canonical, bytes: bytes.byteLength,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    gitBlob: new Bun.CryptoHasher("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex") }
}

async function solidToolchain() {
  const plugin = await sourceFile(Bun.resolveSync("@opentui/solid/bun-plugin", dir))
  const transform = await sourceFile(path.join(path.dirname(plugin.path), "solid-transform.js"))
  const packageFile = await sourceFile(path.resolve(path.dirname(plugin.path), "../package.json"))
  const metadata = await Bun.file(packageFile.path).json()
  if (metadata.name !== "@opentui/solid" || metadata.version !== "0.4.5" ||
      plugin.gitBlob !== "28c0b12271d07444f36b81cb36f1f332b76bbe4b" || transform.gitBlob !== "6987446ee22b4fc9e6544e913524b1f243dc36db")
    throw new Error("CLI_SOLID_PLUGIN_SOURCE_UNAUDITED")
  return { name: metadata.name, version: metadata.version, plugin, transform, packageFile,
    lockfile: await sourceFile(path.resolve(dir, "../../bun.lock")) }
}
