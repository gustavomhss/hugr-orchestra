import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { guestEnvironment, installGuestScript, installWslArtifact, linuxGuestTarget, WslArtifactError } from "./artifact"
import { checkWslAuthentication } from "./startup"
import { wslServeScript } from "./sidecar"
import { shellEscape } from "./runtime"

test("guest architecture/ABI selects Linux baseline only", () => {
  expect(linuxGuestTarget("x86_64", "glibc 2.39")).toBe("linux-x64-baseline")
  expect(linuxGuestTarget("aarch64", "glibc 2.39")).toBe("linux-arm64")
  expect(() => linuxGuestTarget("riscv64", "glibc 2.39")).toThrow(WslArtifactError)
  expect(() => linuxGuestTarget("x86_64", "musl")).toThrow(WslArtifactError)
})

test("Linux transfer verifies bytes/version, replaces foreign executable, preserves old on failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "w4-transfer-"))
  const source = join(root, "owned ' $(touch planted); artifact")
  const destination = join(root, ".orchestra/bin/orchestra")
  const bytes = "#!/bin/bash\nprintf 'orchestra v1.16.2\\n'\n"
  const digest = createHash("sha256").update(bytes).digest("hex")
  const execute = (file: string, hash = digest, version = "1.16.2", timeout = "5s") => shell(
    ["timeout", "--kill-after=1s", timeout, "bash", "-c", installGuestScript, "install", file, hash, version], root,
  )
  try {
    await Bun.write(source, bytes)
    expect((await execute(source)).code).toBe(0)
    expect(await readFile(destination, "utf8")).toBe(bytes)
    expect((await stat(destination)).mode & 0o777).toBe(0o755)
    await Bun.write(destination, "foreign-old")
    expect((await execute(source, "0".repeat(64))).code).toBe(84)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await execute(source, digest, "wrong-version")).code).toBe(82)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
    expect((await execute(source)).code).toBe(0)
    expect(await readFile(destination, "utf8")).toBe(bytes)
    await Bun.write(destination, "foreign-old")
    for (const output of ["1.16.2", "orchestra v", "orchestra v1.16.2 extra", "orchestra v1.16.3"]) {
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
    expect(await readdir(join(root, ".orchestra/bin"))).toEqual(["orchestra"])
    const hung = "#!/bin/bash\ntrap '' TERM\nsleep 10\n"
    await Bun.write(source, hung)
    expect((await execute(source, createHash("sha256").update(hung).digest("hex"), "1.16.2", "0.1s")).code).toBe(137)
    expect(await readFile(destination, "utf8")).toBe("foreign-old")
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
  const options = {
    directory: "resources/cli",
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
  expect(commands[2]?.slice(0, 4)).toEqual(["timeout", "--kill-after=1s", "18s", "bash"])
  expect(commands[2]?.slice(-3)).toEqual(["/mnt/c/CLI ' $()/owned", "a".repeat(64), "1.16.2"])
  abort.abort()
  await expect(installWslArtifact("Ubuntu Preview", "1.16.2", options)).rejects.toThrow()
  expect(commands.length).toBe(3)
  const duringVerification = new AbortController()
  await expect(installWslArtifact("Ubuntu Preview", "1.16.2", {
    ...options, signal: duringVerification.signal,
    verifyArtifact: async () => {
      duringVerification.abort()
      return { path: "unused", version: "1.16.2" }
    },
  })).rejects.toThrow()
  expect(commands.length).toBe(4)
})

test.each([false, true])("protected health rejects open/unhealthy servers (protected=%s)", async (protectedServer) => {
  const server = Bun.serve({ port: 0, fetch: (request) => protectedServer && request.headers.get("authorization") !== `Basic ${Buffer.from("orchestra:credential").toString("base64")}` ? new Response(null, { status: 401 }) : Response.json({ healthy: !protectedServer }) })
  try {
    expect(await checkWslAuthentication(server.url.toString(), "credential")).toBe(false)
  } finally {
    server.stop(true)
  }
})

test("real owned V2 CLI guest credential authenticates foreground server in isolated data", async () => {
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
