import { createHash } from "node:crypto"
import { mkdtemp, mkdir, open, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"

class ProofFailure extends Error {}
function requireProof(value: unknown, name: string): asserts value {
  if (!value) throw new ProofFailure(name)
}
async function named<T>(name: string, work: () => Promise<T>) {
  return work().catch(() => { throw new ProofFailure(name) })
}

async function main() {
  const args = parseArgs({ options: {
    resources: { type: "string" }, distro: { type: "string" }, report: { type: "string" },
  }, strict: true, allowPositionals: false }).values
  requireProof(args.resources && args.distro && args.report, "CLI_ARGUMENTS_REQUIRED")
  requireProof(!/[\r\n\0]/.test(args.distro), "DISTRO_NAME_INVALID")
  const report = await named("REPORT_NOT_FRESH_OR_WRITABLE", () => open(resolve(args.report!), "wx", 0o600))
  const evidence: Record<string, unknown> = { boundary: "production installer + foreground CLI via wslServeScript", hostCPU: process.arch, hostOS: process.platform }
  try {
    requireProof(process.platform === "win32", "INFRA_WINDOWS_REQUIRED")
    const runtime = await named("INFRA_DESKTOP_RUNTIME_IMPORT", () => import("../src/main/wsl/runtime"))
    const artifact = await import("../src/main/wsl/artifact")
    const sidecar = await import("../src/main/wsl/sidecar")
    const signal = AbortSignal.timeout(180_000)
    const options = { signal, timeoutMs: 20_000 }
    const list = await named("INFRA_WSL_UNAVAILABLE", () => runtime.runWsl(["--list", "--quiet"], options))
    requireProof(list.code === 0, "INFRA_WSL_UNAVAILABLE")
    requireProof(list.stdout.split(/\r?\n/).map((line) => line.trim()).includes(args.distro), "INFRA_DISTRO_NOT_INSTALLED")
    const probe = await named("INFRA_DISTRO_EXECUTION", () => runtime.runWslInDistro([
      "env", "-i", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "bash", "--noprofile", "--norc", "-c",
      "set -eu; for c in env uname getconf sha256sum timeout mktemp mkdir cp chmod mv rm sleep wslpath stat touch; do command -v \"$c\" >/dev/null || exit 90; done; uname -m; getconf GNU_LIBC_VERSION",
    ], args.distro, options))
    requireProof(probe.code === 0, "INFRA_BASH_COREUTILS_GLIBC_REQUIRED")
    const cpu = probe.stdout.trim().split(/\r?\n/)
    requireProof(["x86_64", "aarch64"].includes(cpu[0]!), "INFRA_GUEST_CPU_UNSUPPORTED")
    requireProof(/^glibc \d+\.\d+$/.test(cpu[1] ?? ""), "INFRA_GUEST_ABI_UNSUPPORTED")
    const target = artifact.linuxGuestTarget(cpu[0]!, cpu[1] ?? "")
    const directory = resolve(args.resources)
    const manifest = await named("PRODUCER_MANIFEST_INVALID", () => readCliManifest(directory))
    const source = await named("PRODUCER_ARTIFACT_INVALID", () => verifyCliArtifact(directory, target))
    const entry = manifest.artifacts.find((item) => item.target === target)!
    Object.assign(evidence, { guestCPU: cpu[0], guestABI: cpu[1], target, version: source.version, digest: entry.sha256, distro: args.distro })
    const temporary = await named("INFRA_GUEST_HOME_CREATE", () => runtime.runWslInDistro(["env", "-i", "PATH=/usr/bin:/bin", "mktemp", "-d", "/tmp/orchestra-product-proof.XXXXXXXX"], args.distro, options))
    requireProof(temporary.code === 0, "INFRA_GUEST_HOME_CREATE")
    const home = temporary.stdout.trim()
    requireProof(/^\/tmp\/orchestra-product-proof\.[A-Za-z0-9]+$/.test(home), "INFRA_GUEST_HOME_INVALID")
    const launch: { result?: Promise<Awaited<ReturnType<typeof runtime.runWslInDistro>>> } = {}
    const host: { path?: string } = {}
    // No inherited guest environment, shell profiles, credentials, or shared CLI temp paths.
    const environment = ["env", "-i", `HOME=${home}`, "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "WSLENV=",
      `XDG_DATA_HOME=${home}/data`, `XDG_STATE_HOME=${home}/.local/state`, `XDG_CACHE_HOME=${home}/cache`,
      `XDG_CONFIG_HOME=${home}/config`, `TMPDIR=${home}/tmp`, `ORCHESTRA_DB=${home}/proof.sqlite`, "ORCHESTRA_INHERIT_CREDENTIALS=0"]
    const run: typeof runtime.runWslInDistro = (command, distro, opts) => runtime.runWslInDistro([
      ...environment, "bash", "--noprofile", "--norc", "-c", 'cd "$HOME" && exec "$@"', "owned-wsl-proof", ...command,
    ], distro, opts)
    const command = async (script: string, cleanup = false) => {
      const result = await named("INFRA_GUEST_COMMAND", () => run(["bash", "--noprofile", "--norc", "-c", script], args.distro,
        cleanup ? { timeoutMs: 10_000 } : options))
      requireProof(result.code === 0, "INFRA_GUEST_COMMAND_FAILED")
      return result.stdout.trim()
    }
    const installed = `${home}/.orchestra/bin/orchestra`
    const installOptions = { directory, run, ...options }
    const verified = async () => {
      const version = await artifact.verifyWslGuestArtifact(args.distro!, installed, installOptions)
      requireProof(runtime.normalizeWslCommandVersion(version) === source.version, "GUEST_VERSION_MISMATCH")
    }
    try {
      host.path = await mkdtemp(join(tmpdir(), "orchestra-wsl-product-proof-"))
      await command('mkdir -p -- "$TMPDIR"; cd "$HOME"')
      await named("INSTALL_NEW_FAILED", () => artifact.installWslArtifact(args.distro!, source.version, installOptions))
      await verified()
      const before = await command(`stat -c '%i:%Y:%s' -- ${runtime.shellEscape(installed)}`)
      await artifact.installWslArtifact(args.distro!, source.version, installOptions)
      await verified()
      const baseline = await command(`stat -c '%i:%Y:%s' -- ${runtime.shellEscape(installed)}`)
      evidence.newInstall = true
      evidence.exactRetry = true
      // Negative descriptors copy actual producer bytes into owned host storage only.
      const bytes = await Bun.file(source.path).bytes()
      requireProof(createHash("sha256").update(bytes).digest("hex") === entry.sha256, "PRODUCER_BYTES_CHANGED")
      const negative = join(host.path, "negative")
      await mkdir(negative)
      await Bun.write(join(negative, entry.file), bytes)
      const descriptor = { schema: 1, version: source.version, artifacts: [{ ...entry, sha256: "0".repeat(64) }] }
      await Bun.write(join(negative, "manifest.json"), JSON.stringify(descriptor))
      const refused = () => artifact.installWslArtifact(args.distro!, source.version, { ...installOptions, directory: negative })
        .then(() => false, (error: unknown) => error instanceof Error && error.message === `CLI artifact digest mismatch: ${target}`)
      requireProof(await refused(), "WRONG_DIGEST_NOT_REFUSED")
      await verified()
      descriptor.artifacts[0]!.sha256 = entry.sha256
      await Bun.write(join(negative, "manifest.json"), JSON.stringify(descriptor))
      await Bun.write(join(negative, entry.file), Buffer.concat([Buffer.from(bytes), Buffer.from("altered-cache")]))
      requireProof(await refused(), "ALTERED_HOST_CACHE_NOT_REFUSED")
      await verified()
      // Both refusals must leave the last successful installation untouched.
      const preserved = await command(`stat -c '%i:%Y:%s' -- ${runtime.shellEscape(installed)}`)
      requireProof(preserved === baseline, "REFUSED_INPUT_REPLACED_INSTALLED_BINARY")
      evidence.retryReplacedInode = before !== preserved
      evidence.wrongDigestRefused = true
      evidence.alteredHostCacheRefused = true
      await command(`printf 'altered-cache' >> ${runtime.shellEscape(installed)}`)
      const rejected = await artifact.verifyWslGuestArtifact(args.distro, installed, installOptions)
        .then(() => false, (error: unknown) => error instanceof artifact.WslArtifactError && error.reason === "bytes")
      requireProof(rejected, "ALTERED_GUEST_CACHE_NOT_REFUSED")
      await artifact.installWslArtifact(args.distro, source.version, installOptions)
      await verified()
      evidence.alteredGuestCacheRefused = true
      const credential = await command(`${artifact.guestEnvironment}\ncd "$HOME"\nexec ${runtime.shellEscape(installed)} service password`)
      requireProof(credential.length > 0 && !/[\r\n]/.test(credential), "PASSWORD_COMMAND_INVALID")
      const port = await new Promise<number>((resolvePort, reject) => {
        const server = createServer()
        server.once("error", () => reject(new ProofFailure("INFRA_LOOPBACK_PORT")))
        server.listen(0, "127.0.0.1", () => {
          const address = server.address()
          if (!address || typeof address === "string") { server.close(); reject(new ProofFailure("INFRA_LOOPBACK_PORT")); return }
          server.close((error) => error ? reject(new ProofFailure("INFRA_LOOPBACK_PORT")) : resolvePort(address.port))
        })
      })
      // Supervisor owns exactly one child PID; stop marker and deadline never target another session.
      const script = `set -euo pipefail
cd "$HOME"
bash --noprofile --norc -c ${runtime.shellEscape(sidecar.wslServeScript(installed, port))} >/dev/null 2>&1 &
child=$!
cleanup() { if [[ $(jobs -pr) == "$child" ]]; then kill -TERM "$child" 2>/dev/null || true; fi; for n in {1..25}; do [[ $(jobs -pr) == "$child" ]] || break; sleep 0.2; done; if [[ $(jobs -pr) == "$child" ]]; then kill -KILL "$child" 2>/dev/null || true; fi; wait "$child" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT TERM
deadline=$((SECONDS+65))
while [[ ! -e "$HOME/stop" ]]; do kill -0 "$child" 2>/dev/null || exit 91; (( SECONDS < deadline )) || exit 92; sleep 0.2; done`
      launch.result = run(["bash", "--noprofile", "--norc", "-c", script], args.distro, { timeoutMs: 80_000 })
        .catch(() => { throw new ProofFailure("INFRA_SERVE_TRANSPORT") })
      void launch.result.catch(() => {})
      const healthSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      const request = (password?: string) => fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: password === undefined ? {} : { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
        signal: AbortSignal.any([healthSignal, AbortSignal.timeout(3000)]),
      })
      const ready = async () => {
        while (!healthSignal.aborted) {
          const response = await request(credential).catch(() => undefined)
          const body: unknown = response?.ok ? await response.json().catch(() => null) : null
          if (body && typeof body === "object" && "healthy" in body && body.healthy === true) return
          await Bun.sleep(100)
        }
        throw new ProofFailure("INFRA_AUTHENTICATED_HEALTH_DEADLINE")
      }
      await Promise.race([ready(), launch.result.then(() => { throw new ProofFailure("SERVE_EXITED_BEFORE_HEALTH") })])
      const wrong = await named("WRONG_AUTH_REQUEST_FAILED", () => request(`${credential}-invalid`))
      const absent = await named("MISSING_AUTH_REQUEST_FAILED", () => request())
      requireProof([401, 403].includes(wrong.status), "WRONG_AUTH_NOT_REFUSED")
      requireProof([401, 403].includes(absent.status), "MISSING_AUTH_NOT_REFUSED")
      Object.assign(evidence, { authenticatedHealthy: true, wrongAuthRefused: true, missingAuthRefused: true })
    } finally {
      // Cleanup has its own deadline even after the proof signal expires.
      try {
        if (launch.result) {
          await command('touch "$HOME/stop"', true)
          const stopped = await launch.result
          requireProof(stopped.code === 0, "SERVE_OR_CLEANUP_FAILED")
        }
        await command(`rm -rf -- ${runtime.shellEscape(home)}`, true)
      } finally {
        if (host.path) await rm(host.path, { recursive: true, force: true })
      }
    }
    await report.writeFile(JSON.stringify({ ...evidence, status: "passed" }, null, 2))
  } catch (error) {
    const failure = error instanceof ProofFailure ? error.message : "PROOF_UNEXPECTED_FAILURE"
    await report.writeFile(JSON.stringify({ ...evidence, status: "failed", failure }, null, 2))
    throw new ProofFailure(failure)
  } finally {
    await report.close()
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof ProofFailure ? error.message : "PROOF_ARGUMENT_OR_REPORT_FAILURE")
  process.exitCode = 1
})
