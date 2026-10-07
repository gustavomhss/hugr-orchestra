import { execFile } from "node:child_process"
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
  await verifyPackagedCli(directory, context.electronPlatformName, Arch[context.arch], context.packager.appInfo.version)
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
  files: ["out/**/*", "resources/**/*", "!resources/orchestra-cli*", "!resources/cli{,/**/*}"],
  beforePack: async (context) => {
    const { verifyPackagedCli } = await import("./scripts/cli-packaging")
    const { Arch } = await import("electron-builder")
    await verifyPackagedCli(
      path.join(packageDir, "resources/cli"),
      context.electronPlatformName,
      Arch[context.arch],
      context.packager.appInfo.version,
    )
  },
  afterPack: verifyPackagedResources,
  afterSign: verifyPackagedResources,
  extraResources: [
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
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
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
