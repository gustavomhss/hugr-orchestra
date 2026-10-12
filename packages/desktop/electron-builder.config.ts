import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { AfterPackContext, Configuration } from "electron-builder"
import source from "../orchestra/package.json"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
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
  // CLI bytes are already signed and hashed by staging. Re-signing would invalidate their manifest.
  if (configuration.path.replaceAll("\\", "/").includes("/resources/cli/")) return
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
  // Orchestra is a fork separated from upstream opencode and publishes no releases of its own, so it
  // must not embed an update feed. null (not omission) also stops electron-builder from inferring a
  // GitHub feed from the git remote, which here is upstream. Re-enable only with Orchestra's own feed.
  publish: null,
  files: ["out/**/*", "resources/**/*", "!resources/orchestra-cli*", "!resources/cli{,/**/*}", "!resources/icons/**/*", "!resources/omni/**"],
  beforePack: async (context) => {
    const { verifyPackagedCli } = await import("./scripts/cli-packaging")
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
      from: "../orchestra/playbooks",
      to: "playbooks",
    },
    { from: "resources/cli", to: "cli" },
    {
      from: "resources/omni",
      to: "omni",
    },
  ],
  mac: {
    signIgnore: ["/Resources/cli/"],
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
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
  const base = getBase(appId)

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
        deb: { fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
        rpm: { packageName: "orchestra", fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
