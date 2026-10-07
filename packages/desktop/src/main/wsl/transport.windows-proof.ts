import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installWslArtifact } from "./artifact"
import { runWsl, runWslInDistro, shellEscape } from "./runtime"

// Required Windows-only lane: missing WSL is a failure, never a skipped proof.
test("real Windows/WSL transport copies verified host bytes to isolated guest HOME", async () => {
  expect(process.platform).toBe("win32")
  const list = await runWsl(["--list", "--quiet"])
  expect(list.code).toBe(0)
  const distro = list.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  expect(distro).toBeDefined()
  const guest = await runWslInDistro(["bash", "-c", "mktemp -d"], distro)
  expect(guest.code).toBe(0)
  const home = guest.stdout.trim()
  expect(home.startsWith("/tmp/")).toBe(true)
  const host = await mkdtemp(join(tmpdir(), "w4-transport-"))
  const source = join(host, "owned ' $() executable")
  const bytes = "#!/bin/bash\nprintf '1.16.2\\n'\n"
  try {
    await Bun.write(source, bytes)
    await installWslArtifact(distro!, "1.16.2", {
      directory: host,
      readManifest: async () => ({ schema: 1, version: "1.16.2", artifacts: ["linux-x64-baseline", "linux-arm64"].map((target) => ({ target, file: "owned", sha256: createHash("sha256").update(bytes).digest("hex") })) }),
      verifyArtifact: async () => ({ path: source, version: "1.16.2" }),
      run: (args, distro, opts) => {
        const index = args.indexOf("-c") + 1
        return runWslInDistro(args.includes("bash") ? args.map((value, offset) => offset === index ? `export HOME=${shellEscape(home)};\n${value}` : value) : args, distro, opts)
      },
    })
    const installed = await runWslInDistro(["bash", "-c", `${shellEscape(`${home}/.orchestra/bin/orchestra`)} --version`], distro)
    expect(installed.code).toBe(0)
    expect(installed.stdout.trim()).toBe("1.16.2")
  } finally {
    await runWslInDistro(["rm", "-rf", "--", home], distro)
    await rm(host, { recursive: true, force: true })
  }
}, 60_000)
