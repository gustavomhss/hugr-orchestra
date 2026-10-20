import path from "path"
import os from "os"
import { Global } from "@orchestra/core/global"
import { text } from "node:stream/consumers"
import fs from "fs/promises"
import { which } from "@orchestra/core/util/which"
import { Module } from "@orchestra/core/util/module"
import { confined, type Child } from "./launch"
import { Npm } from "@orchestra/core/npm"
import { exists, readText, write, writeStream, findUp, up, extractZip, pathExists, run, output, NearestRoot, StrictNearestRoot, type Info } from "./server-support"

export const CSharp: Info = {
  id: "csharp",
  root: NearestRoot([".slnx", ".sln", ".csproj", "global.json"]),
  extensions: [".cs", ".csx"],
  async spawn(root, _ctx, flags) {
    const bin = await getRoslynLanguageServer(flags.disableLspDownload)
    if (!bin) return

    return {
      process: await confined(bin, ["--stdio", "--autoLoadProjects"], {
        cwd: root,
      }),
    }
  },
}

export const Razor: Info = {
  id: "razor",
  root: NearestRoot([".slnx", ".sln", ".csproj", "global.json"]),
  extensions: [".razor", ".cshtml"],
  async spawn(root, _ctx, flags) {
    const bin = await getRoslynLanguageServer(flags.disableLspDownload)
    if (!bin) return

    const razor = await findVscodeRazorExtension()
    if (!razor) {
      return
    }

    return {
      process: await confined(
        bin,
        [
          "--stdio",
          "--autoLoadProjects",
          `--razorSourceGenerator=${razor.compiler}`,
          `--razorDesignTimePath=${razor.targets}`,
          "--extension",
          razor.extension,
        ],
        {
          cwd: root,
        },
      ),
    }
  },
}

let roslynLanguageServerInstall: Promise<string | undefined> | undefined

async function getRoslynLanguageServer(disableLspDownload?: boolean) {
  const existing = which("roslyn-language-server")
  if (existing) return existing

  const global = await roslynLanguageServerGlobalPath()
  if (global) return global

  roslynLanguageServerInstall ||= installRoslynLanguageServer(disableLspDownload).finally(() => {
    roslynLanguageServerInstall = undefined
  })
  return roslynLanguageServerInstall
}

async function installRoslynLanguageServer(disableLspDownload?: boolean) {
  if (!which("dotnet")) {
    return
  }

  if (disableLspDownload) return
  const result = await run(["dotnet", "tool", "install", "--global", "roslyn-language-server", "--prerelease"])
  if (result.code !== 0) {
    return
  }

  const resolved = which("roslyn-language-server")
  if (resolved) {
    return resolved
  }

  const global = await roslynLanguageServerGlobalPath()
  if (global) {
    return global
  }
}

async function roslynLanguageServerGlobalPath() {
  const bin = path.join(
    process.env.DOTNET_CLI_HOME ?? os.homedir(),
    ".dotnet",
    "tools",
    "roslyn-language-server" + (process.platform === "win32" ? ".cmd" : ""),
  )
  return (await pathExists(bin)) ? bin : undefined
}

async function findVscodeRazorExtension() {
  const roots = [
    process.env.VSCODE_EXTENSIONS,
    path.join(os.homedir(), ".vscode", "extensions"),
    path.join(os.homedir(), ".vscode-insiders", "extensions"),
    path.join(os.homedir(), ".vscode-server", "extensions"),
    path.join(os.homedir(), ".vscode-server-insiders", "extensions"),
  ].filter((item) => item !== undefined)

  for (const root of [...new Set(roots)]) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("ms-dotnettools.csharp-"))
        .map(async (entry) => ({
          path: path.join(root, entry.name, ".razorExtension"),
          modified: (await fs.stat(path.join(root, entry.name)).catch(() => undefined))?.mtimeMs ?? 0,
        })),
    )
    for (const entry of candidates.sort((a, b) => b.modified - a.modified).map((candidate) => candidate.path)) {
      const result = {
        compiler: path.join(entry, "Microsoft.CodeAnalysis.Razor.Compiler.dll"),
        targets: path.join(entry, "Targets", "Microsoft.NET.Sdk.Razor.DesignTime.targets"),
        extension: path.join(entry, "Microsoft.VisualStudioCode.RazorExtension.dll"),
      }
      if (
        (await pathExists(result.compiler)) &&
        (await pathExists(result.targets)) &&
        (await pathExists(result.extension))
      ) {
        return result
      }
    }
  }
}

export const FSharp: Info = {
  id: "fsharp",
  root: NearestRoot([".slnx", ".sln", ".fsproj", "global.json"]),
  extensions: [".fs", ".fsi", ".fsx", ".fsscript"],
  async spawn(root, _ctx, flags) {
    let bin = which("fsautocomplete")
    if (!bin) {
      if (!which("dotnet")) {
        return
      }

      if (flags.disableLspDownload) return
      const result = await run(["dotnet", "tool", "install", "fsautocomplete", "--tool-path", Global.Path.bin])
      if (result.code !== 0) {
        return
      }

      bin = path.join(Global.Path.bin, "fsautocomplete" + (process.platform === "win32" ? ".exe" : ""))
    }

    return {
      process: await confined(bin, {
        cwd: root,
      }),
    }
  },
}

export const SourceKit: Info = {
  id: "sourcekit-lsp",
  extensions: [".swift", ".objc", "objcpp"],
  root: NearestRoot(["Package.swift", "*.xcodeproj", "*.xcworkspace"]),
  async spawn(root) {
    // Check if sourcekit-lsp is available in the PATH
    // This is installed with the Swift toolchain
    const sourcekit = which("sourcekit-lsp")
    if (sourcekit) {
      return {
        process: await confined(sourcekit, {
          cwd: root,
        }),
      }
    }

    // If sourcekit-lsp not found, check if xcrun is available
    // This is specific to macOS where sourcekit-lsp is typically installed with Xcode
    if (!which("xcrun")) return

    const lspLoc = await output(["xcrun", "--find", "sourcekit-lsp"])

    if (lspLoc.code !== 0) return

    const bin = lspLoc.text.trim()

    return {
      process: await confined(bin, {
        cwd: root,
      }),
    }
  },
}

export const RustAnalyzer: Info = {
  id: "rust",
  root: async (file, ctx) => {
    const crateRoot = await NearestRoot(["Cargo.toml", "Cargo.lock"])(file, ctx)
    if (crateRoot === undefined) {
      return undefined
    }
    let currentDir = crateRoot

    while (currentDir !== path.dirname(currentDir)) {
      // Stop at filesystem root
      const cargoTomlPath = path.join(currentDir, "Cargo.toml")
      try {
        const cargoTomlContent = await readText(cargoTomlPath)
        if (cargoTomlContent.includes("[workspace]")) {
          return currentDir
        }
      } catch {
        // File doesn't exist or can't be read, continue searching up
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir

      // Stop if we've gone above the app root
      if (!currentDir.startsWith(ctx.worktree)) break
    }

    return crateRoot
  },
  extensions: [".rs"],
  async spawn(root) {
    const bin = which("rust-analyzer")
    if (!bin) {
      return
    }
    return {
      process: await confined(bin, {
        cwd: root,
      }),
    }
  },
}

export const Clangd: Info = {
  id: "clangd",
  root: NearestRoot(["compile_commands.json", "compile_flags.txt", ".clangd"]),
  extensions: [".c", ".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hh", ".hxx", ".h++"],
  async spawn(root, _ctx, flags) {
    const args = ["--background-index", "--clang-tidy"]
    const fromPath = which("clangd")
    if (fromPath) {
      return {
        process: await confined(fromPath, args, {
          cwd: root,
        }),
      }
    }

    const ext = process.platform === "win32" ? ".exe" : ""
    const direct = path.join(Global.Path.bin, "clangd" + ext)
    if (await exists(direct)) {
      return {
        process: await confined(direct, args, {
          cwd: root,
        }),
      }
    }

    const entries = await fs.readdir(Global.Path.bin, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!entry.name.startsWith("clangd_")) continue
      const candidate = path.join(Global.Path.bin, entry.name, "bin", "clangd" + ext)
      if (await exists(candidate)) {
        return {
          process: await confined(candidate, args, {
            cwd: root,
          }),
        }
      }
    }

    if (flags.disableLspDownload) return

    const releaseResponse = await fetch("https://api.github.com/repos/clangd/clangd/releases/latest")
    if (!releaseResponse.ok) {
      return
    }

    const release: {
      tag_name?: string
      assets?: { name?: string; browser_download_url?: string }[]
    } = await releaseResponse.json()

    const tag = release.tag_name
    if (!tag) {
      return
    }
    const platform = process.platform
    const tokens: Record<string, string> = {
      darwin: "mac",
      linux: "linux",
      win32: "windows",
    }
    const token = tokens[platform]
    if (!token) {
      return
    }

    const assets = release.assets ?? []
    const valid = (item: { name?: string; browser_download_url?: string }) => {
      if (!item.name) return false
      if (!item.browser_download_url) return false
      if (!item.name.includes(token)) return false
      return item.name.includes(tag)
    }

    const asset =
      assets.find((item) => valid(item) && item.name?.endsWith(".zip")) ??
      assets.find((item) => valid(item) && item.name?.endsWith(".tar.xz")) ??
      assets.find((item) => valid(item))
    if (!asset?.name || !asset.browser_download_url) {
      return
    }

    const name = asset.name
    const downloadResponse = await fetch(asset.browser_download_url)
    if (!downloadResponse.ok) {
      return
    }

    const archive = path.join(Global.Path.bin, name)
    const buf = await downloadResponse.arrayBuffer()
    if (buf.byteLength === 0) {
      return
    }
    await write(archive, Buffer.from(buf))

    const zip = name.endsWith(".zip")
    const tar = name.endsWith(".tar.xz")
    if (!zip && !tar) {
      return
    }

    if (zip) {
      const ok = await extractZip(archive, Global.Path.bin)
      if (!ok) return
    }
    if (tar) {
      await run(["tar", "-xf", archive], { cwd: Global.Path.bin })
    }
    await fs.rm(archive, { force: true })

    const bin = path.join(Global.Path.bin, "clangd_" + tag, "bin", "clangd" + ext)
    if (!(await exists(bin))) {
      return
    }

    if (platform !== "win32") {
      await fs.chmod(bin, 0o755).catch(() => {})
    }

    await fs.unlink(path.join(Global.Path.bin, "clangd")).catch(() => {})
    await fs.symlink(bin, path.join(Global.Path.bin, "clangd")).catch(() => {})

    return {
      process: await confined(bin, args, {
        cwd: root,
      }),
    }
  },
}

export const Svelte: Info = {
  id: "svelte",
  extensions: [".svelte"],
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root, _ctx, flags) {
    let binary = which("svelteserver")
    const args: string[] = []
    if (!binary) {
      if (flags.disableLspDownload) return
      const resolved = await Npm.which("svelte-language-server")
      if (!resolved) return
      binary = resolved
    }
    args.push("--stdio")
    const proc = await confined(binary, args, {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
      initialization: {},
    }
  },
}

export const Astro: Info = {
  id: "astro",
  extensions: [".astro"],
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root, ctx, flags) {
    const tsserver = Module.resolve("typescript/lib/tsserver.js", ctx.directory)
    if (!tsserver) {
      return
    }
    const tsdk = path.dirname(tsserver)

    let binary = which("astro-ls")
    const args: string[] = []
    if (!binary) {
      if (flags.disableLspDownload) return
      const resolved = await Npm.which("@astrojs/language-server")
      if (!resolved) return
      binary = resolved
    }
    args.push("--stdio")
    const proc = await confined(binary, args, {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
      initialization: {
        typescript: {
          tsdk,
        },
      },
    }
  },
}

function isModuleOf(pomContent: string, modulePath: string): boolean {
  const normalized = modulePath.replace(/\\/g, "/").replace(/\/$/, "")
  if (!normalized) return false
  const modulesBlocks = pomContent.match(/<modules>([\s\S]*?)<\/modules>/g) ?? []
  for (const block of modulesBlocks) {
    const stripped = block.replace(/<!--[\s\S]*?-->/g, "")
    for (const m of stripped.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
      const decl = m[1].replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "")
      if (decl === normalized) return true
    }
  }
  return false
}

export const JDTLS: Info = {
  id: "jdtls",
  root: async (file, ctx) => {
    const settingsMarkers = ["settings.gradle", "settings.gradle.kts"]
    const gradleMarkers = ["gradlew", "gradlew.bat"]
    // 1. Gradle (unchanged from original logic)
    const [wrapperRoot, settingsRoot] = await Promise.all([
      StrictNearestRoot(gradleMarkers, settingsMarkers)(file, ctx),
      StrictNearestRoot(settingsMarkers)(file, ctx),
    ])
    if (wrapperRoot) return wrapperRoot
    if (settingsRoot) return settingsRoot

    // 2. Gradle single-project fallback (build.gradle without settings.gradle)
    const buildRoot = await StrictNearestRoot(["build.gradle", "build.gradle.kts"])(file, ctx)
    if (buildRoot) return buildRoot

    // 3. Maven: walk up pom.xml chain verifying <module> relationships
    const pomFiles = await findUp("pom.xml", path.dirname(file), ctx.directory)
    if (pomFiles.length > 0) {
      let root = path.dirname(pomFiles[0])
      for (let i = 1; i < pomFiles.length; i++) {
        const parentDir = path.dirname(pomFiles[i])
        const rel = path.relative(parentDir, root)
        const content = await fs.readFile(pomFiles[i], "utf-8").catch(() => null)
        if (content && isModuleOf(content, rel)) {
          root = parentDir
        } else {
          break
        }
      }
      return root
    }

    // 4. Eclipse native project fallback
    const eclipseRoot = await StrictNearestRoot([".project", ".classpath"])(file, ctx)
    if (eclipseRoot) return eclipseRoot

    return undefined
  },
  extensions: [".java"],
  async spawn(root, _ctx, flags) {
    const java = which("java")
    if (!java) {
      return
    }
    const javaMajorVersion = await run(["java", "-version"]).then((result) => {
      const m = /"(\d+)\.\d+\.\d+"/.exec(result.stderr.toString())
      return !m ? undefined : parseInt(m[1])
    })
    if (javaMajorVersion == null || javaMajorVersion < 21) {
      return
    }
    const distPath = path.join(Global.Path.bin, "jdtls")
    const launcherDir = path.join(distPath, "plugins")
    const installed = await pathExists(launcherDir)
    if (!installed) {
      if (flags.disableLspDownload) return
      await fs.mkdir(distPath, { recursive: true })
      const releaseURL =
        "https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz"
      const archiveName = "release.tar.gz"

      const download = await fetch(releaseURL)
      if (!download.ok || !download.body) {
        return
      }
      await writeStream(path.join(distPath, archiveName), download.body)

      const tarResult = await run(["tar", "-xzf", archiveName], { cwd: distPath })
      if (tarResult.code !== 0) {
        return
      }

      await fs.rm(path.join(distPath, archiveName), { force: true })
    }
    const jarFileName =
      (await fs.readdir(launcherDir).catch(() => []))
        .find((item) => /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(item))
        ?.trim() ?? ""
    const launcherJar = path.join(launcherDir, jarFileName)
    if (!(await pathExists(launcherJar))) {
      return
    }
    const configFile = path.join(
      distPath,
      (() => {
        switch (process.platform) {
          case "darwin":
            return "config_mac"
          case "linux":
            return "config_linux"
          case "win32":
            return "config_win"
          default:
            return "config_linux"
        }
      })(),
    )
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-jdtls-data"))
    return {
      process: await confined(
        java,
        [
          "-jar",
          launcherJar,
          "-configuration",
          configFile,
          "-data",
          dataDir,
          "-Declipse.application=org.eclipse.jdt.ls.core.id1",
          "-Dosgi.bundles.defaultStartLevel=4",
          "-Declipse.product=org.eclipse.jdt.ls.core.product",
          "-Dlog.level=ALL",
          "--add-modules=ALL-SYSTEM",
          "--add-opens java.base/java.util=ALL-UNNAMED",
          "--add-opens java.base/java.lang=ALL-UNNAMED",
        ],
        {
          cwd: root,
        },
      ),
    }
  },
}

export const KotlinLS: Info = {
  id: "kotlin-ls",
  extensions: [".kt", ".kts"],
  root: async (file, ctx) => {
    // 1) Nearest Gradle root (multi-project or included build)
    const settingsRoot = await NearestRoot(["settings.gradle.kts", "settings.gradle"])(file, ctx)
    if (settingsRoot) return settingsRoot
    // 2) Gradle wrapper (strong root signal)
    const wrapperRoot = await NearestRoot(["gradlew", "gradlew.bat"])(file, ctx)
    if (wrapperRoot) return wrapperRoot
    // 3) Single-project or module-level build
    const buildRoot = await NearestRoot(["build.gradle.kts", "build.gradle"])(file, ctx)
    if (buildRoot) return buildRoot
    // 4) Maven fallback
    return NearestRoot(["pom.xml"])(file, ctx)
  },
  async spawn(root, _ctx, flags) {
    const distPath = path.join(Global.Path.bin, "kotlin-ls")
    const launcherScript =
      process.platform === "win32" ? path.join(distPath, "kotlin-lsp.cmd") : path.join(distPath, "kotlin-lsp.sh")
    const installed = await exists(launcherScript)
    if (!installed) {
      if (flags.disableLspDownload) return

      const releaseResponse = await fetch("https://api.github.com/repos/Kotlin/kotlin-lsp/releases/latest")
      if (!releaseResponse.ok) {
        return
      }

      const release = await releaseResponse.json()
      const version = release.name?.replace(/^v/, "")

      if (!version) {
        return
      }

      const platform = process.platform
      const arch = process.arch

      let kotlinArch: string = arch
      if (arch === "arm64") kotlinArch = "aarch64"
      else if (arch === "x64") kotlinArch = "x64"

      let kotlinPlatform: string = platform
      if (platform === "darwin") kotlinPlatform = "mac"
      else if (platform === "linux") kotlinPlatform = "linux"
      else if (platform === "win32") kotlinPlatform = "win"

      const supportedCombos = ["mac-x64", "mac-aarch64", "linux-x64", "linux-aarch64", "win-x64", "win-aarch64"]

      const combo = `${kotlinPlatform}-${kotlinArch}`

      if (!supportedCombos.includes(combo)) {
        return
      }

      const assetName = `kotlin-lsp-${version}-${kotlinPlatform}-${kotlinArch}.zip`
      const releaseURL = `https://download-cdn.jetbrains.com/kotlin-lsp/${version}/${assetName}`

      await fs.mkdir(distPath, { recursive: true })
      const archivePath = path.join(distPath, "kotlin-ls.zip")
      const download = await fetch(releaseURL)
      if (!download.ok || !download.body) {
        return
      }
      await writeStream(archivePath, download.body)
      const ok = await extractZip(archivePath, distPath)
      if (!ok) return
      await fs.rm(archivePath, { force: true })
      if (process.platform !== "win32") {
        await fs.chmod(launcherScript, 0o755).catch(() => {})
      }
    }
    if (!(await exists(launcherScript))) {
      return
    }
    return {
      process: await confined(launcherScript, ["--stdio"], {
        cwd: root,
      }),
    }
  },
}

export const YamlLS: Info = {
  id: "yaml-ls",
  extensions: [".yaml", ".yml"],
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root, _ctx, flags) {
    let binary = which("yaml-language-server")
    const args: string[] = []
    if (!binary) {
      if (flags.disableLspDownload) return
      const resolved = await Npm.which("yaml-language-server")
      if (!resolved) return
      binary = resolved
    }
    args.push("--stdio")
    const proc = await confined(binary, args, {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
    }
  },
}
