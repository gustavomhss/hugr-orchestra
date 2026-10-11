import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { guestEnvironment, installGuestScript, installWslArtifact, linuxGuestTarget, omniCompanions, WslArtifactError } from "./artifact"
import { writeTreeSitterBundle } from "../cli-tree-sitter.fixture"
import { checkWslAuthentication } from "./startup"
import { spawnWslSidecar, wslServeScript } from "./sidecar"
import { normalizeWslCommandVersion, readWslCommandVersion, shellEscape } from "./runtime"

// These tests run the guest scripts in the host's bash as a stand-in for the WSL guest, which is always Linux: glibc
// (`getconf GNU_LIBC_VERSION`), GNU coreutils, POSIX paths, modes and signals. No other host shell is that guest (Git
// Bash on Windows has no glibc, decides -x by file content and cannot kill the CLI behind an exec'd script), so they
// run on Linux hosts, like the guest-script run in scripts/cli-staging.test.ts.
const linuxGuestTest = test.skipIf(process.platform !== "linux")

linuxGuestTest("startup admits only descriptor-bound guest bytes before credentials/serve", async () => {
  const root = await mkdtemp(join(tmpdir(), "w4-admission-"))
  const binary = join(root, ".orchestra/bin/orchestra")
  const marker = join(root, "executed")
  const trusted = "#!/bin/bash\nprintf '%s\\n' \"$1\" >> \"$HOME/executed\"\nprintf '1.16.2\\n'\n"
  const options = (bytes: string) => ({
    directory: root, timeoutMs: 20_000,
    readManifest: async () => ({ schema: 1 as const, version: "1.16.2", artifacts: [{ target: "linux-x64-baseline", file: "owned", sha256: createHash("sha256").update(bytes).digest("hex") }] }),
    verifyArtifact: async () => ({ path: join(root, "owned"), version: "1.16.2" }),
    run: async (args: string[]) => ({ ...(await shell(args, root)), signal: null }),
  })
  try {
    await mkdir(join(root, ".orchestra/bin"), { recursive: true })
    await Bun.write(binary, trusted)
    await chmod(binary, 0o755)
    expect(await readWslCommandVersion(binary, "Debian", options(trusted))).toBe("1.16.2")
    expect(await readFile(marker, "utf8")).toBe("--version\n")
    for (const scenario of ["tampered", "stale", "symlink", "outside"]) {
      await rm(marker, { force: true })
      await rm(binary, { force: true })
      const bytes = scenario === "stale" ? trusted.replace("'1.16.2", "'1.16.3") : trusted + "# changed\n"
      await Bun.write(binary, bytes)
      await chmod(binary, 0o755)
      const outside = join(root, "outside")
      await Bun.write(outside, trusted)
      await chmod(outside, 0o755)
      if (scenario === "symlink") { await rm(binary); await symlink(outside, binary) }
      await expect(spawnWslSidecar("Debian", {
        resolveOrchestra: async () => scenario === "outside" ? outside : binary,
        artifact: options(scenario === "stale" ? bytes : trusted),
      })).rejects.toThrow(WslArtifactError)
      expect(await Bun.file(marker).exists()).toBe(scenario === "stale")
      if (scenario === "stale") expect(await readFile(marker, "utf8")).toBe("--version\n")
    }
    expect(normalizeWslCommandVersion("1.16.2\n")).toBe("1.16.2")
    for (const output of ["", "orchestra v1.16.2", " 1.16.2", "1.16.2 extra", "1.16.2\nextra"]) {
      expect(normalizeWslCommandVersion(output)).toBeNull()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("guest architecture/ABI selects Linux baseline only", () => {
  expect(linuxGuestTarget("x86_64", "glibc 2.39")).toBe("linux-x64-baseline")
  expect(linuxGuestTarget("aarch64", "glibc 2.39")).toBe("linux-arm64")
  expect(() => linuxGuestTarget("riscv64", "glibc 2.39")).toThrow(WslArtifactError)
  expect(() => linuxGuestTarget("x86_64", "musl")).toThrow(WslArtifactError)
})

linuxGuestTest("Linux transfer verifies bytes/version, replaces foreign executable, preserves old on failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "w4-transfer-"))
  const source = join(root, "owned ' $(touch planted); artifact")
  const addon = join(root, "addon ' $(touch planted)")
  const supervisor = join(root, "supervisor ' $(touch planted)")
  const destination = join(root, ".orchestra/bin/orchestra")
  // Exits early unless the staged omni pair sits next to the binary, like the real CLI preflight.
  const bytes = "#!/bin/bash\n[[ -f \"${0%/*}/hugr_omni.node\" && -x \"${0%/*}/hugr-omni-supervisor\" ]] || exit 9\nprintf '1.16.2\\n'\n"
  const digest = createHash("sha256").update(bytes).digest("hex")
  const sha = (text: string) => createHash("sha256").update(text).digest("hex")
  // The digest over `sha256sum` lines of the tree's files, sorted by path.
  const treeSitter = join(root, "tree-sitter ' $(touch planted)")
  const treeDigest = sha(`${sha("index")}  tree-sitter/index.js\n${sha("binding")}  tree-sitter/prebuilds/linux-x64/tree-sitter.node\n`)
  const execute = (file: string, hash = digest, version = "1.16.2", timeout = "5s", addonHash = sha("addon"), treeHash = treeDigest) => shell(
    ["timeout", "--kill-after=1s", timeout, "bash", "-c", installGuestScript, "install", file, hash, version,
      addon, addonHash, supervisor, sha("supervisor"), treeSitter, treeHash], root,
  )
  try {
    await Bun.write(source, bytes)
    await Bun.write(addon, "addon")
    await Bun.write(supervisor, "supervisor")
    await Bun.write(join(treeSitter, "tree-sitter/index.js"), "index")
    await Bun.write(join(treeSitter, "tree-sitter/prebuilds/linux-x64/tree-sitter.node"), "binding")
    expect((await execute(source)).code).toBe(0)
    expect(await readFile(destination, "utf8")).toBe(bytes)
    expect((await stat(destination)).mode & 0o777).toBe(0o755)
    expect(await readFile(join(root, ".orchestra/bin", omniCompanions[0]), "utf8")).toBe("addon")
    expect(await readFile(join(root, ".orchestra/bin", omniCompanions[1]), "utf8")).toBe("supervisor")
    expect((await stat(join(root, ".orchestra/bin", omniCompanions[1]))).mode & 0o777).toBe(0o755)
    expect(await readFile(join(root, ".orchestra/bin/tree-sitter/tree-sitter/prebuilds/linux-x64/tree-sitter.node"), "utf8")).toBe("binding")
    await Bun.write(destination, "foreign-old")
    expect((await execute(source, digest, "1.16.2", "5s", "0".repeat(64))).code).toBe(84)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await execute(source, digest, "1.16.2", "5s", sha("addon"), "0".repeat(64))).code).toBe(84)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    // A symlink in the tree is not one of its regular files, so the digest no longer matches.
    await rm(join(treeSitter, "tree-sitter/index.js"))
    await symlink(source, join(treeSitter, "tree-sitter/index.js"))
    expect((await execute(source)).code).toBe(84)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    await rm(join(treeSitter, "tree-sitter/index.js"))
    await Bun.write(join(treeSitter, "tree-sitter/index.js"), "index")
    expect((await execute(source)).code).toBe(0)
    expect(await readFile(destination, "utf8")).toBe(bytes)
    await Bun.write(destination, "foreign-old")
    expect((await execute(source, "0".repeat(64))).code).toBe(84)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await execute(source, digest, "wrong-version")).code).toBe(82)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await execute(source)).code).toBe(0)
    expect(await readFile(destination, "utf8")).toBe(bytes)
    await Bun.write(destination, "foreign-old")
    for (const output of ["orchestra v1.16.2", "v1.16.2", "1.16.2 extra", "1.16.3", ""]) {
      const malformed = `#!/bin/bash\nprintf '%s\\n' '${output}'\n`
      await Bun.write(source, malformed)
      expect((await execute(source, createHash("sha256").update(malformed).digest("hex"))).code).toBe(82)
      expect(await readFile(destination, "utf8")).toBe("foreign-old")
    }
    await Bun.write(source, "not an executable\n")
    expect((await execute(source, createHash("sha256").update("not an executable\n").digest("hex"))).code).toBe(83)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    const fifo = join(root, "interrupted")
    expect((await shell(["mkfifo", fifo], root)).code).toBe(0)
    expect((await execute(fifo, digest, "1.16.2", "0.1s")).code).not.toBe(0)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await readdir(join(root, ".orchestra/bin"))).sort()).toEqual([...omniCompanions, "orchestra", "tree-sitter"].sort())
    const hung = "#!/bin/bash\ntrap '' TERM\nsleep 10\n"
    await Bun.write(source, hung)
    expect((await execute(source, createHash("sha256").update(hung).digest("hex"), "1.16.2", "0.1s")).code).toBe(137)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    await rm(join(root, ".orchestra/bin/tree-sitter"), { recursive: true })
    await symlink(treeSitter, join(root, ".orchestra/bin/tree-sitter"))
    expect((await execute(source)).code).toBe(85)
    await rm(join(root, ".orchestra/bin/tree-sitter"))
    await rm(destination)
    await symlink(source, destination)
    expect((await execute(source)).code).toBe(85)
    await rm(join(root, ".orchestra"), { recursive: true })
    await symlink(root, join(root, ".orchestra"))
    expect((await execute(source)).code).toBe(85)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("manifest seam bounds commands, converts host path as one argument, cancellation prevents transfer", async () => {
  const commands: string[][] = []
  const abort = new AbortController()
  const directory = await mkdtemp(join(tmpdir(), "w4-seam-"))
  await Promise.all(omniCompanions.map((name) => Bun.write(join(directory, "omni-linux-arm64", name), name)))
  await writeTreeSitterBundle(join(directory, "tree-sitter-linux-arm64"), "linux-arm64")
  const options = {
    directory,
    signal: abort.signal,
    timeoutMs: 90_000,
    readManifest: async () => ({ schema: 1 as const, version: "1.16.2", artifacts: [{ target: "linux-arm64", file: "owned", sha256: "a".repeat(64) }] }),
    verifyArtifact: async (_directory: string, target: string) => {
      expect(target).toBe("linux-arm64")
      return { path: "C:\\CLI ' $()\\owned", version: "1.16.2" }
    },
    run: async (args: string[], distro?: string | null, opts?: { timeoutMs?: number }) => {
      expect(distro).toBe("Ubuntu Preview")
      expect(opts?.timeoutMs).toBe(20_000)
      commands.push(args)
      return { code: 0, signal: null, stdout: args[0] === "wslpath" ? "/mnt/c/CLI ' $()/owned" : "aarch64\nglibc 2.39\n", stderr: "" }
    },
  }
  await installWslArtifact("Ubuntu Preview", "1.16.2", options)
  expect(commands[1]).toEqual(["wslpath", "-u", "--", "C:\\CLI ' $()\\owned"])
  expect(commands[2]).toEqual(["wslpath", "-u", "--", join(directory, "omni-linux-arm64", omniCompanions[0])])
  expect(commands[3]).toEqual(["wslpath", "-u", "--", join(directory, "omni-linux-arm64", omniCompanions[1])])
  expect(commands[4]).toEqual(["wslpath", "-u", "--", join(directory, "tree-sitter-linux-arm64")])
  expect(commands[5]?.slice(0, 4)).toEqual(["timeout", "--kill-after=1s", "18s", "bash"])
  expect(commands[5]?.slice(-9, -1)).toEqual([
    "/mnt/c/CLI ' $()/owned", "a".repeat(64), "1.16.2",
    "/mnt/c/CLI ' $()/owned", createHash("sha256").update(omniCompanions[0]).digest("hex"),
    "/mnt/c/CLI ' $()/owned", createHash("sha256").update(omniCompanions[1]).digest("hex"),
    "/mnt/c/CLI ' $()/owned",
  ])
  expect(commands[5]?.at(-1)).toMatch(/^[a-f0-9]{64}$/)
  abort.abort()
  await expect(installWslArtifact("Ubuntu Preview", "1.16.2", options)).rejects.toThrow()
  expect(commands.length).toBe(6)
  const duringVerification = new AbortController()
  await expect(installWslArtifact("Ubuntu Preview", "1.16.2", {
    ...options, signal: duringVerification.signal,
    verifyArtifact: async () => {
      duringVerification.abort()
      return { path: "unused", version: "1.16.2" }
    },
  })).rejects.toThrow()
  expect(commands.length).toBe(7)
  await rm(directory, { recursive: true, force: true })
})

test("bundle without the Linux omni pair or tree-sitter refuses the install by name before any transfer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "w4-unavailable-"))
  const treeSitter = join(directory, "tree-sitter-linux-x64-baseline")
  await writeTreeSitterBundle(treeSitter, "linux-x64-baseline")
  const commands: string[][] = []
  const install = () => installWslArtifact("Ubuntu", "1.16.2", {
    directory,
    readManifest: async () => ({ schema: 1 as const, version: "1.16.2", artifacts: [{ target: "linux-x64-baseline", file: "owned", sha256: "a".repeat(64) }] }),
    verifyArtifact: async () => ({ path: join(directory, "owned"), version: "1.16.2" }),
    run: async (args: string[]) => {
      commands.push(args)
      return { code: 0, signal: null, stdout: args[0] === "wslpath" ? "/mnt/c/owned" : "x86_64\nglibc 2.39\n", stderr: "" }
    },
  }).then(() => undefined, (error: unknown) => error)
  try {
    for (const present of [[], [omniCompanions[0]], [omniCompanions[1]]]) {
      await rm(join(directory, "omni-linux-x64-baseline"), { recursive: true, force: true })
      await Promise.all(present.map((name) => Bun.write(join(directory, "omni-linux-x64-baseline", name), name)))
      commands.length = 0
      const error = await install()
      expect(error).toBeInstanceOf(WslArtifactError)
      expect((error as WslArtifactError).reason).toBe("unavailable")
      expect((error as WslArtifactError).message).toBe("Installing the server in WSL is not available yet")
      expect(commands.map((args) => args[0])).toEqual(["bash"])
    }
    await Promise.all(omniCompanions.map((name) => Bun.write(join(directory, "omni-linux-x64-baseline", name), name)))
    const binding = join(treeSitter, "tree-sitter", "prebuilds", "linux-x64", "tree-sitter.node")
    await rename(binding, `${binding}.away`)
    commands.length = 0
    expect(((await install()) as WslArtifactError).reason).toBe("unavailable")
    expect(commands.map((args) => args[0])).toEqual(["bash"])
    await rename(`${binding}.away`, binding)
    // Control: with both companions and tree-sitter present the same seam reaches the guest transfer.
    commands.length = 0
    expect(await install()).toBeUndefined()
    expect(commands.map((args) => args[0])).toEqual(["bash", "wslpath", "wslpath", "wslpath", "wslpath", "timeout"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test.each([false, true])("protected health rejects open/unhealthy servers (protected=%s)", async (protectedServer) => {
  const server = Bun.serve({ port: 0, fetch: (request) => protectedServer && request.headers.get("authorization") !== `Basic ${Buffer.from("orchestra:credential").toString("base64")}` ? new Response(null, { status: 401 }) : Response.json({ healthy: !protectedServer }) })
  try {
    expect(await checkWslAuthentication(server.url.toString(), "credential")).toBe(false)
  } finally {
    server.stop(true)
  }
})

linuxGuestTest("real owned V2 CLI guest credential authenticates foreground server in isolated data", async () => {
  const root = await mkdtemp(join(tmpdir(), "w4-service-"))
  const env = isolatedEnv(root)
  const cli = join(import.meta.dir, "../../../../cli/src/index.ts")
  const executable = join(root, "orchestra ' $()")
  await Bun.write(executable, `#!/bin/bash\nexec ${shellEscape(process.execPath)} ${shellEscape(cli)} "$@"\n`)
  await chmod(executable, 0o755)
  const credential = Bun.spawn(["bash", "-c", `${guestEnvironment}\nexec ${shellEscape(executable)} service password`], { env, stdout: "pipe", stderr: "pipe" })
  const password = (await new Response(credential.stdout).text()).trim()
  expect(await credential.exited).toBe(0)
  expect(password.length).toBeGreaterThan(20)
  const server = Bun.spawn(["bash", "-c", wslServeScript(executable, 0)], { env, stdout: "pipe", stderr: "pipe" })
  try {
    const reader = server.stdout.getReader()
    const output = await Promise.race([reader.read(), Bun.sleep(20_000).then(() => { throw new Error("V2 startup timed out") })])
    const url = new TextDecoder().decode(output.value).match(/http:\/\/[^\s]+/)?.[0]
    expect(url).toBeDefined()
    expect(await checkWslAuthentication(url!, password)).toBe(true)
    expect((await stat(join(root, ".local/state/orchestra/password"))).mode & 0o777).toBe(0o600)
  } finally {
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

linuxGuestTest("real owned CLI --version output passes guest install and admission", async () => {
  // The guest checks run against what the owned CLI really prints, not a hand-written imitation of it.
  const root = await mkdtemp(join(tmpdir(), "w4-real-version-"))
  const cli = join(import.meta.dir, "../../../../cli/src/index.ts")
  const executable = join(root, "owned ' $()")
  const bytes = `#!/bin/bash\nexec ${shellEscape(process.execPath)} ${shellEscape(cli)} "$@"\n`
  const targets = ["linux-x64-baseline", "linux-arm64"]
  // A source run reports InstallationVersion "local", as a compiled CLI reports the version it was built with.
  const options = {
    directory: root,
    timeoutMs: 20_000,
    readManifest: async () => ({
      schema: 1 as const,
      version: "local",
      artifacts: targets.map((target) => ({ target, file: "owned", sha256: createHash("sha256").update(bytes).digest("hex") })),
    }),
    verifyArtifact: async () => ({ path: executable, version: "local" }),
    // On a Linux host the host path already is the guest path.
    run: async (args: string[]) =>
      args[0] === "wslpath" ? { code: 0, signal: null, stdout: args[3]!, stderr: "" } : { ...(await shell(args, root)), signal: null },
  }
  try {
    await Bun.write(executable, bytes)
    await chmod(executable, 0o755)
    await Promise.all(targets.flatMap((target) => omniCompanions.map((name) => Bun.write(join(root, `omni-${target}`, name), name))))
    await Promise.all(targets.map((target) => writeTreeSitterBundle(join(root, `tree-sitter-${target}`), target)))
    await installWslArtifact("Ubuntu", "local", options)
    expect(await readWslCommandVersion(join(root, ".orchestra/bin/orchestra"), "Ubuntu", options)).toBe("local")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

function isolatedEnv(root: string) {
  return { ...process.env, HOME: root, TMPDIR: root, ORCHESTRA_TEST_HOME: root,
    XDG_STATE_HOME: join(root, "state"), XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
    ORCHESTRA_CONFIG_DIR: join(root, "config"), ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true" }
}

async function shell(args: string[], root: string) {
  const child = Bun.spawn(args, { env: isolatedEnv(root), cwd: root, stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(child.stdout).text()
  const stderr = await new Response(child.stderr).text()
  return { code: await child.exited, stdout, stderr }
}
