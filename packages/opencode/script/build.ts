#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"
import pkg from "../package.json"
import { backendSkillsModule } from "./backend-skills"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui")

const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  await $`OPENCODE_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`
  return createEmbeddedFileMap(path.join(appDir, "dist"), (file) => !file.endsWith(".map"))
}

// A module whose default export maps each file's path under `root` to its embedded file in the binary.
const createEmbeddedFileMap = async (root: string, include: (file: string) => boolean) => {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: root })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter(include)
    .sort()
  const imports = files.map((file, i) => {
    const spec = path.relative(dir, path.join(root, file)).replaceAll("\\", "/")
    return `import file_${i} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  })
  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)
  return [
    `// Import all files as file_$i with type: "file"`,
    ...imports,
    `// Export with original mappings`,
    `export default {`,
    ...entries,
    `}`,
  ].join("\n")
}

const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()
const backendSkillsFileMap = await backendSkillsModule(path.join(dir, "../backend-specialist/skills"))
const treeSitterWorker = await Bun.file(fileURLToPath(import.meta.resolve("@opentui/core/parser.worker"))).text()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "arm64",
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

// D-L8/D-L9: the omni build each target ships, as hugr-omni's platform id. A target with `enabled: false` compiles
// with OMNI_ENABLED=false (the legacy spawner) and ships no omni files. Flip a row once WP8a publishes its omni build.
const omniTargets: Record<string, { id: string; enabled: boolean }> = {
  "linux-arm64": { id: "linux-arm64-gnu", enabled: true },
  "linux-x64": { id: "linux-x64-gnu", enabled: true },
  "linux-x64-baseline": { id: "linux-x64-gnu", enabled: true },
  "linux-arm64-musl": { id: "linux-arm64-musl", enabled: false },
  "linux-x64-musl": { id: "linux-x64-musl", enabled: false },
  "linux-x64-baseline-musl": { id: "linux-x64-musl", enabled: false },
  "darwin-arm64": { id: "darwin-arm64", enabled: true },
  "darwin-x64": { id: "darwin-x64", enabled: true },
  "darwin-x64-baseline": { id: "darwin-x64", enabled: true },
  "windows-arm64": { id: "win32-arm64-msvc", enabled: false },
  "windows-x64": { id: "win32-x64-msvc", enabled: true },
  "windows-x64-baseline": { id: "win32-x64-msvc", enabled: true },
}

// Where the addon and the supervisor for an omni id come from: OMNI_ARTIFACTS=<dir>/<id>/{hugr_omni.node,
// hugr-omni-supervisor[.exe]}, required by every build but --single. A --single build without it takes this checkout's
// packages/omni/target/{release,debug}, with a warning. The files ship next to the binary, never embedded: Bun would
// extract an embedded addon to $TMPDIR, where a planted supervisor wins (probe P1).
function omniSources(os: string, id: string) {
  const supervisor = `hugr-omni-supervisor${os === "win32" ? ".exe" : ""}`
  const artifacts = process.env.OMNI_ARTIFACTS
  if (artifacts) {
    const files = {
      addon: path.join(artifacts, id, "hugr_omni.node"),
      supervisor: path.join(artifacts, id, supervisor),
    }
    const missing = Object.values(files).filter((file) => !fs.existsSync(file))
    if (missing.length > 0) throw new Error(`omni artifact missing for ${id}: ${missing.join(", ")}`)
    return files
  }
  if (!singleFlag) throw new Error(`OMNI_ARTIFACTS is required: no omni artifacts for ${id} (OMNI_ENABLED target).`)
  const addon =
    ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[os] ??
    "libhugr_omni_node.so"
  const found = ["release", "debug"]
    .map((profile) => path.join(dir, "../omni/target", profile))
    .map((target) => ({ addon: path.join(target, addon), supervisor: path.join(target, supervisor) }))
    .find((files) => fs.existsSync(files.addon) && fs.existsSync(files.supervisor))
  if (!found) {
    console.warn(`WARNING: no OMNI_ARTIFACTS and no packages/omni/target build; this binary fails with omni on.`)
    return
  }
  console.warn(`WARNING: no OMNI_ARTIFACTS; shipping this checkout's omni build from ${path.dirname(found.addon)}.`)
  return found
}

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional Bun artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : allTargets

// Resolved before anything is built, so a release build with a missing omni artifact fails at once.
const builds = targets.map((item) => {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  const omni = omniTargets[name.slice(pkg.name.length + 1)]
  if (!omni) throw new Error(`${name} has no row in omniTargets`)
  return { item, name, omni, omniFiles: omni.enabled ? omniSources(item.os, omni.id) : undefined }
})

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const { item, name, omni, omniFiles } of builds) {
  console.log(`building ${name} (omni ${omni.enabled ? omni.id : "off"})`)
  await $`mkdir -p dist/${name}/bin`

  const workerPath = "./src/cli/tui/worker.ts"
  const treeSitterWorkerPath = "opentui-tree-sitter-worker.js"
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"

  await Bun.build({
    conditions: ["bun", "node"],
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
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/opencode`,
      execArgv: [`--user-agent=opencode/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: {
      [treeSitterWorkerPath]: treeSitterWorker,
      ...(embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {}),
      "opencode-backend-skills.gen.ts": backendSkillsFileMap,
    },
    entrypoints: [
      "./src/index.ts",
      workerPath,
      treeSitterWorkerPath,
      "opencode-backend-skills.gen.ts",
      ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : []),
    ],
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      OPENCODE_VERSION: `'${Script.version}'`,
      OPENCODE_MODELS_DEV: generated.modelsData,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + treeSitterWorkerPath,
      OPENCODE_WORKER_PATH: workerPath,
      OPENCODE_CHANNEL: `'${Script.channel}'`,
      OMNI_ENABLED: JSON.stringify(omni.enabled),
      OPENCODE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  if (omniFiles) {
    fs.copyFileSync(omniFiles.addon, `dist/${name}/bin/hugr_omni.node`)
    const supervisor = `dist/${name}/bin/${path.basename(omniFiles.supervisor)}`
    fs.copyFileSync(omniFiles.supervisor, supervisor)
    fs.chmodSync(supervisor, 0o755)
  }

  // Smoke test: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const binaryPath = `dist/${name}/bin/opencode`
    console.log(`Running smoke test: ${binaryPath} --version`)
    try {
      const versionOutput = await $`${binaryPath} --version`.text()
      console.log(`Smoke test passed: ${versionOutput.trim()}`)
    } catch (e) {
      console.error(`Smoke test failed for ${name}:`, e)
      process.exit(1)
    }
  }

  await $`rm -rf ./dist/${name}/bin/tui`
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version
}

if (Script.release) {
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }
  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz --clobber --repo ${process.env.GH_REPO}`
}

export { binaries }
