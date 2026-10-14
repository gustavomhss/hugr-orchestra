import { expect } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { distributionRecipes } from "../../script/distribution-recipes"
import { verifyDistribution } from "../../script/distribution-payload"
import { command, sandbox, sha256, skillIdentity, snapshot, successful, target } from "./distribution-native"
import type { Built, Sandbox } from "./distribution-native"
import { qualify, stopServices } from "./distribution-native-proof"
import { homebrewCommand, privateBrew } from "./distribution-homebrew-process"

const targets = ["darwin-arm64", "darwin-x64-baseline", "linux-x64-baseline", "linux-arm64"]
const formula = "qualification/native/orchestra"
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

export async function homebrewChannel(directory: string, built: Built, preserve: () => void) {
  const box = await sandbox(join(directory, "homebrew"))
  const fixture = await privateBrew(box)
  const https = await trustedArchives(box, built, preserve)
  const brewBox = { ...box, env: { ...fixture.env, HOMEBREW_CURL_PATH: https.wrapper } }
  const brew = (args: string[]) => successful([fixture.brew, ...args], brewBox, 300_000)
  const retained = new Map<string, Awaited<ReturnType<typeof kegSnapshot>>>()
  const skills = new Map<string, Awaited<ReturnType<typeof snapshot>>>()
  const launcher = join(fixture.prefix, "bin/orchestra")
  try {
    // Bootstrap the clone's portable Ruby before recording installer-owned state.
    expect(await brew(["ruby", "-e", 'puts "HOMEBREW_PRIVATE_RUBY_READY"']))
      .toBe("HOMEBREW_PRIVATE_RUBY_READY")
    // HB-HTTPS: trusted TLS positive control; default roots must reject our private CA.
    const selectedURL = https.records[0].find((asset) => asset.served)?.url
    if (!selectedURL) throw new Error("HOMEBREW_SELECTED_ASSET_MISSING")
    const untrusted = await command([https.curl, "--disable", "--fail", "--silent", "--show-error", selectedURL], box)
    expect(untrusted.code, "HOMEBREW_PRIVATE_CA_MUST_BE_REQUIRED").toBe(60)
    for (const assets of https.records) {
      for (const asset of assets.filter((asset) => !asset.served)) {
        const refused = await command([https.wrapper, "--fail", "--silent", "--show-error", asset.url], box)
        expect(refused.code, `HOMEBREW_FOREIGN_ASSET_MUST_FAIL: ${asset.target}\n${refused.stderr}`).toBe(22)
      }
    }
    const start = https.requests.length
    for (const [index, payload] of built.payloads.entries()) {
      await stopServices()
      const before = await snapshot(box.namespace)
      // HB-UPDATE: real upgrade keeps the old public launcher linked during checksum validation.
      // HOMEBREW_NO_INSTALL_CLEANUP retains both kegs for immutable checks and rollback.
      const install = [index === 0 ? "install" : "upgrade", "--formula", formula]
      if (index > 0) expect(await realpath(launcher))
        .toBe(await realpath(join(fixture.cellar, "orchestra", built.payloads[index - 1].version, "libexec/bin/orchestra")))
      const source = distributionRecipes({ version: payload.version, assets: https.records[index] }).homebrew
      // HB-CHECKSUM: the correct generated sha256 must reject tampered download bytes.
      expect(https.records[index].find((asset) => asset.target === target)?.sha256).toBe(payload.archive.sha256)
      expect(https.tampered[index].sha256).not.toBe(payload.archive.sha256)
      const cache = await mkdtemp(join(box.directory, "brew-checksum-cache-"))
      const installBox = { ...brewBox, env: { ...brewBox.env, HOMEBREW_CACHE: cache } }
      expect(await readdir(cache)).toEqual([])
      await Bun.write(join(fixture.tap, "Formula/orchestra.rb"), source)
      // Commit the correct formula in the private tap before either command reads its trusted recipe.
      await successful([fixture.git, "-C", fixture.tap, "add", "Formula/orchestra.rb"], brewBox)
      await successful([fixture.git, "-C", fixture.tap, "-c", "user.name=Qualification", "-c",
        "user.email=qualification@example.invalid", "commit", "-m", `Formula ${payload.version}`], brewBox)
      const committed = await command([fixture.git, "-C", fixture.tap, "show", "HEAD:Formula/orchestra.rb"], brewBox)
      expect(committed.code, "HOMEBREW_COMMITTED_RECIPE_READ_FAILED").toBe(0)
      expect(committed.stdout, "HOMEBREW_COMMITTED_RECIPE_MUST_MATCH_GENERATED_BYTES").toBe(source)
      expect(await readFile(join(fixture.tap, "Formula/orchestra.rb"), "utf8")).toBe(source)
      const activationBefore = await orchestraActivationSnapshot(fixture.prefix)
      const requestBefore = https.requests.length
      https.tamper.enabled = true
      console.info(`Homebrew checksum control: ${payload.version}`)
      const rejected = await homebrewCommand([fixture.brew, ...install], installBox, fixture.artifacts,
        `checksum-${payload.version}`, () => https.requests.slice(requestBefore), preserve)
      // Capture Orchestra's post-command state before an assertion can hide recovery behaviour.
      // A version-named directory alone does not identify the payload installed inside it.
      const activationAfter = await orchestraActivationSnapshot(fixture.prefix)
      const candidate = await lstat(join(fixture.cellar, "orchestra", payload.version)).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
        throw error
      })
      if (candidate) preserve()
      const evidence = {
        brewRevision: fixture.revision, version: payload.version, command: install, cache,
        recipeSha256: sha256(source), expectedSha256: payload.archive.sha256,
        tamperedSha256: https.tampered[index].sha256, rejected,
        requests: https.requests.slice(requestBefore),
        activation: [{ phase: "before", state: activationBefore }, { phase: "after", state: activationAfter }]
          .map((phase) => ({
            phase: phase.phase, entries: phase.state.entries.map((entry) => ({
              path: entry.path, kind: entry.kind,
              mode: "mode" in entry ? entry.mode : undefined,
              link: "link" in entry ? entry.link : undefined,
              resolved: "resolved" in entry ? entry.resolved : undefined,
              sha256: "bytes" in entry && entry.bytes ? sha256(entry.bytes) : undefined,
            })),
            kegs: phase.state.kegs ? [...phase.state.kegs].map(([path, entry]) => ({
              path, kind: entry.kind, mode: entry.mode, link: entry.link,
              sha256: entry.bytes ? sha256(entry.bytes) : undefined,
              knownPayloadVersions: entry.bytes && path.split("/")[1] === "libexec"
                ? built.payloads.filter((known) => known.snapshot?.files.get(path.split("/").slice(2).join("/"))
                  ?.bytes.equals(entry.bytes!)).map((known) => known.version) : undefined,
              metadata: entry.bytes && ["libexec/distribution.json", "libexec/package.json", "INSTALL_RECEIPT.json"]
                .some((file) => path.endsWith(`/${file}`)) ? entry.bytes.toString("utf8") : undefined,
            })) : undefined,
          })),
      }
      await Bun.write(join(fixture.artifacts, `checksum-${payload.version}.json`), JSON.stringify(evidence, null, 2))
      console.info(`Homebrew rejection state: ${JSON.stringify({
        brewRevision: fixture.revision, version: payload.version, code: rejected.code,
        before: evidence.activation[0].entries, after: evidence.activation[1].entries,
        candidate: evidence.activation[1].kegs?.filter((entry) =>
          entry.path === payload.version || entry.path.startsWith(`${payload.version}/`)),
      })}`)
      expect(rejected.code, "HOMEBREW_TAMPERED_ARCHIVE_MUST_FAIL").not.toBe(0)
      const mismatch = /SHA256 mismatch/i.test(rejected.stderr)
      expect(mismatch || new RegExp(
        `^Error: Formula reports different checksum:[ \\t]+${payload.archive.sha256}[ \\t]*\\r?$`, "m"
      ).test(rejected.stderr), "HOMEBREW_CHECKSUM_DIAGNOSTIC_REQUIRED").toBe(true)
      if (mismatch) {
        expect(rejected.stderr).toContain(`Expected: ${payload.archive.sha256}`)
        expect(rejected.stderr).toContain(`Actual: ${https.tampered[index].sha256}`)
      }
      expect(https.requests.slice(requestBefore).some((request) =>
        request.served && request.version === payload.version && request.target === target &&
        request.tampered && request.downloadSha256 === https.tampered[index].sha256)).toBe(true)
      for (const [old, expected] of retained)
        expect(await kegSnapshot(old), "HOMEBREW_CHECKSUM_FAILURE_MUST_PRESERVE_OLD_KEG").toEqual(expected)
      expect(activationAfter.entries,
        "HOMEBREW_CHECKSUM_FAILURE_MUST_PRESERVE_PUBLIC_OPT_AND_LINKED_ENTRIES").toEqual(activationBefore.entries)
      expect(await snapshot(box.namespace), "HOMEBREW_CHECKSUM_FAILURE_MUST_NOT_EXTRACT_SKILLS").toEqual(before)
      if (index > 0) {
        const previous = built.payloads[index - 1]
        console.info(`Homebrew failure-preservation control: ${previous.version}`)
        await qualify({ launcher, payload: join(fixture.cellar, "orchestra", previous.version, "libexec"),
          version: previous.version, box, oracle: built.oracle })
        for (const [old, expected] of retained) expect(await kegSnapshot(old)).toEqual(expected)
        for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
        expect(await snapshot(box.namespace)).toEqual(before)
      }
      expect(candidate, "HOMEBREW_REJECTED_CANDIDATE_KEG_MUST_NOT_EXIST").toBeUndefined()
      expect(activationAfter,
        "HOMEBREW_CHECKSUM_FAILURE_MUST_NOT_CHANGE_ORCHESTRA_ACTIVATION").toEqual(activationBefore)
      https.tamper.enabled = false
      // Only this mkdtemp-owned cache is cleared; the correct recipe gets a genuine fresh download.
      await rm(cache, { recursive: true })
      await mkdir(cache)
      const correctRequestBefore = https.requests.length
      console.info(`Homebrew ${index === 0 ? "install" : "upgrade"}: ${payload.version}`)
      const accepted = await homebrewCommand([fixture.brew, ...install], installBox, fixture.artifacts,
        `install-${payload.version}`, () => https.requests.slice(correctRequestBefore), preserve)
      expect(accepted.code, accepted.stderr).toBe(0)
      expect(https.requests.slice(correctRequestBefore).some((request) =>
        request.served && request.version === payload.version && request.target === target &&
        !request.tampered && request.downloadSha256 === payload.archive.sha256)).toBe(true)
      expect(await snapshot(box.namespace), "HOMEBREW_INSTALL_MUST_NOT_EXTRACT_SKILLS").toEqual(before)
      for (const [old, expected] of retained) expect(await kegSnapshot(old)).toEqual(expected)
      for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
      const keg = join(fixture.cellar, "orchestra", payload.version)
      const installed = join(keg, "libexec")
      const activated = await orchestraActivationSnapshot(fixture.prefix)
      expect(activated.entries[0], "HOMEBREW_ACCEPTED_PUBLIC_LAUNCHER_MUST_SELECT_NEW_PAYLOAD")
        .toMatchObject({ kind: "symlink", resolved: await realpath(join(installed, "bin/orchestra")) })
      for (const entry of activated.entries.slice(1))
        expect(entry, "HOMEBREW_ACCEPTED_OPT_AND_LINKED_ENTRIES_MUST_SELECT_NEW_KEG")
          .toMatchObject({ kind: "symlink", resolved: await realpath(keg) })
      // HB-LAYOUT: complete libexec; only public bin command links to real sibling closure.
      expect(await readdir(join(keg, "bin"))).toEqual(["orchestra"])
      expect((await lstat(launcher)).isSymbolicLink()).toBe(true)
      expect((await lstat(join(keg, "bin/orchestra"))).isSymbolicLink()).toBe(true)
      expect(resolve(join(keg, "bin"), await readlink(join(keg, "bin/orchestra"))))
        .toBe(join(installed, "bin/orchestra"))
      expect(await realpath(launcher)).toBe(await realpath(join(installed, "bin/orchestra")))
      for (const file of payload.manifest.files) {
        const location = join(installed, file.path)
        const info = await lstat(location)
        const digest = sha256(await readFile(location))
        if (digest === file.sha256 && Boolean(info.mode & 0o111) === file.executable) continue
        const originalID = file.path.endsWith(".node")
          ? await successful(["/usr/bin/otool", "-D", join(payload.payload, file.path)], box) : "not-addon"
        const installedID = file.path.endsWith(".node")
          ? await successful(["/usr/bin/otool", "-D", location], box) : "not-addon"
        throw new Error(`HOMEBREW_PAYLOAD_DIVERGED: ${file.path} expected_sha256=${file.sha256} actual_sha256=${digest} expected_executable=${file.executable} actual_mode=${(info.mode & 0o777).toString(8)}\noriginal_id=${originalID}\ninstalled_id=${installedID}`)
      }
      expect(await verifyDistribution(installed, { version: payload.version, target })).toEqual(payload.manifest)
      expect(await snapshot(installed)).toEqual(payload.snapshot)
      retained.set(keg, await kegSnapshot(keg))
      // HB-RUNTIME: shared version/parsers/addon/supervisor/service/API/full skill-byte oracles.
      const root = await qualify({ launcher, payload: installed, version: payload.version,
        box, oracle: built.oracle, negative: index === 1 })
      skills.set(root, await snapshot(root))
      for (const [old, expected] of retained) expect(await kegSnapshot(old)).toEqual(expected)
      for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
    }
    // HB-ROLLBACK: explicit retained-keg link selection, not the removed Homebrew switch command.
    // Unlink with real brew, then atomically select the old public command at the original launcher.
    await stopServices()
    const cached = await snapshot(box.namespace)
    await brew(["unlink", formula])
    expect(await snapshot(box.namespace)).toEqual(cached)
    const unlinked = await lstat(launcher).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    expect(unlinked, "HOMEBREW_UNLINK_MUST_REMOVE_ORIGINAL_LAUNCHER").toBeUndefined()
    const first = built.payloads[0]
    const old = join(fixture.cellar, "orchestra", first.version)
    const selection = await mkdtemp(join(fixture.prefix, "bin/.orchestra-rollback-"))
    try {
      await symlink(join(old, "bin/orchestra"), join(selection, "orchestra"))
      await rename(join(selection, "orchestra"), launcher)
    } finally {
      await rm(selection, { recursive: true })
    }
    expect((await lstat(launcher)).isSymbolicLink()).toBe(true)
    expect(await readlink(launcher)).toBe(join(old, "bin/orchestra"))
    expect(await realpath(launcher)).toBe(await realpath(join(old, "libexec/bin/orchestra")))
    expect(await snapshot(box.namespace)).toEqual(cached)
    const root = await qualify({ launcher, payload: join(old, "libexec"),
      version: first.version, box, oracle: built.oracle })
    if (!skills.has(root)) throw new Error("HOMEBREW_ROLLBACK_SKILL_CACHE_ID_CHANGED")
    for (const [keg, expected] of retained) expect(await kegSnapshot(keg)).toEqual(expected)
    for (const [cache, expected] of skills) expect(await snapshot(cache)).toEqual(expected)
    expect((await readdir(join(fixture.cellar, "orchestra"))).sort()).toEqual(built.payloads.map((p) => p.version).sort())
    expect((await readdir(box.namespace)).sort()).toEqual(built.payloads.map((p) => skillIdentity(p.version, built.oracle)).sort())
    const requests = https.requests.slice(start)
    expect(requests.filter((request) => !request.served), "HOMEBREW_WRONG_TARGET_FETCH").toEqual([])
    for (const payload of built.payloads) {
      expect(requests.some((request) => request.version === payload.version && request.target === target)).toBe(true)
      expect(sha256(await readFile(payload.archive.file))).toBe(payload.archive.sha256)
      expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
    }
    await Bun.write(join(fixture.artifacts, "qualified-target.json"), JSON.stringify({
      qualifiedTargets: [target], versions: built.payloads.map((p) => p.version),
      checksum: "real-homebrew-selected-target-sha256-rejection",
      rollback: "explicit-retained-keg-link-selection", launcher,
    }, null, 2))
  } finally {
    await stopServices().finally(() => https.server.stop(true)).catch((cause: unknown) => {
      preserve()
      throw new Error(`HOMEBREW_CLEANUP_FAILED: fixture=${box.directory}`, { cause })
    })
  }
}

async function trustedArchives(box: Sandbox, built: Built, preserve: () => void) {
  const openssl = Bun.which("openssl")
  const curl = Bun.which("curl")
  if (!openssl || !curl) throw new Error("HOMEBREW_HTTPS_TOOLS_REQUIRED")
  const ca = join(box.directory, "ca.crt")
  const caKey = join(box.directory, "ca.key")
  const key = join(box.directory, "https.key")
  const cert = join(box.directory, "https.crt")
  const config = join(box.directory, "https.cnf")
  await Bun.write(config, "[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=127.0.0.1\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n[server]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n")
  await successful([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", caKey,
    "-out", ca, "-days", "1", "-subj", "/CN=Orchestra qualification CA", "-config", config, "-extensions", "ca"], box)
  await successful([openssl, "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", join(box.directory, "https.csr"), "-config", config], box)
  await successful([openssl, "x509", "-req", "-in", join(box.directory, "https.csr"), "-CA", ca,
    "-CAkey", caKey, "-CAcreateserial", "-out", cert, "-days", "1", "-extfile", config, "-extensions", "server"], box)
  await Promise.all([caKey, key].map((file) => chmod(file, 0o600)))
  const records = built.payloads.map((payload) => targets.map((candidate) => ({
    target: candidate, version: payload.version, served: candidate === target,
    qualification: candidate === target ? "selected-native-candidate" : "unserved-unqualified",
    path: `/${payload.version}/${candidate}.tar.gz`,
    // Foreign digests are explicit unserved sentinels, never claimed artifact hashes.
    sha256: candidate === target ? payload.archive.sha256 : "0".repeat(64), url: "",
  })))
  const tamper = { enabled: false }
  const tampered = await Promise.all(built.payloads.map(async (payload) => {
    const bytes = await readFile(payload.archive.file)
    expect(sha256(bytes)).toBe(payload.archive.sha256)
    expect(bytes.length).toBeGreaterThan(0)
    bytes[bytes.length - 1] ^= 1
    const digest = sha256(bytes)
    expect(digest).not.toBe(payload.archive.sha256)
    const file = join(box.directory, `tampered-${payload.version}.tar.gz`)
    await Bun.write(file, bytes)
    expect(sha256(await readFile(file))).toBe(digest)
    return { version: payload.version, file, sha256: digest }
  }))
  const requests: (typeof records[number][number] & { method: string; tampered: boolean; downloadSha256?: string })[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, tls: { key: Bun.file(key), cert: Bun.file(cert) },
    fetch(request) {
      const record = records.flat().find((asset) => asset.path === new URL(request.url).pathname)
      if (!record) return new Response("HOMEBREW_UNSERVED_ROUTE", { status: 404 })
      if (!record.served) {
        requests.push({ ...record, method: request.method, tampered: false })
        return new Response("HOMEBREW_UNQUALIFIED_TARGET", { status: 410 })
      }
      const payload = built.payloads.find((payload) => payload.version === record.version)
      const altered = tampered.find((archive) => archive.version === record.version)
      if (!payload || !altered) return new Response("HOMEBREW_ARCHIVE_MISSING", { status: 500 })
      requests.push({ ...record, method: request.method, tampered: tamper.enabled,
        downloadSha256: tamper.enabled ? altered.sha256 : payload.archive.sha256 })
      console.info(`Homebrew HTTPS request: ${JSON.stringify(requests.at(-1))}`)
      return new Response(Bun.file(tamper.enabled ? altered.file : payload.archive.file),
        { headers: { "content-type": "application/gzip" } })
    },
  })
  try {
    expect(server.url.protocol).toBe("https:")
    for (const assets of records) for (const asset of assets) asset.url = `${server.url.origin}${asset.path}`
    for (const payload of built.payloads) expect(sha256(await readFile(payload.archive.file))).toBe(payload.archive.sha256)
    await Bun.write(join(box.directory, "artifacts/qualification-assets.json"), JSON.stringify(records, null, 2))
    const wrapper = join(box.directory, "trusted-curl")
    // Local fixture trusts only its CA; unrelated brew bootstrap HTTPS keeps system roots.
    await Bun.write(wrapper, `#!/bin/sh\nfor arg do\n  case "$arg" in -k|--insecure) printf '%s\\n' HOMEBREW_INSECURE_TLS_FORBIDDEN >&2; exit 2;; esac\ndone\nprintf 'Homebrew curl arg: [%s]\\n' "$@" >&2\nfor arg do\n  case "$arg" in ${quote(server.url.origin)}/*) exec ${quote(curl)} --disable "$@" --cacert ${quote(ca)} --retry 0 --connect-timeout 10 --max-time 30 --write-out '%{stderr}Homebrew loopback curl: status=%{http_code} bytes=%{size_download} seconds=%{time_total}\\n';; esac\ndone\nexec ${quote(curl)} --disable "$@"\n`)
    await chmod(wrapper, 0o755)
    return { server, records, requests, wrapper, curl, tamper, tampered }
  } catch (error) {
    await Promise.resolve().then(() => server.stop(true)).catch((cause: unknown) => {
      preserve()
      throw new Error(`HOMEBREW_HTTPS_CLEANUP_FAILED: fixture=${box.directory}`, { cause })
    })
    throw error
  }
}

// HB-ACTIVATION: all Orchestra kegs plus exact public/opt/linked entries, not the whole brew repository.
// Homebrew infrastructure directories may initialize; private prefix/Cellar/repository identity guards
// remain mandatory in privateBrew. Existing kegs retain the full bytes/modes/links/receipts oracle.
async function orchestraActivationSnapshot(prefix: string) {
  const kegs = await lstat(join(prefix, "Cellar/orchestra")).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  return {
    kegs: kegs ? await kegSnapshot(join(prefix, "Cellar/orchestra")) : undefined,
    entries: await Promise.all(["bin/orchestra", "opt/orchestra", "var/homebrew/linked/orchestra"].map(async (relative) => {
      const path = join(prefix, relative)
      const stat = await lstat(path).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
        throw error
      })
      if (!stat) return { path: relative, kind: "absent" }
      const mode = stat.mode & 0o777
      if (stat.isSymbolicLink()) return {
        path: relative, kind: "symlink", mode, link: await readlink(path),
        resolved: await realpath(path).catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
          throw error
        }),
      }
      if (!stat.isFile()) throw new Error(`HOMEBREW_ACTIVATION_ENTRY_TYPE_REFUSED: ${relative}`)
      expect(stat.nlink, "HOMEBREW_ACTIVATION_HARDLINK_REFUSED").toBe(1)
      return { path: relative, kind: "file", mode, bytes: await readFile(path) }
    })),
  }
}

// HB-IMMUTABLE: full keg bytes/modes/empty dirs/link text, including .brew and receipts.
// Shared payload snapshot intentionally rejects symlinks; real kegs require this oracle.
async function kegSnapshot(keg: string) {
  const entries = new Map<string, { kind: string; mode: number; bytes?: Buffer; link?: string }>()
  const visit = async (path: string, relative: string): Promise<void> => {
    const stat = await lstat(path)
    const mode = stat.mode & 0o777
    if (stat.isSymbolicLink()) { entries.set(relative, { kind: "symlink", mode, link: await readlink(path) }); return }
    if (stat.isFile()) {
      expect(stat.nlink, "HOMEBREW_KEG_HARDLINK_REFUSED").toBe(1)
      entries.set(relative, { kind: "file", mode, bytes: await readFile(path) })
      return
    }
    if (!stat.isDirectory()) throw new Error(`HOMEBREW_KEG_SPECIAL_FILE_REFUSED: ${relative}`)
    entries.set(relative, { kind: "directory", mode })
    for (const name of (await readdir(path)).sort()) await visit(join(path, name), relative ? `${relative}/${name}` : name)
  }
  expect((await lstat(keg)).isDirectory()).toBe(true)
  await visit(keg, "")
  return entries
}
