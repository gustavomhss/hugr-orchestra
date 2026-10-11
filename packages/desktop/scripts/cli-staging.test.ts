import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import { stageCliArtifacts, desktopCliTargets } from "./cli-staging"
import { installCliArtifact } from "../src/main/cli-install"
import { verifyPackagedCli } from "./cli-packaging"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture(targets = ["linux-x64-baseline"]) {
  const root = await mkdtemp(join(tmpdir(), "orchestra-stage-test-"))
  roots.push(root)
  const dist = join(root, "dist")
  await Promise.all(
    targets.map(async (target) => {
      const dir = join(dist, `cli-${target}`)
      await mkdir(join(dir, "bin"), { recursive: true })
      await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.18.27" }))
      await writeFile(
        join(dir, "bin", target.startsWith("windows-") ? "orchestra.exe" : "orchestra"),
        `owned ${target}`,
      )
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
