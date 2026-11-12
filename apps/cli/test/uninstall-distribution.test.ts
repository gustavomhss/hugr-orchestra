import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { access, mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const home = await mkdtemp(path.join(tmpdir(), "orchestra-uninstall-distribution-"))
process.env.ORCHESTRA_TEST_HOME = home
process.env.HOME = home
process.env.XDG_DATA_HOME = path.join(home, "data")
process.env.XDG_CACHE_HOME = path.join(home, "cache")
process.env.XDG_CONFIG_HOME = path.join(home, "config")
process.env.XDG_STATE_HOME = path.join(home, "state")
const { installationMethod, uninstall, removeArchive } = await import("../src/commands/handlers/uninstall")
afterAll(() => rm(home, { recursive: true, force: true }))
const exists = (file: string) => access(file).then(() => true, () => false)
// A hard stop makes an accidental npm classification fail without ever executing npm.
const noProcesses = ChildProcessSpawner.make(() => Effect.die("Uninstall must not spawn npm for an archive"))
const run = (effect: ReturnType<typeof uninstall>) => effect.pipe(
  Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, noProcesses), Effect.runPromise,
)

async function payload(root: string) {
  const executable = path.join(root, "bin", "orchestra")
  await mkdir(path.dirname(executable), { recursive: true })
  await writeFile(executable, "executable fixture")
  await writeFile(path.join(root, "distribution.json"), JSON.stringify({
    schema: "orchestra-distribution-v1", version: "1.2.3", target: "linux-x64",
    files: [{ path: "bin/orchestra", executable: true, sha256: "0".repeat(64) }],
  }))
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "@humanguardrail/cli-linux-x64", version: "1.2.3" }))
  return executable
}

async function archive() {
  const prefix = await mkdtemp(path.join(home, "custom-tools-"))
  const root = path.join(prefix, "versions", "1.2.3-linux-x64")
  const executable = await payload(root)
  await mkdir(path.join(prefix, "bin"))
  await symlink("versions/1.2.3-linux-x64", path.join(prefix, "current"), "dir")
  await symlink("../current/bin/orchestra", path.join(prefix, "bin", "orchestra"), "file")
  const paths = Object.fromEntries(await Promise.all(["data", "cache", "config", "state"].map(async (name) => {
    const directory = path.join(prefix, "user", name)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "mine"), name)
    return [name, directory]
  }))) as { data: string; cache: string; config: string; state: string }
  return { prefix, root, executable, paths }
}

const input = { "keep-config": true, "keep-data": true, "dry-run": false, force: true }

test("recognizes the official custom versioned prefix through executable and launcher realpaths", async () => {
  const fixture = await archive()
  for (const executable of [fixture.executable, path.join(fixture.prefix, "bin", "orchestra"), path.join(fixture.prefix, "current", "bin", "orchestra")]) {
    expect(await installationMethod(executable)).toMatchObject({ method: "archive", payload: fixture.root, prefix: fixture.prefix })
  }
})

test("handler dry-run mutates nothing; uninstall removes only its selected payload and honors keep flags", async () => {
  const fixture = await archive()
  const retained = await payload(path.join(fixture.prefix, "versions", "older-linux-x64"))
  await writeFile(path.join(fixture.prefix, "notes"), "bystander")
  await run(uninstall({ ...input, "dry-run": true }, fixture.executable, fixture.paths))
  expect(await exists(fixture.executable)).toBe(true)
  expect(await exists(path.join(fixture.prefix, "current"))).toBe(true)
  expect(await exists(path.join(fixture.prefix, ".install-lock"))).toBe(false)
  for (const directory of Object.values(fixture.paths)) expect(await exists(path.join(directory, "mine"))).toBe(true)
  await run(uninstall(input, fixture.executable, fixture.paths))
  expect(await exists(fixture.root)).toBe(false)
  expect(await exists(path.join(fixture.prefix, "current"))).toBe(false)
  expect(await exists(path.join(fixture.prefix, "bin", "orchestra"))).toBe(false)
  expect(await exists(retained)).toBe(true)
  expect(await readFile(path.join(fixture.prefix, "notes"), "utf8")).toBe("bystander")
  expect(await exists(fixture.paths.data)).toBe(true)
  expect(await exists(fixture.paths.config)).toBe(true)
  expect(await exists(fixture.paths.cache)).toBe(false)
  expect(await exists(fixture.paths.state)).toBe(false)
})

test("standalone archives in arbitrary or .local/bin paths refuse npm and preserve user files", async () => {
  for (const name of ["standalone", ".local"]) {
    const privateRoot = await mkdtemp(path.join(home, "unknown-"))
    const root = path.join(privateRoot, name)
    const executable = await payload(root)
    await expect(run(uninstall(input, executable))).rejects.toThrow("Cannot safely identify")
    expect(await exists(executable)).toBe(true)
  }
})

test("launcher belonging to another installation is never removed", async () => {
  const first = await archive()
  const second = await archive()
  await rm(path.join(first.prefix, "bin", "orchestra"))
  await symlink(second.executable, path.join(first.prefix, "bin", "orchestra"), "file")
  await expect(run(uninstall(input, first.executable, first.paths))).rejects.toThrow("Cannot safely identify")
  expect(await exists(first.executable)).toBe(true)
  expect(await exists(second.executable)).toBe(true)
  expect(await exists(first.paths.cache)).toBe(true)
})

test("ownership is checked again before removal; symlinked versions cannot claim another prefix", async () => {
  const fixture = await archive()
  const detected = await installationMethod(fixture.executable)
  if (detected.method !== "archive") throw new Error("Expected archive")
  await rm(path.join(fixture.prefix, "current"))
  await symlink("versions/older", path.join(fixture.prefix, "current"), "dir")
  await expect(removeArchive(detected)).rejects.toThrow()
  expect(await exists(fixture.executable)).toBe(true)
  expect(await exists(path.join(fixture.prefix, ".install-lock"))).toBe(false)
  const owner = await archive()
  const alias = await mkdtemp(path.join(home, "alias-"))
  await symlink(path.join(owner.prefix, "versions"), path.join(alias, "versions"), "dir")
  const throughAlias = await installationMethod(path.join(alias, "versions", "1.2.3-linux-x64", "bin", "orchestra"))
  expect(throughAlias).toMatchObject({ method: "archive", prefix: owner.prefix, payload: owner.root })
  if (throughAlias.method !== "archive") throw new Error("Expected archive")
  await removeArchive(throughAlias)
  expect(await exists(alias)).toBe(true)
  expect(await exists(owner.root)).toBe(false)
})

test("npm platform descriptors retain npm detection with the owning global prefix, including nested dependencies", async () => {
  for (const nested of [false, true]) {
    const prefix = await mkdtemp(path.join(home, "npm-prefix-"))
    const scope = path.join(prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@humanguardrail")
    await mkdir(path.join(scope, "cli"), { recursive: true })
    await writeFile(path.join(scope, "cli", "package.json"), JSON.stringify({ name: "@humanguardrail/cli", version: "1.2.3" }))
    const root = path.join(nested ? path.join(scope, "cli", "node_modules", "@humanguardrail") : scope, "cli-linux-x64")
    expect(await installationMethod(await payload(root))).toEqual({ method: "npm", prefix })
  }
})


test.skipIf(process.platform === "win32")("local npm cannot uninstall a separate global installation under the same project prefix", async () => {
  for (const nested of [false, true]) {
    const project = await mkdtemp(path.join(home, "npm-project-"))
    const scope = path.join(project, "node_modules", "@humanguardrail")
    const localOwner = path.join(scope, "cli")
    const globalOwner = path.join(project, "lib", "node_modules", "@humanguardrail", "cli")
    for (const owner of [localOwner, globalOwner]) {
      await mkdir(owner, { recursive: true })
      await writeFile(path.join(owner, "package.json"), JSON.stringify({ name: "@humanguardrail/cli", version: "1.2.3" }))
    }
    await writeFile(path.join(globalOwner, "bystander"), "separate global install")
    const root = path.join(nested ? path.join(localOwner, "node_modules", "@humanguardrail") : scope, "cli-linux-x64")
    const executable = await payload(root)
    await expect(installationMethod(executable)).rejects.toThrow("Cannot safely identify")
    await expect(run(uninstall(input, executable))).rejects.toThrow("Cannot safely identify")
    expect(await exists(executable)).toBe(true)
    expect(await readFile(path.join(globalOwner, "bystander"), "utf8")).toBe("separate global install")
  }
})

test("global npm handler scopes its command to the verified owner, including a Windows prefix named lib", async () => {
  for (const nested of [false, true]) {
    const prefix = path.join(await mkdtemp(path.join(home, "global-npm-")), "lib")
    const scope = path.join(prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@humanguardrail")
    const owner = path.join(scope, "cli")
    await mkdir(owner, { recursive: true })
    await writeFile(path.join(owner, "package.json"), JSON.stringify({ name: "@humanguardrail/cli", version: "1.2.3" }))
    const root = path.join(nested ? path.join(owner, "node_modules", "@humanguardrail") : scope, "cli-linux-x64")
    const executable = await payload(root)
    expect(await installationMethod(executable)).toEqual({ method: "npm", prefix })
    const commands: string[][] = []
    const recorder = ChildProcessSpawner.make((command) => {
      if (ChildProcess.isStandardCommand(command)) commands.push([command.command, ...command.args])
      return Effect.die("Command captured; never execute npm")
    })
    await expect(uninstall(input, executable).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, recorder), Effect.runPromise,
    )).rejects.toThrow("Command captured")
    expect(commands).toEqual([["npm", "uninstall", "-g", "--prefix", prefix, "@humanguardrail/cli"]])
    expect(await exists(executable)).toBe(true)
  }
})
