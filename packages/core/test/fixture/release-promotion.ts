import { createHash, randomUUID } from "node:crypto"
import { chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { Omni } from "../../src/omni"

export type Asset = { name: string; bytes: string; digest: string; size: number; id: number }
export type Release = { id: number; tag_name: string; body: string; draft: boolean; assets: Record<string, Asset> }
export type State = {
  version: string
  sourceSha: string
  repository: string
  tags: Record<string, { type: "tag" | "commit"; sha: string }>
  objects: Record<string, { tag: string; object: { type: string; sha: string }; message: string }>
  releases: Record<string, Release>
  npm: Record<string, string>
  log: { operation: string; mutation: boolean; args: string[] }[]
  fault?: { operation: string; remaining: number; status?: number }
  hold?: string
  badDigest?: { tag: string; name: string }
}
export type Step = { name: string; run?: string; uses?: string; if?: string; env?: Record<string, string> }
export type Workflow = {
  jobs: Record<string, { steps?: Step[]; needs?: string | string[]; if?: string; env?: Record<string, string> }>
}
export const repositoryRoot = resolve(import.meta.dir, "../../../..")
export const repository = "fixture/release"
export const canonicalFeeds = ["latest.yml", "latest-mac.yml", "latest-linux.yml"]
export const desktopNames = [
  "mac-arm64.dmg",
  "mac-x64.dmg",
  "mac-arm64.zip",
  "mac-x64.zip",
  "win-x64.exe",
  "win-arm64.exe",
  "linux-x86_64.AppImage",
  "linux-amd64.deb",
  "linux-x86_64.rpm",
].map((name) => `orchestra-desktop-${name}`)
const targets = [
  "linux-x64-baseline",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64-baseline",
  "windows-x64-baseline",
  "windows-arm64",
  "linux-x64-baseline-musl",
  "linux-arm64-musl",
]
export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const sha512 = (bytes: string | Uint8Array) => createHash("sha512").update(bytes).digest("base64")
export const feed = (version: string, name: string, bytes: string, absolute = true) =>
  [
    `version: ${version}`,
    "files:",
    `  - url: ${absolute ? `https://github.com/${repository}/releases/download/desktop-v${version}/` : ""}${name}`,
    `    sha512: ${sha512(bytes)}`,
    `    size: ${Buffer.byteLength(bytes)}`,
    "releaseDate: '2026-11-01T00:00:00.000Z'",
    "",
  ].join("\n")
export const floor = (version: string, receiptSha256: string) =>
  `<!-- orchestra-feed-v1:${JSON.stringify({ version, receiptSha256 })} -->`
export const asset = (name: string, bytes: string | Uint8Array): Asset => ({
  name,
  bytes: Buffer.from(bytes).toString("base64"),
  digest: `sha256:${sha256(bytes)}`,
  size: Buffer.byteLength(bytes),
  id: 1,
})
export const workflow = async (name: string) =>
  Bun.YAML.parse(await readFile(join(repositoryRoot, `.github/workflows/${name}.yml`), "utf8")) as Workflow

export async function releaseFixture(directory: string, version = "0.3.6") {
  await mkdir(directory, { recursive: true })
  const source = join(directory, "approved")
  const files: { path: string; size: number; sha256: string }[] = []
  const put = async (path: string, bytes: string | Uint8Array) => {
    await mkdir(dirname(join(source, path)), { recursive: true })
    await writeFile(join(source, path), bytes)
    files.push({ path, size: Buffer.byteLength(bytes), sha256: sha256(bytes) })
  }
  for (const target of targets) {
    await put(`cli/orchestra-${version}-${target}.tar.gz`, `original archive ${version} ${target}`)
    await put(
      `cli/npm-packs/humanguardrail-cli-${target}-${version}.tgz`,
      await new Bun.Archive(
        {
          "package/package.json": JSON.stringify({ name: `@humanguardrail/cli-${target}`, version }),
          "package/bin/orchestra": `original payload ${version} ${target}`,
        },
        { compress: "gzip" },
      ).bytes(),
    )
  }
  await put(
    `cli/npm-packs/humanguardrail-cli-${version}.tgz`,
    await new Bun.Archive(
      {
        "package/package.json": JSON.stringify({ name: "@humanguardrail/cli", version }),
      },
      { compress: "gzip" },
    ).bytes(),
  )
  await put("cli/install.sh", "original installer")
  await put("cli/SHA256SUMS", "original CLI checksums")
  for (const name of desktopNames) await put(`desktop/${name}`, `original installer ${version} ${name}`)
  for (const [index, name] of canonicalFeeds.entries()) {
    const payload = desktopNames[[4, 3, 6][index]]
    await put(`feed/${name}`, feed(version, payload, `original installer ${version} ${payload}`))
  }
  await put("feed/SHA256SUMS", "original desktop checksums")
  const sourceSha = "a".repeat(40)
  const receipt = {
    schemaVersion: 1,
    version,
    sourceSha,
    cliRunId: 11,
    desktopRunId: 22,
    qualificationRunId: 33,
    fullRunId: 44,
    validation: { result: "pass", appVersion: version, cliVersion: version },
    files,
  }
  const receiptBytes = JSON.stringify(receipt)
  const receiptSha256 = sha256(receiptBytes)
  const legacyAssets = Object.fromEntries(
    canonicalFeeds.map((name, index) => {
      const payload = desktopNames[[4, 3, 6][index]]
      return [name, asset(name, feed("0.3.5", payload, `retained legacy ${payload}`, false))]
    }),
  )
  for (const name of desktopNames) legacyAssets[name] = asset(name, `retained legacy ${name}`)
  const initial: State = {
    version,
    sourceSha,
    repository,
    tags: {},
    objects: {},
    npm: {},
    log: [],
    releases: {
      [`release-candidate-v${version}`]: {
        id: 100,
        tag_name: `release-candidate-v${version}`,
        body: "candidate",
        draft: true,
        assets: { "VALIDATION.json": asset("VALIDATION.json", receiptBytes) },
      },
      "desktop-latest": {
        id: 101,
        tag_name: "desktop-latest",
        body: "Legacy human notes",
        draft: false,
        assets: legacyAssets,
      },
    },
  }
  const stateFile = join(directory, "state.json")
  const save = (state: State) => writeFile(stateFile, JSON.stringify(state))
  const read = async () => JSON.parse(await readFile(stateFile, "utf8")) as State
  await save(initial)
  const bin = join(directory, "bin")
  await mkdir(bin)
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  for (const tool of ["gh", "npm"]) {
    const file = join(bin, tool)
    await writeFile(
      file,
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(import.meta.dir, "release-command.ts"))} ${tool} "$@"\n`,
    )
    await chmod(file, 0o700)
  }
  const environment = async () => {
    const temporary = join(directory, `attempt-${randomUUID()}`)
    await mkdir(join(temporary, "validated"), { recursive: true })
    for (const path of ["cli", "desktop", "feed"])
      await cp(join(source, path), join(temporary, "validated", path), { recursive: true })
    await mkdir(join(temporary, "qualification"))
    await writeFile(join(temporary, "qualification", "test-scope.json"), JSON.stringify({ sourceSha, packages: "" }))
    await mkdir(join(temporary, "home"))
    return {
      PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      HOME: join(temporary, "home"),
      TMPDIR: temporary,
      RUNNER_TEMP: temporary,
      RELEASE_FIXTURE_ROOT: directory,
      VERSION: version,
      GITHUB_SHA: sourceSha,
      GITHUB_REPOSITORY: repository,
      GITHUB_REF: `refs/heads/release-${version}`,
      GITHUB_REF_NAME: `release-${version}`,
      CLI_RUN_ID: "11",
      DESKTOP_RUN_ID: "22",
      QUALIFICATION_RUN_ID: "33",
      FULL_RUN_ID: "44",
      RECEIPT_SHA256: receiptSha256,
      GH_TOKEN: "fixture-not-a-live-token",
      NODE_AUTH_TOKEN: "fixture-not-a-live-token",
      PUBLISH: "true",
      SIGN: "false",
      GH_HOST: "fixture.invalid",
      CI: "true",
    }
  }
  const shell = async (script: string, env: Record<string, string>) => {
    const file = join(env.RUNNER_TEMP, `step-${randomUUID()}.sh`)
    await writeFile(file, script)
    return Effect.runPromise(
      Effect.gen(function* () {
        const process = yield* AppProcess.Service
        return yield* process.run(
          ChildProcess.make("bash", [file], {
            cwd: repositoryRoot,
            env,
            extendEnv: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          }),
          { timeout: 60_000, maxOutputBytes: 1024 * 1024, maxErrorBytes: 1024 * 1024 },
        )
      }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)), Effect.scoped),
    )
  }
  const promote = async () => {
    const env = await environment()
    for (const step of (await workflow("release-promote")).jobs.promote.steps ?? []) {
      if (!step.run) continue
      const result = await shell(step.run, env)
      if (result.exitCode !== 0) return { ...result, step: step.name }
    }
    return { exitCode: 0, stdout: Buffer.from(""), stderr: Buffer.from(""), step: "complete" }
  }
  const crash = async (operation: string) => {
    await save({ ...(await read()), hold: operation })
    const env = await environment()
    const omni = await Omni.load()
    for (const step of (await workflow("release-promote")).jobs.promote.steps ?? []) {
      if (!step.run) continue
      const script = join(env.RUNNER_TEMP, `crash-step-${randomUUID()}.sh`)
      await writeFile(script, step.run)
      const child = omni.spawn("bash", [script], {
        cwd: repositoryRoot,
        env: Omni.childEnv(env, {}),
        inheritEnv: false,
        stdin: "closed",
        text: true,
      })
      Omni.count("spawns")
      const held = Promise.withResolvers<void>()
      const output = { text: "" }
      const reading = (async () => {
        for await (const item of child.output) {
          output.text += item.data
          if (output.text.includes("RELEASE_FIXTURE_HELD")) held.resolve()
        }
      })()
      const timed = Promise.withResolvers<"timeout">()
      const timer = setTimeout(() => timed.resolve("timeout"), 15_000)
      try {
        const result = await Promise.race([
          held.promise.then(() => "held"),
          child.wait().then(() => "ended"),
          timed.promise,
        ])
        if (result === "held") {
          const exit = await child.stop({ graceMs: 0 })
          await reading
          return { crashed: !exit.success, output: output.text, step: step.name }
        }
        if (result === "timeout") throw new Error(`fixture never reached boundary: ${step.name}`)
        await reading
        if (!(await child.wait()).success) return { crashed: false, output: output.text, step: step.name }
      } finally {
        clearTimeout(timer)
        await child.stop({ graceMs: 0 })
        await reading
      }
    }
    return { crashed: false, output: "workflow completed without crash boundary", step: "complete" }
  }
  return { directory, source, version, receipt, receiptSha256, initial, read, save, environment, shell, promote, crash }
}
