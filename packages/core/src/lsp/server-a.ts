import path from "path"
import { Global } from "@orchestra/core/global"
import { text } from "node:stream/consumers"
import fs from "fs/promises"
import { which } from "@orchestra/core/util/which"
import { Module } from "@orchestra/core/util/module"
import { confined, type Child } from "./launch"
import { Npm } from "@orchestra/core/npm"
import { exists, writeStream, up, extractZip, run, NearestRoot, type Info } from "./server-support"

export const Deno: Info = {
  id: "deno",
  root: async (file, ctx) => {
    const files = up({
      targets: ["deno.json", "deno.jsonc"],
      start: path.dirname(file),
      stop: ctx.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return undefined
    return path.dirname(first.value)
  },
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
  async spawn(root) {
    const deno = which("deno")
    if (!deno) {
      return
    }
    return {
      process: await confined(deno, ["lsp"], {
        cwd: root,
      }),
    }
  },
}

export const Typescript: Info = {
  id: "typescript",
  root: NearestRoot(
    ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"],
    ["deno.json", "deno.jsonc"],
  ),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  async spawn(root, ctx) {
    const tsserver = Module.resolve("typescript/lib/tsserver.js", ctx.directory)
    if (!tsserver) return
    const bin = await Npm.which("typescript-language-server")
    if (!bin) return
    const proc = await confined(bin, ["--stdio"], {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
      initialization: {
        tsserver: {
          path: tsserver,
        },
      },
    }
  },
}

export const Vue: Info = {
  id: "vue",
  extensions: [".vue"],
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root, _ctx, flags) {
    let binary = which("vue-language-server")
    const args: string[] = []
    if (!binary) {
      if (flags.disableLspDownload) return
      const resolved = await Npm.which("@vue/language-server")
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
        // Leave empty; the server will auto-detect workspace TypeScript.
      },
    }
  },
}

export const ESLint: Info = {
  id: "eslint",
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue"],
  async spawn(root, ctx, flags) {
    const eslint = Module.resolve("eslint", ctx.directory)
    if (!eslint) return
    const serverPath = path.join(Global.Path.bin, "vscode-eslint", "server", "out", "eslintServer.js")
    if (!(await exists(serverPath))) {
      if (flags.disableLspDownload) return
      const response = await fetch("https://github.com/microsoft/vscode-eslint/archive/refs/heads/main.zip")
      if (!response.ok) return

      const zipPath = path.join(Global.Path.bin, "vscode-eslint.zip")
      if (response.body) await writeStream(zipPath, response.body)

      const ok = await extractZip(zipPath, Global.Path.bin)
      if (!ok) return
      await fs.rm(zipPath, { force: true })

      const extractedPath = path.join(Global.Path.bin, "vscode-eslint-main")
      const finalPath = path.join(Global.Path.bin, "vscode-eslint")

      const stats = await fs.stat(finalPath).catch(() => undefined)
      if (stats) {
        await fs.rm(finalPath, { force: true, recursive: true })
      }
      await fs.rename(extractedPath, finalPath)

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
      await run([npmCmd, "install"], { cwd: finalPath })
      await run([npmCmd, "run", "compile"], { cwd: finalPath })
    }

    const proc = await confined("node", [serverPath, "--stdio"], {
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

export const Oxlint: Info = {
  id: "oxlint",
  root: NearestRoot([
    ".oxlintrc.json",
    "package-lock.json",
    "bun.lockb",
    "bun.lock",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package.json",
  ]),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".astro", ".svelte"],
  async spawn(root, ctx) {
    const ext = process.platform === "win32" ? ".cmd" : ""

    const serverTarget = path.join("node_modules", ".bin", "oxc_language_server" + ext)
    const lintTarget = path.join("node_modules", ".bin", "oxlint" + ext)

    const resolveBin = async (target: string) => {
      const localBin = path.join(root, target)
      if (await exists(localBin)) return localBin

      const candidates = up({
        targets: [target],
        start: root,
        stop: ctx.worktree,
      })
      const first = await candidates.next()
      await candidates.return()
      if (first.value) return first.value

      return undefined
    }

    let lintBin = await resolveBin(lintTarget)
    if (!lintBin) {
      const found = which("oxlint")
      if (found) lintBin = found
    }

    if (lintBin) {
      const proc = await confined(lintBin, ["--help"])
      await proc.exited
      if (proc.stdout) {
        const help = await text(proc.stdout)
        if (help.includes("--lsp")) {
          return {
            process: await confined(lintBin, ["--lsp"], {
              cwd: root,
            }),
          }
        }
      }
    }

    let serverBin = await resolveBin(serverTarget)
    if (!serverBin) {
      const found = which("oxc_language_server")
      if (found) serverBin = found
    }
    if (serverBin) {
      return {
        process: await confined(serverBin, [], {
          cwd: root,
        }),
      }
    }

    return
  },
}

export const Biome: Info = {
  id: "biome",
  root: NearestRoot([
    "biome.json",
    "biome.jsonc",
    "package-lock.json",
    "bun.lockb",
    "bun.lock",
    "pnpm-lock.yaml",
    "yarn.lock",
  ]),
  extensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".json",
    ".jsonc",
    ".vue",
    ".astro",
    ".svelte",
    ".css",
    ".graphql",
    ".gql",
    ".html",
  ],
  async spawn(root) {
    const localBin = path.join(root, "node_modules", ".bin", "biome")
    let bin: string | undefined
    if (await exists(localBin)) bin = localBin
    if (!bin) {
      const found = which("biome")
      if (found) bin = found
    }

    let args = ["lsp-proxy", "--stdio"]

    if (!bin) {
      const resolved = Module.resolve("biome", root)
      if (!resolved) return
      bin = await Npm.which("biome")
      if (!bin) return
      args = ["lsp-proxy", "--stdio"]
    }

    const proc = await confined(bin, args, {
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

export const Gopls: Info = {
  id: "gopls",
  root: async (file, ctx) => {
    const work = await NearestRoot(["go.work"])(file, ctx)
    if (work) return work
    return NearestRoot(["go.mod", "go.sum"])(file, ctx)
  },
  extensions: [".go"],
  async spawn(root, _ctx, flags) {
    let bin = which("gopls")
    if (!bin) {
      if (!which("go")) return
      if (flags.disableLspDownload) return

      const result = await run(["go", "install", "golang.org/x/tools/gopls@latest"], { env: { ...process.env, GOBIN: Global.Path.bin } })
      if (result.code !== 0) {
        return
      }
      bin = path.join(Global.Path.bin, "gopls" + (process.platform === "win32" ? ".exe" : ""))
    }
    return {
      process: await confined(bin!, {
        cwd: root,
      }),
    }
  },
}

export const Rubocop: Info = {
  id: "ruby-lsp",
  root: NearestRoot(["Gemfile"]),
  extensions: [".rb", ".rake", ".gemspec", ".ru"],
  async spawn(root, _ctx, flags) {
    let bin = which("rubocop")
    if (!bin) {
      const ruby = which("ruby")
      const gem = which("gem")
      if (!ruby || !gem) {
        return
      }
      if (flags.disableLspDownload) return
      const result = await run(["gem", "install", "rubocop", "--bindir", Global.Path.bin])
      if (result.code !== 0) {
        return
      }
      bin = path.join(Global.Path.bin, "rubocop" + (process.platform === "win32" ? ".exe" : ""))
    }
    return {
      process: await confined(bin!, ["--lsp"], {
        cwd: root,
      }),
    }
  },
}

export const Ty: Info = {
  id: "ty",
  extensions: [".py", ".pyi"],
  root: NearestRoot([
    "pyproject.toml",
    "ty.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "pyrightconfig.json",
  ]),
  async spawn(root, _ctx, flags) {
    if (!flags.experimentalLspTy) {
      return undefined
    }

    let binary = which("ty")

    const initialization: Record<string, string> = {}

    const potentialVenvPaths = [process.env["VIRTUAL_ENV"], path.join(root, ".venv"), path.join(root, "venv")].filter(
      (p): p is string => p !== undefined,
    )
    for (const venvPath of potentialVenvPaths) {
      const isWindows = process.platform === "win32"
      const potentialPythonPath = isWindows
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python")
      if (await exists(potentialPythonPath)) {
        initialization["pythonPath"] = potentialPythonPath
        break
      }
    }

    if (!binary) {
      for (const venvPath of potentialVenvPaths) {
        const isWindows = process.platform === "win32"
        const potentialTyPath = isWindows ? path.join(venvPath, "Scripts", "ty.exe") : path.join(venvPath, "bin", "ty")
        if (await exists(potentialTyPath)) {
          binary = potentialTyPath
          break
        }
      }
    }

    if (!binary) {
      return
    }

    const proc = await confined(binary, ["server"], {
      cwd: root,
    })

    return {
      process: proc,
      initialization,
    }
  },
}

export const Pyright: Info = {
  id: "pyright",
  extensions: [".py", ".pyi"],
  root: NearestRoot(["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"]),
  async spawn(root, _ctx, flags) {
    let binary = which("pyright-langserver")
    const args = []
    if (!binary) {
      if (flags.disableLspDownload) return
      const resolved = await Npm.which("pyright", "pyright-langserver")
      if (!resolved) return
      binary = resolved
    }
    args.push("--stdio")

    const initialization: Record<string, string> = {}

    const potentialVenvPaths = [process.env["VIRTUAL_ENV"], path.join(root, ".venv"), path.join(root, "venv")].filter(
      (p): p is string => p !== undefined,
    )
    for (const venvPath of potentialVenvPaths) {
      const isWindows = process.platform === "win32"
      const potentialPythonPath = isWindows
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python")
      if (await exists(potentialPythonPath)) {
        initialization["pythonPath"] = potentialPythonPath
        break
      }
    }

    const proc = await confined(binary, args, {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
      initialization,
    }
  },
}

export const ElixirLS: Info = {
  id: "elixir-ls",
  extensions: [".ex", ".exs"],
  root: NearestRoot(["mix.exs", "mix.lock"]),
  async spawn(root, _ctx, flags) {
    let binary = which("elixir-ls")
    if (!binary) {
      const elixirLsPath = path.join(Global.Path.bin, "elixir-ls")
      binary = path.join(
        Global.Path.bin,
        "elixir-ls-master",
        "release",
        process.platform === "win32" ? "language_server.bat" : "language_server.sh",
      )

      if (!(await exists(binary))) {
        const elixir = which("elixir")
        if (!elixir) {
          return
        }

        if (flags.disableLspDownload) return

        const response = await fetch("https://github.com/elixir-lsp/elixir-ls/archive/refs/heads/master.zip")
        if (!response.ok) return
        const zipPath = path.join(Global.Path.bin, "elixir-ls.zip")
        if (response.body) await writeStream(zipPath, response.body)

        const ok = await extractZip(zipPath, Global.Path.bin)
        if (!ok) return

        await fs.rm(zipPath, {
          force: true,
          recursive: true,
        })

        const cwd = path.join(Global.Path.bin, "elixir-ls-master")
        const env = { MIX_ENV: "prod", ...process.env }
        await run(["mix", "deps.get"], { cwd, env })
        await run(["mix", "compile"], { cwd, env })
        await run(["mix", "elixir_ls.release2", "-o", "release"], { cwd, env })
      }
    }

    return {
      process: await confined(binary, {
        cwd: root,
      }),
    }
  },
}

export const Zls: Info = {
  id: "zls",
  extensions: [".zig", ".zon"],
  root: NearestRoot(["build.zig"]),
  async spawn(root, _ctx, flags) {
    let bin = which("zls")

    if (!bin) {
      const zig = which("zig")
      if (!zig) {
        return
      }

      if (flags.disableLspDownload) return

      const releaseResponse = await fetch("https://api.github.com/repos/zigtools/zls/releases/latest")
      if (!releaseResponse.ok) {
        return
      }

      const release = (await releaseResponse.json()) as {
        assets?: { name?: string; browser_download_url?: string }[]
      }

      const platform = process.platform
      const arch = process.arch
      let assetName = ""

      let zlsArch: string = arch
      if (arch === "arm64") zlsArch = "aarch64"
      else if (arch === "x64") zlsArch = "x86_64"
      else if (arch === "ia32") zlsArch = "x86"

      let zlsPlatform: string = platform
      if (platform === "darwin") zlsPlatform = "macos"
      else if (platform === "win32") zlsPlatform = "windows"

      const ext = platform === "win32" ? "zip" : "tar.xz"

      assetName = `zls-${zlsArch}-${zlsPlatform}.${ext}`

      const supportedCombos = [
        "zls-x86_64-linux.tar.xz",
        "zls-x86_64-macos.tar.xz",
        "zls-x86_64-windows.zip",
        "zls-aarch64-linux.tar.xz",
        "zls-aarch64-macos.tar.xz",
        "zls-aarch64-windows.zip",
        "zls-x86-linux.tar.xz",
        "zls-x86-windows.zip",
      ]

      if (!supportedCombos.includes(assetName)) {
        return
      }

      const asset = release.assets?.find((a) => a.name === assetName)
      if (!asset?.browser_download_url) {
        return
      }

      const downloadUrl = asset.browser_download_url
      const downloadResponse = await fetch(downloadUrl)
      if (!downloadResponse.ok) {
        return
      }

      const tempPath = path.join(Global.Path.bin, assetName)
      if (downloadResponse.body) await writeStream(tempPath, downloadResponse.body)

      if (ext === "zip") {
        const ok = await extractZip(tempPath, Global.Path.bin)
        if (!ok) return
      } else {
        await run(["tar", "-xf", tempPath], { cwd: Global.Path.bin })
      }

      await fs.rm(tempPath, { force: true })

      bin = path.join(Global.Path.bin, "zls" + (platform === "win32" ? ".exe" : ""))

      if (!(await exists(bin))) {
        return
      }

      if (platform !== "win32") {
        await fs.chmod(bin, 0o755).catch(() => {})
      }
    }

    return {
      process: await confined(bin, {
        cwd: root,
      }),
    }
  },
}
