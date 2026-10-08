import { expect, test } from "bun:test"
import path from "node:path"
import type { Configuration } from "electron-builder"

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

  test(`embeds no update feed in ${channel.channel} builds`, async () => {
    const previous = process.env.ORCHESTRA_CHANNEL
    process.env.ORCHESTRA_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?publish=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.ORCHESTRA_CHANNEL
    else process.env.ORCHESTRA_CHANNEL = previous

    // null, not undefined: an omitted publish lets electron-builder infer a GitHub feed from the git remote.
    expect(config.publish).toBeNull()
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
    expect(config.extraResources).toContainEqual({ from: "../orchestra/playbooks", to: "playbooks" })
    expect(
      await Bun.file(path.join(import.meta.dir, "../orchestra/playbooks/maestro-governed/SKILL.md")).exists(),
    ).toBe(true)
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
    expect(config.extraMetadata?.version).toBe(process.env.ORCHESTRA_VERSION ?? "1.18.27")
  })
}
