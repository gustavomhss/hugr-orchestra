import { expect, test } from "bun:test"
import path from "node:path"
import type { Configuration } from "electron-builder"
import { WorkspacePaths } from "@orchestra/script/workspace-paths"

const legacyDesktopEntry = "resources/linux/orchestra-desktop.desktop"

const channels = [
  { channel: "dev", appId: "ai.hugr.orchestra.dev" },
  { channel: "beta", appId: "ai.hugr.orchestra.beta" },
  { channel: "prod", appId: "ai.hugr.orchestra" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
    expect(config.deb?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
    expect(config.rpm?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
  })

  test(`embeds Orchestra's update feed in prod builds only (${channel.channel})`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?publish=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    // null, not undefined: an omitted publish lets electron-builder infer a GitHub feed from the git remote.
    if (channel.channel !== "prod") expect(config.publish).toBeNull()
    if (channel.channel === "prod")
      expect(config.publish).toEqual({
        provider: "generic",
        url: "https://github.com/gustavomhss/hugr-orchestra/releases/download/desktop-latest",
      })
  })
}

for (const channel of channels) {
  test(`ships native window and Dock icons outside the app archive for ${channel.channel}`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?icons=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    if (previous !== undefined) process.env.ORCHESTRA_CHANNEL = previous

    // windows.ts resolves these at process.resourcesPath/icons, not inside app.asar.
    expect(config.extraResources).toContainEqual({ from: "resources/icons", to: "icons" })
    expect(config.files).toContain("!resources/icons/**/*")
    for (const icon of ["icon.png", "icon.ico", "dock.png"]) {
      expect(await Bun.file(path.join(import.meta.dir, "icons", channel.channel, icon)).exists()).toBe(true)
    }
  })

  test(`ships Maestro's playbooks outside the app archive for ${channel.channel}`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?playbooks=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    // The desktop main process points the server at Resources/playbooks (src/main/server.ts).
    const playbooks = path.join(WorkspacePaths.make(import.meta.dir).module("maestro"), "playbooks")
    expect(config.extraResources).toContainEqual({ from: playbooks, to: "playbooks" })
    expect(await Bun.file(path.join(playbooks, "maestro-governed/SKILL.md")).exists()).toBe(true)
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.ORCHESTRA_CHANNEL
  process.env.ORCHESTRA_CHANNEL = "prod"

  const module = await import(`./electron-builder.config.ts?compat=${"prod"}`)
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
  else process.env.ORCHESTRA_CHANNEL = previous

  expect(
    config.deb?.fpm?.some((entry) =>
      entry.endsWith("orchestra-desktop.desktop=/usr/share/applications/orchestra-desktop.desktop"),
    ),
  ).toBe(true)
  expect(
    config.rpm?.fpm?.some((entry) =>
      entry.endsWith("orchestra-desktop.desktop=/usr/share/applications/orchestra-desktop.desktop"),
    ),
  ).toBe(true)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/Orchestra/ai.hugr.orchestra %U")
  expect(desktop).toContain("Icon=ai.hugr.orchestra")
  expect(desktop).toContain("StartupWMClass=ai.hugr.orchestra")
  expect(desktop).toContain("NoDisplay=true")
})

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`bundles owned CLI outside ${channel} app archive`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?cli-resource=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    expect(config.files).toContain("!resources/orchestra-cli*")
    expect(config.files).toContain("!resources/cli{,/**/*}")
    expect(config.extraResources).toContainEqual({
      from: "resources/cli",
      to: "cli",
    })
    expect(typeof config.beforePack).toBe("function")
    expect(typeof config.afterPack).toBe("function")
    expect(typeof config.afterSign).toBe("function")
    expect(config.mac?.signIgnore).toContain("/Resources/cli/")
    expect(config.mac?.signIgnore).toContain("/Resources/claude-code/")
    expect(config.files).toContain("!resources/claude-code{,/**/*}")
    expect(config.extraResources).toContainEqual({
      from: "resources/claude-code",
      to: "claude-code",
      filter: ["claude", "claude.exe", "manifest.json", "README.md", "LICENSE.md"],
    })
    const resources = [config.extraResources ?? []].flat()
      .filter((resource): resource is Exclude<typeof resource, string> => typeof resource !== "string")
      .filter((resource) => resource.to === "claude-code" || resource.to?.startsWith("claude-code/"))
    expect(resources.map((resource) => resource.to)).toEqual(["claude-code"])
    expect(config.extraMetadata?.version).toBe(process.env.ORCHESTRA_VERSION ?? "1.18.27")
  })
}

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`ships hugr-omni as real files in Resources/omni for ${channel}, signed on macOS and Windows`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?omni=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    // D-L8: next to each other on disk, outside app.asar; the stale native/ entry is gone.
    expect(config.extraResources).toContainEqual({ from: "resources/omni", to: "omni" })
    expect(config.files).toContain("!resources/omni/**")
    expect(JSON.stringify(config.extraResources)).not.toContain("native/")
    expect(config.mac?.binaries).toEqual([
      "Contents/Resources/omni/hugr-omni-supervisor",
      "Contents/Resources/omni/hugr_omni.node",
    ])
    expect(typeof config.mac?.sign).toBe("function")
    expect(config.win?.signExts).toContain(".node")
    const entitlements = await Bun.file("resources/entitlements.omni.plist").text()
    expect(entitlements).toContain("<dict/>")
  })
}

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`ships rg inside the CLI bundle for ${channel}, signed by staging and checked on every pack`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?ripgrep=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    // rg lives in Resources/cli/ripgrep-<target>/ (scripts/cli-staging.ts), which staging signs like the CLI: the
    // config names no ripgrep resource or binary of its own, so a package without one (Nix) needs no conditional.
    expect(JSON.stringify(config.extraResources)).not.toContain("ripgrep")
    expect(JSON.stringify(config.mac?.binaries)).not.toContain("ripgrep")
    expect(config.mac?.signIgnore).toContain("/Resources/cli/")
    // Windows signing is named, not left to a default: executables and the omni addon.
    expect(config.win?.signExts).toContain(".exe")
    expect(config.win?.signExts).toContain(".node")
    // beforePack checks the staged bundle, afterPack and afterSign the packaged one (rg included).
    expect(typeof config.beforePack).toBe("function")
    expect(typeof config.afterPack).toBe("function")
    expect(typeof config.afterSign).toBe("function")
  })
}

test("the rg a build signs must carry a valid signature; an intentionally unsigned build is byte-checked", async () => {
  const { ripgrepSigning, signatureCheck } = await import("./src/main/cli-artifacts")
  // macOS code is always signed on a macOS host (ad hoc without an identity) and checked with codesign.
  expect(ripgrepSigning("darwin-arm64", {}, "darwin")).toBe("required")
  expect(signatureCheck("darwin-arm64", "/x/rg", "darwin")).toMatchObject({ command: "codesign", args: ["--verify", "--strict", "/x/rg"] })
  // Windows code only where scripts/sign-windows.ps1 signs: Actions with Azure Artifact Signing configured.
  const azure = {
    GITHUB_ACTIONS: "true",
    AZURE_TRUSTED_SIGNING_ENDPOINT: "e",
    AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: "a",
    AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE: "p",
  }
  expect(ripgrepSigning("windows-x64-baseline", azure, "win32")).toBe("required")
  expect(ripgrepSigning("windows-x64-baseline", { ...azure, AZURE_TRUSTED_SIGNING_ENDPOINT: "" }, "win32")).toBeUndefined()
  expect(ripgrepSigning("windows-x64-baseline", { ...azure, GITHUB_ACTIONS: "false" }, "win32")).toBeUndefined()
  const authenticode = signatureCheck("windows-arm64", "C:\\it's\\rg.exe", "win32")!
  expect(authenticode.command).toBe("powershell.exe")
  expect(authenticode.args.at(-1)).toBe("(Get-AuthenticodeSignature -LiteralPath 'C:\\it''s\\rg.exe').Status")
  expect(authenticode.valid("Valid\r\n")).toBe(true)
  expect(authenticode.valid("NotSigned")).toBe(false)
  // Linux rg is never signed: it must be the pinned bytes.
  expect(ripgrepSigning("linux-x64-baseline", azure, "linux")).toBeUndefined()
  expect(signatureCheck("linux-x64-baseline", "/x/rg", "linux")).toBeUndefined()
})

test("ORCHESTRA_DESKTOP_UNSIGNED=1 builds prod installers with no signing identity or notarization", async () => {
  const previous = { channel: process.env.ORCHESTRA_CHANNEL, unsigned: process.env.ORCHESTRA_DESKTOP_UNSIGNED }
  process.env.ORCHESTRA_CHANNEL = "prod"
  process.env.ORCHESTRA_DESKTOP_UNSIGNED = "1"
  const unsigned = (await import(`./electron-builder.config.ts?unsigned=1`)).default as Configuration
  delete process.env.ORCHESTRA_DESKTOP_UNSIGNED
  const signed = (await import(`./electron-builder.config.ts?unsigned=0`)).default as Configuration
  if (previous.channel === undefined) delete process.env.ORCHESTRA_CHANNEL
  if (previous.channel !== undefined) process.env.ORCHESTRA_CHANNEL = previous.channel
  if (previous.unsigned !== undefined) process.env.ORCHESTRA_DESKTOP_UNSIGNED = previous.unsigned

  expect(unsigned.mac?.identity).toBeNull()
  expect(unsigned.mac?.sign).toBeUndefined()
  expect(unsigned.mac?.notarize).toBe(false)
  expect(unsigned.dmg?.sign).toBe(false)
  expect(unsigned.win?.signtoolOptions).toBeUndefined()
  expect(unsigned.win?.signAndEditExecutable).toBe(false)
  // Everything else is the release config: same identity, targets, resources and desktop-latest update feed.
  expect(unsigned.appId).toBe("ai.hugr.orchestra")
  expect(unsigned.mac?.target).toEqual(["dmg", "zip"])
  expect(unsigned.win?.target).toEqual(["nsis"])
  expect(unsigned.linux?.target).toEqual(["AppImage", "deb", "rpm"])
  expect(unsigned.mac?.signIgnore).toEqual(signed.mac?.signIgnore)
  expect(unsigned.extraResources).toEqual(signed.extraResources)
  expect(unsigned.publish).toEqual(signed.publish)
  expect(unsigned.publish).toMatchObject({ url: expect.stringContaining("/releases/download/desktop-latest") })

  // Without the switch the release config signs and notarizes.
  expect(signed.mac?.identity).toBeUndefined()
  expect(typeof signed.mac?.sign).toBe("function")
  expect(signed.mac?.notarize).toBe(true)
  expect(signed.dmg?.sign).toBe(true)
  expect(typeof signed.win?.signtoolOptions?.sign).toBe("function")
  expect(signed.win?.signAndEditExecutable).toBeUndefined()
})

test("flips the Electron fuses that keep the packaged binary from running as Node", async () => {
  const config = (await import("./electron-builder.config.ts?fuses=1")).default as Configuration

  expect(config.electronFuses).toMatchObject({
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  })
  // onlyLoadAppFromAsar needs the app in an archive.
  expect(config.asar).not.toBe(false)
})
