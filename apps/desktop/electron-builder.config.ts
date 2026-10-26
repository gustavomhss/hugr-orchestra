import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { WorkspacePaths } from "@orchestra/script/workspace-paths"
import { promisify } from "node:util"

import type { AfterPackContext, Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const workspace = WorkspacePaths.make(packageDir)
const rootDir = workspace.root
const orchestraDir = workspace.module("orchestra")
const source: { version: string } = JSON.parse(readFileSync(path.join(orchestraDir, "package.json"), "utf8"))
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
// The Electron 42 packaging update briefly installed Linux launchers/icons under
// "orchestra-desktop". Keep that hidden desktop entry around so existing GNOME/KDE
// pins still resolve after the canonical app id changes back to ai.hugr.orchestra.
const legacyDesktopEntry = path.join(packageDir, "resources", "linux", "orchestra-desktop.desktop")
const legacyDesktopEntryFpm = `${legacyDesktopEntry}=/usr/share/applications/orchestra-desktop.desktop`

// hugr-omni (D-L8): the addon and the supervisor ship as real files in Resources/omni, staged by scripts/stage-omni.ts.
const omniEntitlements = path.join(packageDir, "resources", "entitlements.omni.plist")
const omniBinaries = ["hugr-omni-supervisor", "hugr_omni.node"].map((name) => `Contents/Resources/omni/${name}`)

type MacSign = Extract<NonNullable<NonNullable<Configuration["mac"]>["sign"]>, (...args: never[]) => unknown>

// electron-builder signs every nested binary with entitlementsInherit, the Electron helpers' JIT entitlements. omni's
// two files get the empty entitlements.omni.plist instead; everything else goes through electron-builder's own signer.
async function signMac(...[options]: Parameters<MacSign>) {
  const builder = createRequire(import.meta.url).resolve("electron-builder")
  const signer = createRequire(builder)("app-builder-lib/out/codeSign/macCodeSign") as {
    sign: (options: Parameters<MacSign>[0]) => Promise<void>
  }
  const forFile = options.optionsForFile
  await signer.sign({
    ...options,
    optionsForFile: (file) => {
      const base = forFile?.(file) ?? {}
      return omniBinaries.some((binary) => file.endsWith(binary)) ? { ...base, entitlements: omniEntitlements } : base
    },
  })
}

const metainfoFpm = (appId: string) =>
  `${path.join(packageDir, "resources", `${appId}.metainfo.xml`)}=/usr/share/metainfo/${appId}.metainfo.xml`

async function signWindows(configuration: { path: string }) {
  // CLI and upstream Claude bytes are already hashed by staging. Re-signing would invalidate their manifests.
  if (
    ["/resources/cli/", "/resources/claude-code/"].some((directory) =>
      configuration.path.replaceAll("\\", "/").includes(directory),
    )
  ) return
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.ORCHESTRA_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const APP_IDS = {
  dev: "ai.hugr.orchestra.dev",
  beta: "ai.hugr.orchestra.beta",
  prod: "ai.hugr.orchestra",
} as const

async function verifyPackagedResources(context: AfterPackContext) {
  const { verifyPackagedCli } = await import("./scripts/cli-packaging")
  const { verifyClaudeAsset } = await import("./scripts/stage-claude")
  const { verifyClaudeCodeResource } = await import(pathToFileURL(path.join(orchestraDir, "script/claude-code-resources.ts")).href)
  const { Arch } = await import("electron-builder")
  const directory =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents/Resources/cli")
      : path.join(context.appOutDir, "resources/cli")
  await verifyPackagedCli(
    directory,
    context.electronPlatformName,
    Arch[context.arch],
    context.packager.appInfo.version,
    await ripgrepChecks(),
  )
  const claude = path.join(path.dirname(directory), "claude-code")
  const platform = context.electronPlatformName === "mas" ? "darwin" : context.electronPlatformName
  await verifyClaudeAsset(claude, platform, Arch[context.arch])
  verifyClaudeCodeResource(claude, { os: platform, arch: Arch[context.arch] })
}

// The rg each CLI target ships in Resources/cli/ripgrep-<target>/ is signed by staging, not here (Resources/cli is
// skipped below): every pack checks it is the pinned executable or, signed, carries a valid signature.
async function ripgrepChecks() {
  const { ripgrepSigning, signatureCheck } = await import("./src/main/cli-artifacts")
  return {
    signing: (target: string) => ripgrepSigning(target),
    signature: async (file: string, target: string) => {
      const check = signatureCheck(target, file)
      if (!check) return false
      return execFileAsync(check.command, check.args).then(
        (result) => check.valid(result.stdout),
        () => false,
      )
    },
  }
}

const getBase = (appId: string): Configuration => ({
  artifactName: "orchestra-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.hugr.orchestra" becomes
  // "ai.hugr.orchestra.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    version: process.env.ORCHESTRA_VERSION ?? source.version,
    desktopName: `${appId}.desktop`,
  },
  // Only prod embeds a feed (see getConfig). null (not omission) stops dev and beta builds from inferring a GitHub
  // feed from the git remote.
  publish: null,
  files: [
    "out/**/*",
    "resources/**/*",
    "!resources/orchestra-cli*",
    "!resources/cli{,/**/*}",
    "!resources/icons/**/*",
    "!resources/omni/**",
    "!resources/claude-code{,/**/*}",
  ],
  beforePack: async (context) => {
    const { verifyPackagedCli } = await import("./scripts/cli-packaging")
    const { verifyClaudeAsset } = await import("./scripts/stage-claude")
    const { verifyClaudeCodeResource } = await import(pathToFileURL(path.join(orchestraDir, "script/claude-code-resources.ts")).href)
    const { Arch } = await import("electron-builder")
    const { prepareTreeSitterPrebuilds } = await import("@orchestra/script/tree-sitter-prebuilds")
    // The app's node_modules carry tree-sitter prebuilds and the core binding maestro-arsenal parses with; repair,
    // build or refuse them before electron-builder copies them.
    // A universal macOS app is packed per architecture first, and each of those passes is checked.
    if (Arch[context.arch] !== "universal")
      prepareTreeSitterPrebuilds({
        root: rootDir,
        os: context.electronPlatformName === "mas" ? "darwin" : context.electronPlatformName,
        arch: Arch[context.arch],
      })
    await verifyPackagedCli(
      path.join(packageDir, "resources/cli"),
      context.electronPlatformName,
      Arch[context.arch],
      context.packager.appInfo.version,
      await ripgrepChecks(),
    )
    const platform = context.electronPlatformName === "mas" ? "darwin" : context.electronPlatformName
    const staged = await verifyClaudeAsset(path.join(packageDir, "resources/claude-code"), platform, Arch[context.arch])
    const produced = verifyClaudeCodeResource(path.join(orchestraDir, "dist/node/claude-code"), {
      os: platform,
      arch: Arch[context.arch],
    })
    if (createHash("sha256").update(await readFile(produced)).digest("hex") !== staged.sha256)
      throw new Error("Desktop and Node Claude Code producers staged different executable bytes")
  },
  afterPack: verifyPackagedResources,
  afterSign: verifyPackagedResources,
  extraResources: [
    // Native windows and the macOS Dock read process.resourcesPath/icons outside app.asar.
    {
      from: "resources/icons",
      to: "icons",
    },
    {
      from: "resources/linux/app-dock-accessibility",
      to: "app-dock-accessibility",
      filter: ["*.py"],
    },
    {
      from: "resources/linux-runtime",
      to: "linux-runtime",
    },
    // Maestro's playbooks stay outside the app archive so ripgrep and the agent's file tools can read them.
    {
      from: path.join(orchestraDir, "playbooks"),
      to: "playbooks",
    },
    { from: "resources/cli", to: "cli" },
    // One writer for the executable and receipt; the Node producer contributes only its required notices.
    { from: "resources/claude-code", to: "claude-code", filter: ["claude", "claude.exe", "manifest.json"] },
    { from: path.join(orchestraDir, "dist/node/claude-code/README.md"), to: "claude-code/README.md" },
    { from: path.join(orchestraDir, "dist/node/claude-code/LICENSE.md"), to: "claude-code/LICENSE.md" },
    {
      from: "resources/omni",
      to: "omni",
    },
  ],
  mac: {
    signIgnore: ["/Resources/cli/", "/Resources/claude-code/"],
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    // The live seat's senses: macOS shows these when the microphone or the system-audio tap is first used.
    extendInfo: {
      NSMicrophoneUsageDescription: "HuGR Orchestra listens to your microphone during a live meeting you start.",
      NSAudioCaptureUsageDescription: "HuGR Orchestra hears the meeting's audio during a live meeting you start.",
    },
    binaries: omniBinaries,
    sign: signMac,
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "HuGR Orchestra",
    schemes: ["orchestra"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    // Named, not left to the default: the supervisor is an .exe and the omni addon a .node. Resources/cli (the CLIs and
    // the rg they ship) is signed by staging, which signWindows skips.
    signExts: [".exe", ".node"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    // deb needs a maintainer; without this electron-builder derives it from package.json author.email, which Orchestra
    // does not publish yet.
    maintainer: "HuGR",
    executableName: appId,
    desktop: {
      entry: {
        // Match the installed .desktop file and hicolor icon basename so
        // Linux shells can associate the running Electron window with its launcher.
        StartupWMClass: appId,
      },
    },
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const appId = APP_IDS[channel]
  const signed = getBase(appId)
  // A release dry run (release-desktop.yml sign=false) builds the same installers with no signing identity or notarization.
  const base: Configuration =
    process.env.ORCHESTRA_DESKTOP_UNSIGNED === "1"
      ? {
          ...signed,
          mac: { ...signed.mac, identity: null, sign: undefined, notarize: false },
          dmg: { ...signed.dmg, sign: false },
          win: { ...signed.win, signtoolOptions: undefined, signAndEditExecutable: false },
        }
      : signed

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId,
        productName: "HuGR Orchestra Dev",
        deb: { fpm: [metainfoFpm(appId)] },
        rpm: { packageName: "orchestra-dev", fpm: [metainfoFpm(appId)] },
      }
    }
    case "beta": {
      return {
        ...base,
        appId,
        productName: "HuGR Orchestra Beta",
        protocols: { name: "HuGR Orchestra Beta", schemes: ["orchestra"] },
        deb: { fpm: [metainfoFpm(appId)] },
        rpm: { packageName: "orchestra-beta", fpm: [metainfoFpm(appId)] },
      }
    }
    case "prod": {
      return {
        ...base,
        appId,
        productName: "HuGR Orchestra",
        protocols: { name: "HuGR Orchestra", schemes: ["orchestra"] },
        // The fixed desktop-latest release holds the current latest*.yml and update payloads, apart from the CLI's
        // v<version> releases (.github/workflows/release-desktop.yml).
        publish: {
          provider: "generic" as const,
          url: "https://github.com/gustavomhss/hugr-orchestra/releases/download/desktop-latest",
        },
        deb: { fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
        rpm: { packageName: "orchestra", fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
