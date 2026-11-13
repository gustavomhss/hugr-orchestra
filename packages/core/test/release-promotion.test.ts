import { expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import {
  asset,
  canonicalFeeds,
  desktopNames,
  feed,
  floor,
  releaseFixture,
  repositoryRoot,
  workflow,
} from "./fixture/release-promotion"

const linux = process.platform === "linux" ? test : test.skip
const mutations = (state: Awaited<ReturnType<Awaited<ReturnType<typeof releaseFixture>>["read"]>>) =>
  state.log.filter((entry) => entry.mutation)
const npmWrites = (state: Parameters<typeof mutations>[0]) =>
  mutations(state).filter((entry) => entry.operation.startsWith("npm.publish:"))

linux("M9/M10 isolated preflight runs without installed dependencies or auto-install", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "fixture"))
  const isolated = join(tmp.path, "isolated-runner")
  expect(isolated.startsWith(repositoryRoot)).toBe(false)
  for (const name of [
    "script/release-artifact-identity.ts",
    "packages/script/src/release-artifact-identity.ts",
    "packages/script/src/desktop-feed.ts",
  ]) {
    await mkdir(dirname(join(isolated, name)), { recursive: true })
    await cp(join(repositoryRoot, name), join(isolated, name))
  }
  await cp(fixture.source, join(isolated, "artifacts"), { recursive: true })
  await writeFile(join(isolated, "VALIDATION.json"), JSON.stringify(fixture.receipt))
  const run = () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const appProcess = yield* AppProcess.Service
        return yield* appProcess.run(
          ChildProcess.make(
            process.execPath,
            ["--no-install", "script/release-artifact-identity.ts", "artifacts", "VALIDATION.json"],
            {
              cwd: isolated,
              env: {
                HOME: isolated,
                TMPDIR: isolated,
                BUN_INSTALL: join(isolated, "bun"),
                BUN_INSTALL_CACHE_DIR: join(isolated, "cache"),
                NODE_PATH: "",
                VERSION: fixture.version,
                GITHUB_REPOSITORY: "fixture/release",
                GITHUB_SHA: fixture.receipt.sourceSha,
                CLI_RUN_ID: "11",
                DESKTOP_RUN_ID: "22",
                QUALIFICATION_RUN_ID: "33",
              },
              extendEnv: false,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
            },
          ),
          { timeout: 10_000, maxOutputBytes: 1024 * 1024, maxErrorBytes: 1024 * 1024 },
        )
      }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)), Effect.scoped),
    )
  const valid = await run()
  expect(valid.exitCode, valid.stderr.toString()).toBe(0)
  expect(valid.stdout.toString()).toContain("Release artifact identity verified")
  await writeFile(join(isolated, "artifacts/cli/install.sh"), "different unapproved installer")
  const mismatch = await run()
  expect(mismatch.exitCode).not.toBe(0)
  expect(mismatch.stderr.toString()).toContain("Artifact mismatch: cli/install.sh")
  expect((await fixture.read()).log).toEqual([])
})

for (const name of ["release-cli", "release-desktop"]) {
  linux(
    `M9/M10 ${name} publish=true refuses in its actual first plan step before registry or GitHub effects`,
    async () => {
      expectSpawn(import.meta.path)
      await using tmp = await tmpdir()
      const fixture = await releaseFixture(join(tmp.path, name))
      const plan = (await workflow(name)).jobs.plan
      const first = plan.steps?.[0]
      expect(first?.run).toBeString()
      const env = { ...(await fixture.environment()), GITHUB_REF: "refs/heads/dev", PUBLISH: "true" }
      const result = await fixture.shell(first!.run!, env)
      expect(result.exitCode).not.toBe(0)
      expect(result.stdout.toString() + result.stderr.toString()).toContain("release-promote")
      expect((await fixture.read()).log).toEqual([])
    },
  )
  linux(`M9/M10 ${name} dry build still reaches the actual first plan step`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, name))
    const first = (await workflow(name)).jobs.plan.steps![0]
    const result = await fixture.shell(first.run!, { ...(await fixture.environment()), PUBLISH: "false" })
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    expect((await fixture.read()).log).toEqual([])
  })
  test(`M9/M10 ${name} gates its entire side-effect DAG on plan and has no obsolete publishing jobs`, async () => {
    const jobs = (await workflow(name)).jobs
    const depends = (name: string, visited = new Set<string>()): boolean => {
      if (name === "plan") return true
      if (visited.has(name)) throw new Error("workflow needs cycle")
      const needs = jobs[name].needs
      return (typeof needs === "string" ? [needs] : (needs ?? [])).some((dependency) =>
        depends(dependency, new Set([...visited, name])),
      )
    }
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "plan") continue
      expect(depends(name), name).toBe(true)
      expect(job.if ?? "").not.toContain("always()")
    }
    expect(jobs.publish).toBeUndefined()
    expect(jobs.qualify).toBeUndefined()
    expect(jobs.plan.steps?.[0].env?.GH_TOKEN).toBeUndefined()
  })
}

linux("release promotion refuses a frozen branch with different source before any producer or mutation", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "frozen-source-mismatch"))
  await fixture.save({ ...(await fixture.read()), frozenBranchSHA: "b".repeat(40) })
  const step = (await workflow("release-promote")).jobs.promote.steps?.find((step) => step.name === "Bind the cut to reviewed source and successful producers")
  expect(step?.run).toBeString()
  const result = await fixture.shell(step!.run!, await fixture.environment())
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).not.toContain("unbound variable")
  const state = await fixture.read()
  expect(state.log.map((entry) => entry.operation)).toEqual([`branch.read:release-${fixture.version}`])
  expect(mutations(state)).toEqual([])
})

linux("release promotion from dev requires explicit reviewed source before any remote operation", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "dev-source-missing"))
  const step = (await workflow("release-promote")).jobs.promote.steps?.find((step) => step.name === "Bind the cut to reviewed source and successful producers")
  expect(step?.run).toBeString()
  const result = await fixture.shell(step!.run!, {
    ...(await fixture.environment()), GITHUB_REF: "refs/heads/dev", GITHUB_REF_NAME: "dev", GITHUB_SHA: "b".repeat(40),
  })
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).not.toContain("unbound variable")
  expect((await fixture.read()).log).toEqual([])
})

linux(
  "release fixture positive control executes the actual full promotion shell with original byte identities",
  async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, "control"))
    const result = await fixture.promote()
    expect(result.exitCode, `${result.step}: ${result.stderr.toString()}`).toBe(0)
    const state = await fixture.read()
    expect(npmWrites(state).length).toBe(9)
    for (const tag of [`v${fixture.version}`, `desktop-v${fixture.version}`]) {
      expect(state.releases[tag].draft).toBe(false)
      expect(state.releases[tag].assets["VALIDATION.json"].digest).toBe(`sha256:${fixture.receiptSha256}`)
    }
  },
)

linux("M9 actual npm shell resumes after one platform was published and a later platform failed", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "npm-partial"))
  await fixture.save({
    ...(await fixture.read()),
    fault: { operation: "npm.publish:@humanguardrail/cli-darwin-x64-baseline@0.3.6", remaining: 1 },
  })
  expect((await fixture.promote()).exitCode).not.toBe(0)
  const partial = await fixture.read()
  expect(partial.npm["@humanguardrail/cli-darwin-arm64@0.3.6"]).toStartWith("sha512-")
  expect(partial.npm["@humanguardrail/cli@0.3.6"]).toBeUndefined()
  const result = await fixture.promote()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  const state = await fixture.read()
  expect(
    npmWrites(state).filter((entry) => entry.operation === "npm.publish:@humanguardrail/cli-darwin-arm64@0.3.6"),
  ).toHaveLength(1)
  expect(npmWrites(state).at(-1)?.operation).toBe("npm.publish:@humanguardrail/cli@0.3.6")
})

linux("M9 wrapper already published survives a GitHub failure and retry only finalizes original releases", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "wrapper-partial"))
  await fixture.save({ ...(await fixture.read()), fault: { operation: "release.create:v0.3.6", remaining: 1 } })
  expect((await fixture.promote()).exitCode).not.toBe(0)
  expect(npmWrites(await fixture.read())).toHaveLength(9)
  const result = await fixture.promote()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(npmWrites(await fixture.read())).toHaveLength(9)
})

for (const failure of ["different-integrity", "query-error"]) {
  linux(`M9 actual npm shell refuses ${failure} without publishing another package`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, failure))
    const state = await fixture.read()
    if (failure === "different-integrity")
      state.npm["@humanguardrail/cli-darwin-arm64@0.3.6"] = "sha512-different-original-bytes"
    if (failure === "query-error")
      state.fault = { operation: "npm.view:@humanguardrail/cli-darwin-arm64@0.3.6", remaining: 1, status: 503 }
    await fixture.save(state)
    expect((await fixture.promote()).exitCode).not.toBe(0)
    expect(npmWrites(await fixture.read())).toEqual([])
  })
}

for (const conflict of ["sha", "receipt", "lightweight"]) {
  linux(`M9/M10 actual tag shell refuses a ${conflict} conflict and keeps the original tag`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, conflict))
    const state = await fixture.read()
    state.tags["v0.3.6"] = { type: conflict === "lightweight" ? "commit" : "tag", sha: "b".repeat(40) }
    state.objects["b".repeat(40)] = {
      tag: "v0.3.6",
      object: { type: "commit", sha: conflict === "sha" ? "c".repeat(40) : state.sourceSha },
      message: `receipt ${conflict === "receipt" ? "d".repeat(64) : fixture.receiptSha256}`,
    }
    await fixture.save(state)
    expect((await fixture.promote()).exitCode).not.toBe(0)
    const after = await fixture.read()
    expect(after.tags["v0.3.6"]).toEqual(state.tags["v0.3.6"])
    expect(mutations(after)).toEqual([])
  })
}

linux("M10 actual feed shell retains every legacy payload and publishes only approved immutable metadata", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "legacy"))
  const before = (await fixture.read()).releases["desktop-latest"]
  const result = await fixture.promote()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  const state = await fixture.read()
  const current = state.releases["desktop-latest"]
  for (const name of desktopNames) expect(current.assets[name]).toEqual(before.assets[name])
  expect(current.body).toContain(floor(fixture.version, fixture.receiptSha256))
  expect(current.body).toContain("Legacy human notes")
  for (const name of canonicalFeeds) {
    const text = Buffer.from(current.assets[name].bytes, "base64").toString()
    expect(text).toContain(`/releases/download/desktop-v${fixture.version}/`)
    expect(text).toBe(await readFile(join(fixture.source, "feed", name), "utf8"))
  }
  expect(
    mutations(state).filter(
      (entry) =>
        entry.operation.startsWith("asset.") &&
        entry.operation.includes("desktop-latest/") &&
        !canonicalFeeds.some((name) => entry.operation.endsWith(`/${name}`)),
    ),
  ).toEqual([])
})

for (const conflict of [
  "newer-manifest",
  "newer-floor",
  "other-receipt",
  "malformed-manifest",
  "unmarked-partial",
  "forbidden-read",
  "malformed-floor",
  "duplicate-floor",
  "transport-read-error",
]) {
  linux(`M10 current feed ${conflict} refuses before any tag npm or release mutation`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, conflict))
    const state = await fixture.read()
    const current = state.releases["desktop-latest"]
    if (conflict === "newer-manifest")
      current.assets["latest-mac.yml"] = asset("latest-mac.yml", feed("0.3.7", desktopNames[3], "newer", false))
    if (conflict === "newer-floor") {
      current.body += `\n${floor("0.3.7", "f".repeat(64))}`
      for (const name of canonicalFeeds) delete current.assets[name]
    }
    if (conflict === "other-receipt") current.body += `\n${floor(fixture.version, "f".repeat(64))}`
    if (conflict === "malformed-manifest")
      current.assets["latest.yml"] = asset("latest.yml", "version: [not-semver]\nfiles: []\n")
    if (conflict === "unmarked-partial") delete current.assets["latest.yml"]
    if (conflict === "forbidden-read")
      state.fault = { operation: "release.read:desktop-latest", remaining: 1, status: 403 }
    if (conflict === "malformed-floor") current.body += "\n<!-- orchestra-feed-v1:{partial -->"
    if (conflict === "duplicate-floor")
      current.body += `\n${floor(fixture.version, fixture.receiptSha256)}\n${floor(fixture.version, fixture.receiptSha256)}`
    if (conflict === "transport-read-error")
      state.fault = { operation: "release.read:desktop-latest", remaining: 1, status: 503 }
    await fixture.save(state)
    expect((await fixture.promote()).exitCode).not.toBe(0)
    expect(mutations(await fixture.read())).toEqual([])
    for (const name of desktopNames)
      expect((await fixture.read()).releases["desktop-latest"].assets[name]).toEqual(
        state.releases["desktop-latest"].assets[name],
      )
  })
}

for (const boundary of ["release.create:desktop-latest", "asset.delete:desktop-latest/latest.yml"]) {
  linux(`M10 actual process crash ${boundary} leaves a durable floor and same-receipt retry completes`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, "crash"))
    if (boundary.startsWith("release.create")) {
      const state = await fixture.read()
      delete state.releases["desktop-latest"]
      await fixture.save(state)
    }
    const before = (await fixture.read()).releases["desktop-latest"]
    const crashed = await fixture.crash(boundary)
    expect(crashed.crashed, `${crashed.step}: ${crashed.output}`).toBe(true)
    const state = await fixture.read()
    expect(state.releases["desktop-latest"].body).toContain(floor(fixture.version, fixture.receiptSha256))
    if (before)
      for (const name of desktopNames)
        expect(state.releases["desktop-latest"].assets[name]).toEqual(before.assets[name])
    delete state.hold
    await fixture.save(state)
    const result = await fixture.promote()
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    const after = await fixture.read()
    expect(canonicalFeeds.every((name) => !!after.releases["desktop-latest"].assets[name])).toBe(true)
    if (before)
      for (const name of desktopNames)
        expect(after.releases["desktop-latest"].assets[name]).toEqual(before.assets[name])
  })
}

linux("M9/M10 actual published release retry verifies without uploading versioned assets again", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "published"))
  const first = await fixture.promote()
  expect(first.exitCode, first.stderr.toString()).toBe(0)
  const before = await fixture.read()
  const result = await fixture.promote()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  const after = await fixture.read()
  expect(npmWrites(after)).toHaveLength(npmWrites(before).length)
  const newWrites = after.log.slice(before.log.length).filter((entry) => entry.mutation)
  expect(
    newWrites.filter(
      (entry) => entry.operation.startsWith("asset.upload:v") || entry.operation.startsWith("asset.upload:desktop-v"),
    ),
  ).toEqual([])
  expect(after.releases["desktop-v0.3.6"].assets).toEqual(before.releases["desktop-v0.3.6"].assets)
})

for (const conflict of ["missing", "different", "extra"] as const) {
  linux(`M9/M10 actual published release independently refuses ${conflict} asset without overwrite`, async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, `published-${conflict}`))
    const first = await fixture.promote()
    expect(first.exitCode, first.stderr.toString()).toBe(0)
    const state = await fixture.read()
    expect(state.log.filter((entry) => entry.operation === "release.backoff:3")).toEqual([])
    const original = structuredClone(state.releases["v0.3.6"].assets)
    if (conflict === "missing") delete state.releases["v0.3.6"].assets["SHA256SUMS"]
    if (conflict === "different") {
      const bytes = Buffer.from(original["install.sh"].bytes, "base64")
      bytes[0] ^= 1
      const changed = asset("install.sh", bytes)
      expect(changed.size).toBe(original["install.sh"].size)
      // Keep name, size and ID fixed: only the original payload bytes/digest differ.
      state.releases["v0.3.6"].assets["install.sh"] = {
        ...original["install.sh"],
        bytes: changed.bytes,
        digest: changed.digest,
      }
    }
    if (conflict === "extra") state.releases["v0.3.6"].assets["foreign.txt"] = asset("foreign.txt", "foreign extra")
    const current = state.releases["v0.3.6"].assets
    const changedNames = [...new Set([...Object.keys(original), ...Object.keys(current)])].filter(
      (name) => JSON.stringify(original[name]) !== JSON.stringify(current[name]),
    )
    expect(changedNames).toEqual([
      conflict === "missing" ? "SHA256SUMS" : conflict === "different" ? "install.sh" : "foreign.txt",
    ])
    const before = structuredClone(state.releases["v0.3.6"])
    const count = state.log.length
    await fixture.save(state)
    const refused = await fixture.promote()
    expect(refused.exitCode).not.toBe(0)
    expect(refused.step).toBe("Publish versioned releases only after asset digest verification")
    expect(refused.stderr.toString()).toContain("RELEASE_ASSET_DIGEST_MISMATCH")
    const after = await fixture.read()
    expect(after.releases["v0.3.6"]).toEqual(before)
    expect(after.log.slice(count).filter((entry) => entry.operation.startsWith("asset.upload:v0.3.6/"))).toEqual([])
    const reads = after.log.slice(count).filter((entry) =>
      entry.operation === "release.read:v0.3.6" && entry.args[0] === "api")
    expect(reads.map((entry) => entry.args)).toEqual(Array.from({ length: 10 }, () =>
      ["api", `https://api.github.com/repos/${state.repository}/releases/${before.id}`]))
    const backoffs = after.log.slice(count).filter((entry) => entry.operation === "release.backoff:3")
    expect(backoffs.map((entry) => ({ args: entry.args, mutation: entry.mutation }))).toEqual(
      Array.from({ length: 9 }, () => ({ args: ["3"], mutation: false })),
    )
    expect(after.log.slice(count).filter((entry) => reads.includes(entry) || backoffs.includes(entry))
      .map((entry) => entry.operation)).toEqual(Array.from({ length: 10 }, (_, index) =>
        index < 9 ? ["release.read:v0.3.6", "release.backoff:3"] : ["release.read:v0.3.6"]).flat())
  })
}

linux(
  "M10 actual same-receipt retry repairs confirmed missing metadata with a floor while retaining legacy payloads",
  async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, "floor-repair"))
    const state = await fixture.read()
    state.releases["desktop-latest"].body += `\n${floor(fixture.version, fixture.receiptSha256)}`
    for (const name of canonicalFeeds) delete state.releases["desktop-latest"].assets[name]
    const payloads = structuredClone(state.releases["desktop-latest"].assets)
    await fixture.save(state)
    const result = await fixture.promote()
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    const after = await fixture.read()
    for (const [name, original] of Object.entries(payloads))
      expect(after.releases["desktop-latest"].assets[name]).toEqual(original)
    expect(canonicalFeeds.every((name) => !!after.releases["desktop-latest"].assets[name])).toBe(true)
  },
)

linux("M9/M10 candidate verifier refuses relative receipt feeds before any promotion mutation", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "relative"))
  // A receipt can accurately hash a relative feed. Candidate validation must reject its semantics, not just changed bytes.
  const path = "feed/latest.yml"
  const payload = desktopNames[4]
  const bytes = feed(fixture.version, payload, `original installer ${fixture.version} ${payload}`, false)
  const { writeFile } = await import("node:fs/promises")
  const { sha256 } = await import("./fixture/release-promotion")
  await writeFile(join(fixture.source, path), bytes)
  const receipt = {
    ...fixture.receipt,
    files: fixture.receipt.files.map((entry) =>
      entry.path === path ? { ...entry, size: Buffer.byteLength(bytes), sha256: sha256(bytes) } : entry,
    ),
  }
  const state = await fixture.read()
  state.releases["release-candidate-v0.3.6"].assets["VALIDATION.json"] = asset(
    "VALIDATION.json",
    JSON.stringify(receipt),
  )
  await fixture.save(state)
  const env = { ...(await fixture.environment()), RECEIPT_SHA256: sha256(JSON.stringify(receipt)) }
  let refused = false
  for (const step of (await workflow("release-promote")).jobs.promote.steps ?? []) {
    if (!step.run) continue
    const result = await fixture.shell(step.run, env)
    if (result.exitCode !== 0) {
      refused = true
      break
    }
  }
  expect(refused).toBe(true)
  expect(mutations(await fixture.read())).toEqual([])
})

linux("release fixture refuses unknown gh npm operations and carries only fictitious explicit tokens", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "boundary-control"))
  const env = await fixture.environment()
  expect(env.GH_TOKEN).toBe("fixture-not-a-live-token")
  expect(env.NODE_AUTH_TOKEN).toBe("fixture-not-a-live-token")
  expect(
    Object.keys(env)
      .filter((key) => /TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key))
      .sort(),
  ).toEqual(["GH_TOKEN", "NODE_AUTH_TOKEN"])
  for (const command of ["gh api repos/not-the-fixture/repo/releases", "npm unpublish anything"]) {
    const result = await fixture.shell(command, env)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain("FIXTURE_")
  }
  for (const command of ["sleep", "sleep 2", "sleep 3 3"]) {
    const result = await fixture.shell(command, env)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain("FIXTURE_SLEEP_UNSUPPORTED")
  }
  expect((await fixture.read()).log).toEqual([])
  expect(mutations(await fixture.read())).toEqual([])
})

linux("M9 actual partial draft upload resumes under the same source receipt and original bytes", async () => {
  expectSpawn(import.meta.path)
  await using tmp = await tmpdir()
  const fixture = await releaseFixture(join(tmp.path, "draft-partial"))
  await fixture.save({
    ...(await fixture.read()),
    fault: { operation: "asset.upload:v0.3.6/SHA256SUMS", remaining: 1 },
  })
  expect((await fixture.promote()).exitCode).not.toBe(0)
  const partial = await fixture.read()
  expect(partial.releases["v0.3.6"].draft).toBe(true)
  expect(Object.keys(partial.releases["v0.3.6"].assets).length).toBeGreaterThan(0)
  expect(partial.releases["v0.3.6"].assets["SHA256SUMS"]).toBeUndefined()
  const result = await fixture.promote()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  const after = await fixture.read()
  expect(after.releases["v0.3.6"].draft).toBe(false)
  expect(after.releases["v0.3.6"].assets["VALIDATION.json"].digest).toBe(`sha256:${fixture.receiptSha256}`)
  expect(npmWrites(after)).toHaveLength(9)
})

linux(
  "M10 actual remote metadata digest mismatch fails without rewriting payloads or approved local feeds",
  async () => {
    expectSpawn(import.meta.path)
    await using tmp = await tmpdir()
    const fixture = await releaseFixture(join(tmp.path, "remote-digest"))
    const state = await fixture.read()
    const before = structuredClone(state.releases["desktop-latest"].assets)
    state.badDigest = { tag: "desktop-latest", name: "latest.yml", afterUpload: true }
    const source = await readFile(join(fixture.source, "feed/latest.yml"), "utf8")
    await fixture.save(state)
    expect((await fixture.promote()).exitCode).not.toBe(0)
    const after = await fixture.read()
    for (const name of desktopNames) expect(after.releases["desktop-latest"].assets[name]).toEqual(before[name])
    expect(
      mutations(after).filter(
        (entry) =>
          entry.operation.startsWith("asset.") &&
          entry.operation.includes("desktop-latest/") &&
          !canonicalFeeds.some((name) => entry.operation.endsWith(`/${name}`)),
      ),
    ).toEqual([])
    expect(await readFile(join(fixture.source, "feed/latest.yml"), "utf8")).toBe(source)
  },
)
