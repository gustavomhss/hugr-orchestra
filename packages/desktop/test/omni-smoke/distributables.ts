// Hosted: builds the distributables users install from the already packed --dir app (zip and dmg on macOS, AppImage and
// deb on Linux) and checks that the executables the app runs outside app.asar keep their executable bit in each: the
// CLI, the rg it ships (Resources/cli/ripgrep-<target>/rg) and the omni supervisor.
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { nativeCliTarget } from "../../src/main/cli-artifacts"
import { provenance } from "./build"

if (!process.env.CI) throw new Error("distributable proof requires hosted CI")
if (process.platform === "win32") throw new Error("the nsis installer is not unpacked here; run on macOS or Linux")
const desktop = path.resolve(import.meta.dir, "../..")
const target = nativeCliTarget(process.platform, process.arch)
const built = provenance()
const executables = [`cli/orchestra-${target}`, `cli/ripgrep-${target}/rg`, "omni/hugr-omni-supervisor"]
const app = process.platform === "darwin" ? path.resolve(built.resources, "../..") : path.dirname(built.resources)
const targets = process.platform === "darwin" ? ["zip", "dmg"] : ["AppImage", "deb"]

const run = async (args: string[], cwd = desktop) => {
  const child = Bun.spawn(args, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    // The channel the --dir app was built for (build.ts), so the config graph names the same metainfo files.
    env: { ...process.env, ORCHESTRA_CHANNEL: "beta", CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  })
  if ((await child.exited) !== 0) throw new Error(`failed: ${args.join(" ")}`)
}
const check = async (resources: string, label: string) => {
  const modes = await Promise.all(
    executables.map(async (file) => {
      const stat = await lstat(path.join(resources, file))
      if (!stat.isFile() || (stat.mode & 0o111) !== 0o111)
        throw new Error(`${label}: ${file} lost its executable bit (${(stat.mode & 0o777).toString(8)})`)
      return [file, (stat.mode & 0o777).toString(8)]
    }),
  )
  console.log(`DISTRIBUTABLE_EXEC_BITS ${JSON.stringify({ label, modes: Object.fromEntries(modes) })}`)
}

await run([
  process.execPath,
  "x",
  "electron-builder",
  process.platform === "darwin" ? "--mac" : "--linux",
  ...targets,
  "--prepackaged",
  app,
  "--config",
  "test/omni-smoke/unsigned.config.ts",
  "--publish",
  "never",
])
const outputs = await readdir(path.join(desktop, "dist"))
const find = (extension: string) => {
  const file = outputs.find((name) => name.endsWith(`.${extension}`))
  if (!file) throw new Error(`no .${extension} in dist: ${outputs.join(", ")}`)
  return path.join(desktop, "dist", file)
}
const scratch = await mkdtemp(path.join(tmpdir(), "orchestra-distributables-"))
try {
  if (process.platform === "darwin") {
    await run(["ditto", "-x", "-k", find("zip"), path.join(scratch, "zip")])
    const zipApp = (await readdir(path.join(scratch, "zip"))).find((name) => name.endsWith(".app"))!
    await check(path.join(scratch, "zip", zipApp, "Contents/Resources"), "zip")
    const mount = path.join(scratch, "dmg")
    await run(["hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mount, find("dmg")])
    try {
      const dmgApp = (await readdir(mount)).find((name) => name.endsWith(".app"))!
      await check(path.join(mount, dmgApp, "Contents/Resources"), "dmg")
    } finally {
      await run(["hdiutil", "detach", mount])
    }
  }
  if (process.platform === "linux") {
    await run([find("AppImage"), "--appimage-extract"], scratch)
    await check(path.join(scratch, "squashfs-root/resources"), "AppImage")
    await run(["dpkg-deb", "-x", find("deb"), path.join(scratch, "deb")])
    const opt = path.join(scratch, "deb/opt")
    const product = (await readdir(opt))[0]!
    await check(path.join(opt, product, "resources"), "deb")
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}
