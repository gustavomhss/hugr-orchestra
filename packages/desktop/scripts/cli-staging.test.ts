import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import { stageCliArtifacts, desktopCliTargets, WslOmniPairMissingError } from "./cli-staging"
// The pair's names come from the installer, so staging is held to what the WSL install reads.
import { installGuestScript, installWslArtifact, omniCompanions } from "../src/main/wsl/artifact"
import { installCliArtifact } from "../src/main/cli-install"
import { verifyPackagedCli } from "./cli-packaging"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
// Linux CLIs ship the omni pair next to the binary, as the shared omni build step leaves them in dist.
async function fixture(targets = ["linux-x64-baseline"], binary = (target: string) => `owned ${target}`) {
  const root = await mkdtemp(join(tmpdir(), "orchestra-stage-test-"))
  roots.push(root)
  const dist = join(root, "dist")
  await Promise.all(
    targets.map(async (target) => {
      const dir = join(dist, `cli-${target}`)
      await mkdir(join(dir, "bin"), { recursive: true })
      await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.18.27" }))
      await writeFile(join(dir, "bin", target.startsWith("windows-") ? "orchestra.exe" : "orchestra"), binary(target))
      if (target.startsWith("linux-"))
        await Promise.all(omniCompanions.map((name) => writeFile(join(dir, "bin", name), `${name} ${target}`)))
    }),
  )
  return { root, dist, directory: join(root, "cli"), version: "1.18.27", targets }
}

test("staging hashes signed bytes, preserves target/version and replaces stale resources", async () => {
  const input = await fixture()
  await stageCliArtifacts({
    ...input,
    sign: async (path) => {
      await writeFile(path, "signed owned bytes")
    },
  })
  const manifest = await readCliManifest(input.directory)
  expect(manifest.version).toBe(input.version)
  expect(manifest.artifacts[0]!.sha256).toBe(createHash("sha256").update("signed owned bytes").digest("hex"))
  const verified = await verifyCliArtifact(input.directory, input.targets[0]!)
  expect(await readFile(verified.path, "utf8")).toBe("signed owned bytes")
  await writeFile(verified.path, "foreign cache")
  await stageCliArtifacts(input)
  expect(await readFile((await verifyCliArtifact(input.directory, input.targets[0]!)).path, "utf8")).toBe(
    `owned ${input.targets[0]}`,
  )
})

test("staging rejects unexpected W2 output/version and preserves previous manifest", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  await writeFile(join(input.dist, `cli-${input.targets[0]}`, "package.json"), JSON.stringify({ version: "local" }))
  await expect(stageCliArtifacts(input)).rejects.toThrow("version")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  await writeFile(
    join(input.dist, `cli-${input.targets[0]}`, "package.json"),
    JSON.stringify({ version: input.version }),
  )
  await rm(join(input.dist, `cli-${input.targets[0]}`, "bin", "orchestra"))
  await expect(stageCliArtifacts(input)).rejects.toThrow()
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
})

test("Windows staging carries both Linux WSL architectures", async () => {
  const targets = desktopCliTargets("win32", "arm64")
  expect(targets).toEqual(["windows-arm64", "linux-arm64", "linux-x64-baseline"])
  const input = await fixture(targets)
  await stageCliArtifacts(input)
  expect((await readCliManifest(input.directory)).artifacts.map((entry) => entry.target)).toEqual(targets)
  await Promise.all(targets.map((target) => verifyCliArtifact(input.directory, target)))
})

test("Windows staging places each Linux CLI's omni pair in omni-<target>/ and refuses a partial bundle", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  await Promise.all(
    ["linux-arm64", "linux-x64-baseline"].flatMap((target) =>
      omniCompanions.map(async (name) => {
        const path = join(input.directory, `omni-${target}`, name)
        expect(await readFile(path, "utf8")).toBe(`${name} ${target}`)
        if (process.platform !== "win32" && name === "hugr-omni-supervisor")
          expect((await stat(path)).mode & 0o777).toBe(0o755)
      }),
    ),
  )
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  for (const name of omniCompanions) {
    const path = join(input.dist, "cli-linux-arm64", "bin", name)
    await rename(path, `${path}.away`)
    const error = await stageCliArtifacts(input).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(WslOmniPairMissingError)
    expect((error as Error).message).toContain(`linux-arm64: ${path}`)
    expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
    expect(await readFile(join(input.directory, "omni-linux-arm64", name), "utf8")).toBe(`${name} linux-arm64`)
    await rename(`${path}.away`, path)
  }
  // A missing Linux CLI fails the Windows build as well.
  await rm(join(input.dist, "cli-linux-x64-baseline"), { recursive: true })
  await expect(stageCliArtifacts(input)).rejects.toThrow()
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  // Only WSL guests carry the pair: a native Linux bundle stages the binary alone.
  const native = await fixture()
  await stageCliArtifacts(native)
  expect((await readdir(native.directory)).sort()).toEqual(["manifest.json", "orchestra-linux-x64-baseline"])
})

test("prebuilt handoff carries the omni pair and refuses a producer without it", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const received = { ...input, dist: join(input.root, "no-local-build"), prebuilt: input.directory, directory: join(input.root, "consumer") }
  await stageCliArtifacts(received)
  expect(await readFile(join(received.directory, "omni-linux-x64-baseline", "hugr_omni.node"), "utf8")).toBe(
    "hugr_omni.node linux-x64-baseline",
  )
  await rm(join(input.directory, "omni-linux-x64-baseline", "hugr-omni-supervisor"))
  await expect(stageCliArtifacts(received)).rejects.toBeInstanceOf(WslOmniPairMissingError)
  await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version)).rejects.toBeInstanceOf(
    WslOmniPairMissingError,
  )
})

test("WSL install accepts the staged Windows bundle end to end through the real artifact reader", async () => {
  // Like the real omni CLI preflight, the guest binary exits early unless the pair sits next to it.
  const input = await fixture(desktopCliTargets("win32", "x64"), (target) =>
    target.startsWith("linux-")
      ? `#!/bin/bash\n[[ -f "\${0%/*}/hugr_omni.node" && -x "\${0%/*}/hugr-omni-supervisor" ]] || exit 9\nprintf 'orchestra v1.18.27\\n'\n`
      : `owned ${target}`,
  )
  await stageCliArtifacts(input)
  const home = join(input.root, "home")
  await mkdir(home)
  const sha = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex")
  // wslpath: a Linux host path is already the guest path; a Windows one maps under /mnt/<drive>.
  const guest = (path: string) =>
    process.platform === "win32" ? path.replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/") : path
  const installs: string[][] = []
  await installWslArtifact("Ubuntu", input.version, {
    directory: input.directory,
    run: async (args) => {
      if (args[0] === "bash") return { code: 0, signal: null, stdout: "x86_64\nglibc 2.39\n", stderr: "" }
      if (args[0] === "wslpath") return { code: 0, signal: null, stdout: guest(args[3]!), stderr: "" }
      installs.push(args)
      // The guest script needs GNU coreutils; elsewhere the arguments it would receive are checked below.
      if (process.platform !== "linux") return { code: 0, signal: null, stdout: "", stderr: "" }
      const child = Bun.spawn(args, { env: { ...process.env, HOME: home }, cwd: home, stdout: "pipe", stderr: "pipe" })
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      return { code, signal: null, stdout, stderr }
    },
  })
  const omni = join(input.directory, "omni-linux-x64-baseline")
  const binary = await verifyCliArtifact(input.directory, "linux-x64-baseline")
  expect(installs).toEqual([[
    "timeout", "--kill-after=1s", "18s", "bash", "-c", installGuestScript, "orchestra-install",
    guest(binary.path), await sha(binary.path), input.version,
    guest(join(omni, "hugr_omni.node")), await sha(join(omni, "hugr_omni.node")),
    guest(join(omni, "hugr-omni-supervisor")), await sha(join(omni, "hugr-omni-supervisor")),
  ]])
  if (process.platform !== "linux") return
  await Promise.all(
    [...omniCompanions, "orchestra"].map(async (name) =>
      expect(await sha(join(home, ".orchestra/bin", name))).toBe(
        await sha(name === "orchestra" ? binary.path : join(omni, name)),
      ),
    ),
  )
})

test("prebuilt handoff verifies producer bytes before native signing and preserves output on mismatch", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const producer = await readFile(join(input.directory, "manifest.json"), "utf8")
  const received = {
    ...input,
    dist: join(input.root, "no-local-build"),
    prebuilt: input.directory,
    directory: join(input.root, "consumer"),
    sign: async (path: string, target: string) => {
      expect(await readFile(path, "utf8")).toBe(`owned ${target}`)
      if (target.startsWith("windows-")) await writeFile(path, `signed ${target}`)
    },
  }
  await stageCliArtifacts(received)
  const manifest = await readCliManifest(received.directory)
  expect(manifest.artifacts.map((entry) => entry.target)).toEqual(input.targets)
  expect(manifest.artifacts[0]!.sha256).toBe(createHash("sha256").update(`signed ${input.targets[0]}`).digest("hex"))
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(producer)
  expect(await readFile((await verifyCliArtifact(input.directory, input.targets[0]!)).path, "utf8")).toBe(`owned ${input.targets[0]}`)
  const before = await readFile(join(received.directory, "manifest.json"), "utf8")
  await expect(stageCliArtifacts({ ...received, version: "wrong-version" })).rejects.toThrow("version")
  const native = await fixture([input.targets[0]!])
  await stageCliArtifacts(native)
  await expect(stageCliArtifacts({ ...received, prebuilt: native.directory })).rejects.toThrow("missing")
  const guest = await verifyCliArtifact(input.directory, "linux-arm64")
  await writeFile(guest.path, "changed in transit")
  await expect(stageCliArtifacts(received)).rejects.toThrow("digest")
  expect(await readFile(join(received.directory, "manifest.json"), "utf8")).toBe(before)
})

test("build helper uses explicit or environment prebuilt input without compiler fallback", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  await writeFile(join(input.directory, "manifest.json"), "{}")
  await Promise.all(["explicit", "environment"].map(async (source) => {
    const worker = Bun.spawn([process.execPath, "-e", `
      const { buildCliToResources } = await import(${JSON.stringify(new URL("./utils.ts", import.meta.url).href)});
      await buildCliToResources(${source === "explicit" ? JSON.stringify({ prebuilt: input.directory }) : "{}"})
        .then(() => { throw new Error("Invalid prebuilt input accepted"); })
        .catch((error) => { console.log(error.message); process.exit(0); });
    `], {
      cwd: join(import.meta.dir, ".."), timeout: 15000, stdout: "pipe", stderr: "pipe",
      env: { ...process.env, PATH: "", RUST_TARGET: "", ORCHESTRA_VERSION: input.version,
        ORCHESTRA_CLI_PREBUILT_DIR: source === "environment" ? input.directory : "" },
    })
    const [code, stdout, stderr] = await Promise.all([worker.exited, new Response(worker.stdout).text(), new Response(worker.stderr).text()])
    if (code !== 0) throw new Error(`Prebuilt helper child failed: ${stderr}`)
    expect(stdout.trim()).toBe("Invalid CLI manifest schema/version/artifacts")
  }))
})

test("prebuilt source/output overlap is rejected before signing or replacing producer", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const alias = join(input.root, "producer-alias")
  await symlink(input.directory, alias, process.platform === "win32" ? "junction" : "dir")
  await mkdir(join(input.root, "child"))
  await mkdir(join(input.root, "other"))
  await symlink(join(input.root, "child"), join(input.root, "other", "alias"), process.platform === "win32" ? "junction" : "dir")
  const signed: string[] = []
  // POSIX traverses the symlink before '..'; keep the raw spelling rather than
  // letting path.join normalize it into a different destination.
  const traversal = process.platform === "win32" ? [] : [`${join(input.root, "other", "alias")}/../cli`]
  await [...traversal, input.directory, alias, join(input.directory, "consumer"), join(alias, "new", "consumer"), input.root].reduce(async (previous, directory) => {
    await previous
    await expect(stageCliArtifacts({
      ...input, prebuilt: input.directory, directory, targets: ["linux-x64-baseline"],
      sign: async (_path, target) => { signed.push(target) },
    })).rejects.toThrow("overlap")
    expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
    await Promise.all(input.targets.map((target) => verifyCliArtifact(input.directory, target)))
  }, Promise.resolve())
  await expect(stageCliArtifacts({ ...input, prebuilt: `${input.directory}/../cli`, directory: join(input.root, "consumer") })).rejects.toThrow("ambiguous traversal")
  await expect(stageCliArtifacts({ ...input, prebuilt: input.directory, directory: `${input.directory}\\..\\consumer` })).rejects.toThrow("ambiguous traversal")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  expect(signed).toEqual([])
})

test("installed cache checks bytes, repairs tampering, rejects tampered source", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const cache = join(input.root, "cache")
  const first = await installCliArtifact(input.directory, input.targets[0]!, cache)
  await writeFile(first.path, "foreign cache")
  const repaired = await installCliArtifact(input.directory, input.targets[0]!, cache)
  expect(await readFile(repaired.path, "utf8")).toBe(`owned ${input.targets[0]}`)
  expect(repaired.version).toBe(input.version)
  const bundled = await verifyCliArtifact(input.directory, input.targets[0]!)
  await writeFile(bundled.path, "foreign source")
  await expect(installCliArtifact(input.directory, input.targets[0]!, cache)).rejects.toThrow("digest")
  expect(await readFile(first.path, "utf8")).toBe(`owned ${input.targets[0]}`)
})

test("packaging verifies effective root version and all Windows guest bytes", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  await verifyPackagedCli(input.directory, "win32", "x64", input.version)
  await expect(verifyPackagedCli(input.directory, "win32", "x64", "local")).rejects.toThrow("version")
  const guest = await verifyCliArtifact(input.directory, "linux-arm64")
  await writeFile(guest.path, "foreign guest bytes")
  await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version)).rejects.toThrow("digest")
  const native = await fixture(["windows-x64-baseline"])
  await stageCliArtifacts(native)
  await expect(verifyPackagedCli(native.directory, "win32", "x64", native.version)).rejects.toThrow("missing")
})

test("staging rejects empty, duplicate and traversal targets before touching output", async () => {
  const input = await fixture()
  await expect(stageCliArtifacts({ ...input, targets: [] })).rejects.toThrow("target")
  await expect(stageCliArtifacts({ ...input, targets: ["../foreign"] })).rejects.toThrow("target")
  await expect(stageCliArtifacts({ ...input, targets: [...input.targets, ...input.targets] })).rejects.toThrow("target")
})

test("staging rejects symlink output directories and keeps previous resources", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const binaryDirectory = join(input.dist, `cli-${input.targets[0]}`, "bin")
  await rename(binaryDirectory, join(input.root, "foreign-bin"))
  await symlink(join(input.root, "foreign-bin"), binaryDirectory, process.platform === "win32" ? "junction" : "dir")
  await expect(stageCliArtifacts(input)).rejects.toThrow("regular")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
})
