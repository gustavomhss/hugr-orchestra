import { describe, expect } from "bun:test"
import path from "path"
import { mkdir, stat, symlink, writeFile } from "fs/promises"
import { Effect, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Truncate } from "@/tool/truncate"
import { Shell } from "@orchestra/core/shell"
import { ShellTool } from "../../src/tool/shell"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { seatShellRuns } from "../fixture/seat-sandbox"

// The real shell tool for a native seat, reading the homes its toolchain grants (ToolSafetySandbox.homeGrants): git's
// config files and what a rustup-proxied cargo needs. The context approves every ask, so the workspace argument checks
// (ShellScan) let each command through and only the OS sandbox stands between the seat and a path outside its grants.
const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node]),
    ),
    testInstanceStoreLayer,
  ),
)

const context = (agent: string) => ({
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent,
  agentID: agent,
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

const shell = (directory: string, agent: string, command: string) =>
  Effect.gen(function* () {
    const info = yield* ShellTool
    const tool = yield* info.init()
    return yield* tool.execute({ command }, context(agent))
  }).pipe(provideInstance(directory))

Shell.acceptable.reset()
const bun = `"${process.execPath.replaceAll("\\", "/")}"`
const SECRET = "home-secret-body"
const plant = (file: string, text = SECRET) => mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, text))
const link = (target: string, at: string) => mkdir(path.dirname(at), { recursive: true }).then(() => symlink(target, at))

/** Sets environment variables the seat's shell inherits for the rest of the test. */
const environment = (values: Record<string, string>) => Effect.acquireRelease(Effect.sync(() => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  return previous
}), (previous) => Effect.sync(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}))

/** Which of `files` the agent's shell can read; it prints only booleans, never a file's body. */
const reads = (directory: string, agent: string, files: ReadonlyArray<string>) => Effect.gen(function* () {
  const list = JSON.stringify(files.map((file) => file.replaceAll("\\", "/"))).replaceAll('"', "'")
  const result = yield* shell(directory, agent, `${bun} -e "const fs=require('fs');console.log(JSON.stringify(${list}.map((f)=>{try{return fs.readFileSync(f,'utf8').length>0}catch{return false}})))"`)
  expect(result.metadata.exit, result.output).toBe(0)
  expect(result.output).not.toContain(SECRET)
  return JSON.parse(result.output.trim().split("\n").at(-1) ?? "") as boolean[]
})

/** Maestro (no read sandbox) reads every file, so a false from the seat is the sandbox, not a missing file. */
const exactly = (directory: string, allowed: ReadonlyArray<string>, denied: ReadonlyArray<string>) => Effect.gen(function* () {
  expect(yield* reads(directory, "maestro", [...allowed, ...denied])).toEqual([...allowed, ...denied].map(() => true))
  expect(yield* reads(directory, "backend", [...allowed, ...denied])).toEqual([...allowed.map(() => true), ...denied.map(() => false)])
})

const run = async (args: string[], cwd: string, env: Record<string, string>) => {
  const child = Bun.spawn(args, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" })
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`BLOCKED: ${args.join(" ")} failed (${code}): ${out}${err}`)
}

const crate = (directory: string, name: string, dependencies = "", body = "") => Promise.all([
  plant(path.join(directory, "Cargo.toml"), `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\n${dependencies}`),
  plant(path.join(directory, "src", "lib.rs"), `${body}\n#[test]\nfn one() { assert_eq!(1, 1); }\n#[test]\nfn two() { assert_eq!(2, 2); }\n`),
])

const rustup = () => {
  const cargo = Bun.which("cargo")
  const launcher = Bun.which("rustup")
  if (!cargo || !launcher) throw new Error("BLOCKED: rustup-managed cargo unavailable on this host")
  return Effect.promise(() => Promise.all([stat(cargo), stat(launcher)])).pipe(Effect.map(([proxy, binary]) => {
    // rustup installs cargo as a proxy: a link to the rustup binary, which picks the toolchain at run time.
    if (proxy.ino !== binary.ino || proxy.dev !== binary.dev) throw new Error(`BLOCKED: ${cargo} is not a rustup proxy`)
  }))
}

// macOS and Linux hosts with a sandbox (Linux CI installs bubblewrap and socat). Windows has no read sandbox.
describe.skipIf(process.platform === "win32" || !seatShellRuns())("tool.shell home grants for native seats", () => {
  it.live("a seat reads exactly git's config files and cargo's and rustup's grants from the homes it is given", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const homes = yield* tmpdirScoped()
      const [cargo, rust, xdg] = ["cargo", "rustup", "xdg"].map((name) => path.join(homes, name))
      const allowed = [
        path.join(cargo, "bin", "cargo-probe"), path.join(cargo, "registry", "index", "probe", "config.json"),
        path.join(cargo, "registry", "cache", "probe", "probe-0.1.0.crate"), path.join(cargo, "registry", "src", "probe", "lib.rs"),
        path.join(rust, "settings.toml"), path.join(rust, "toolchains", "stable", "probe"),
        path.join(xdg, "git", "config"), path.join(xdg, "git", "ignore"), path.join(xdg, "git", "attributes"),
      ]
      const denied = [
        path.join(cargo, "credentials.toml"), path.join(cargo, "credentials"), path.join(cargo, "config.toml"), path.join(cargo, "config"),
        path.join(cargo, "git", "db", "probe", "config"), path.join(cargo, "git", "checkouts", "probe", "lib.rs"),
        path.join(rust, "downloads", "probe"), path.join(rust, "tmp", "probe"), path.join(rust, "update-hashes", "stable"),
        path.join(xdg, "git", "credentials"),
      ]
      yield* Effect.promise(() => Promise.all([...allowed, ...denied].map((file) => plant(file))))
      yield* Effect.promise(() => plant(path.join(xdg, "git", "config"), `[probe]\n\tmarker = xdg-config-read\n# ${SECRET}\n`))
      yield* environment({ CARGO_HOME: cargo, RUSTUP_HOME: rust, XDG_CONFIG_HOME: xdg })
      yield* exactly(directory, allowed, denied)
      // git still starts and reads its XDG config confined.
      // (--global would read only ~/.gitconfig when it exists; a plain --get reads every level, the XDG file included.)
      const git = yield* shell(directory, "backend", "git config --get probe.marker && git status --short && git log --oneline -1")
      expect(git.metadata.exit, git.output).toBe(0)
      expect(git.output).toContain("xdg-config-read")
    }), 300_000,
  )

  it.live("credential stores stay unreadable where a readable root holds the cargo home (its bin on PATH)", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const cargo = path.join(yield* tmpdirScoped(), "cargo")
      // A bin directory on PATH exposes its install prefix, as /usr/local/cargo/bin does for a container's CARGO_HOME.
      const allowed = [path.join(cargo, "bin", "cargo-probe"), path.join(cargo, "registry", "src", "probe", "lib.rs"),
        path.join(cargo, "git", "checkouts", "probe", "lib.rs"), path.join(cargo, "env")]
      const denied = [path.join(cargo, "credentials.toml"), path.join(cargo, "credentials"), path.join(cargo, "config.toml"),
        path.join(cargo, "config"), path.join(cargo, "git", "db", "probe", "config")]
      yield* Effect.promise(() => Promise.all([...allowed, ...denied].map((file) => plant(file))))
      yield* environment({ CARGO_HOME: cargo, PATH: [path.join(cargo, "bin"), process.env.PATH].join(path.delimiter) })
      yield* exactly(directory, allowed, denied)
    }), 300_000,
  )

  it.live("PATH aliases of physical home and its ancestor never widen reads, but precise bins and home worktrees remain readable", () =>
    Effect.gen(function* () {
      const root = yield* tmpdirScoped()
      const home = path.join(root, "home")
      const directory = path.join(home, "workspace")
      const testHome = path.join(root, "test-home")
      const alias = path.join(root, "path-home")
      const ancestor = path.join(root, "path-ancestor")
      const marker = path.join(home, "private", "marker")
      const publicFile = path.join(directory, "public")
      const bin = path.join(home, "bin", "public")
      yield* Effect.promise(() => Promise.all([plant(marker), plant(publicFile), plant(bin)]))
      yield* Effect.promise(() => Promise.all([link(home, testHome), link(home, alias), link(root, ancestor)]))
      const inherited = process.env.PATH ?? ""
      yield* environment({ ORCHESTRA_TEST_HOME: testHome, PATH: [alias, inherited].join(path.delimiter) })
      yield* exactly(directory, [publicFile], [marker, path.join(alias, "private", "marker")])
      yield* environment({ PATH: [ancestor, inherited].join(path.delimiter) })
      yield* exactly(directory, [publicFile], [marker, path.join(ancestor, "home", "private", "marker")])
      yield* environment({ PATH: [path.dirname(bin), inherited].join(path.delimiter) })
      yield* exactly(directory, [publicFile, bin], [marker])
      // A missing test home still has a canonical physical parent, so its ancestor cannot become a program grant.
      yield* environment({ ORCHESTRA_TEST_HOME: path.join(testHome, "missing-home"),
        PATH: [ancestor, inherited].join(path.delimiter) })
      yield* exactly(directory, [publicFile], [marker, path.join(ancestor, "home", "private", "marker")])
    }), 300_000,
  )

  it.live("effective home and relative credential roots stay denied beneath readable PATH children", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const root = yield* tmpdirScoped()
      const home = path.join(root, "home")
      const alias = path.join(root, "home-alias")
      const gitPublic = path.join(home, "git", "public")
      const gitCredentials = path.join(home, "git", "credentials")
      const cargoPublic = path.join(home, "cargo-store", "public")
      const names = ["credentials", "credentials.toml", "config", "config.toml"]
      const targets = names.map((name) => path.join(home, "cargo-store", name))
      yield* Effect.promise(() => Promise.all([plant(gitPublic), plant(gitCredentials), plant(cargoPublic),
        ...targets.map((target, index) => plant(target).then(() => link(target, path.join(home, names[index]))))]))
      yield* Effect.promise(() => link(home, alias))
      const inherited = process.env.PATH ?? ""
      // XDG/CARGO equal Orchestra's lexical home, and resolve to its physical home: neither is grant-eligible.
      yield* environment({ ORCHESTRA_TEST_HOME: alias, XDG_CONFIG_HOME: alias, CARGO_HOME: alias,
        PATH: [path.dirname(gitPublic), path.dirname(cargoPublic), inherited].join(path.delimiter) })
      const denied = [gitCredentials, path.join(alias, "git", "credentials"), ...targets,
        ...names.flatMap((name) => [path.join(home, name), path.join(alias, name)])]
      yield* exactly(directory, [gitPublic, cargoPublic], denied)
      yield* environment({ ORCHESTRA_TEST_HOME: home, XDG_CONFIG_HOME: home, CARGO_HOME: home })
      yield* exactly(directory, [gitPublic, cargoPublic], denied)
      yield* environment({ XDG_CONFIG_HOME: path.relative(directory, alias), CARGO_HOME: path.relative(directory, alias) })
      yield* exactly(directory, [gitPublic, cargoPublic], denied)
    }), 300_000,
  )

  it.live("a link planted at a grant cannot expose what it points to; a dotfiles link keeping git's names still works", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const root = yield* tmpdirScoped()
      const outside = path.join(root, "outside")
      const targets = ["netrc", path.join("gh", "hosts.yml"), path.join("kube", "config"), path.join("stolen", "secret")]
        .map((name) => path.join(outside, name))
      yield* Effect.promise(() => Promise.all(targets.map((file) => plant(file))))
      const [netrc, hosts, kube, stolen] = targets
      const [cargo, rust, xdg] = ["cargo", "rustup", "xdg"].map((name) => path.join(root, "planted", name))
      yield* Effect.promise(() => Promise.all([
        link(path.dirname(stolen), path.join(cargo, "bin")), link(path.dirname(stolen), path.join(cargo, "registry", "src")),
        link(netrc, path.join(rust, "settings.toml")), link(path.dirname(stolen), path.join(rust, "toolchains")),
        link(kube, path.join(xdg, "git", "config")), link(hosts, path.join(xdg, "git", "ignore")),
      ]))
      yield* environment({ CARGO_HOME: cargo, RUSTUP_HOME: rust, XDG_CONFIG_HOME: xdg })
      // Read through each planted link and at each target directly.
      yield* exactly(directory, [], [
        path.join(cargo, "bin", "secret"), path.join(cargo, "registry", "src", "secret"), path.join(rust, "settings.toml"),
        path.join(rust, "toolchains", "secret"), path.join(xdg, "git", "config"), path.join(xdg, "git", "ignore"), ...targets,
      ])

      // A legitimate link: a dotfiles checkout that keeps git's own names, as GNU Stow links it.
      const dotfiles = path.join(root, "dotfiles", "git", "attributes")
      const linked = path.join(root, "linked", "xdg")
      yield* Effect.promise(() => plant(dotfiles).then(() => link(dotfiles, path.join(linked, "git", "attributes"))))
      yield* environment({ XDG_CONFIG_HOME: linked })
      yield* exactly(directory, [path.join(linked, "git", "attributes")], [])
    }), 300_000,
  )

  it.live("a registry ancestor link cannot expose a private directory outside the physical cargo root", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const root = yield* tmpdirScoped()
      const cargo = path.join(root, "cargo")
      const outside = path.join(root, "private")
      const markers = ["index", "cache", "src"].map((name) => path.join(outside, name, "marker"))
      const allowed = path.join(cargo, "bin", "probe")
      yield* Effect.promise(() => Promise.all([plant(allowed), ...markers.map((file) => plant(file))]))
      yield* Effect.promise(() => link(outside, path.join(cargo, "registry")))
      yield* environment({ CARGO_HOME: cargo })
      yield* exactly(directory, [allowed], [...markers, ...["index", "cache", "src"].map((name) =>
        path.join(cargo, "registry", name, "marker"))])
    }), 300_000,
  )

  it.live("cargo and rustup aliases of physical home or its ancestor cannot authorize grants", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const root = yield* tmpdirScoped()
      const home = path.join(root, "home")
      const alias = path.join(root, "home-alias")
      const cargo = path.join(root, "cargo-home-alias")
      const rust = path.join(root, "rustup-home-alias")
      const above = path.join(root, "ancestor-alias")
      const names = [path.join("bin", "probe"), path.join("registry", "index", "marker"),
        path.join("registry", "cache", "marker"), path.join("registry", "src", "marker"),
        path.join("toolchains", "stable", "probe"), "settings.toml"]
      yield* Effect.promise(() => Promise.all(names.map((name) => plant(path.join(home, name)))))
      yield* Effect.promise(() => Promise.all([link(home, alias), link(home, cargo), link(home, rust), link(root, above),
        ...names.map((name) => plant(path.join(root, name)))]))
      // Distinct lexical aliases pass environment validation; only physical containment can reject them.
      yield* environment({ ORCHESTRA_TEST_HOME: alias, CARGO_HOME: cargo, RUSTUP_HOME: rust })
      yield* exactly(directory, [], names.flatMap((name) => [path.join(home, name), path.join(cargo, name), path.join(rust, name)]))
      yield* environment({ CARGO_HOME: above, RUSTUP_HOME: above })
      yield* exactly(directory, [], names.flatMap((name) => [path.join(root, name), path.join(above, name)]))
      // Genuine independent physical toolchain roots are supported; whole-root alias traversal is not promised.
      const independent = path.join(root, "independent")
      yield* Effect.promise(() => Promise.all(names.map((name) => plant(path.join(independent, name)))))
      yield* environment({ CARGO_HOME: independent, RUSTUP_HOME: independent })
      yield* exactly(directory, names.map((name) => path.join(independent, name)), [])
    }), 300_000,
  )

  it.live("file grants reject directories and preserve named regular files; system-link compatibility is explicit", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const root = yield* tmpdirScoped()
      const home = path.join(root, "home")
      const xdg = path.join(root, "xdg")
      const rust = path.join(root, "rustup")
      const targets = [path.join(root, "dotfiles", ".gitconfig"),
        ...["config", "ignore", "attributes"].map((name) => path.join(root, "dotfiles", "git", name))]
      const grants = [path.join(home, ".gitconfig"),
        ...["config", "ignore", "attributes"].map((name) => path.join(xdg, "git", name))]
      yield* Effect.promise(() => Promise.all(targets.map((target, index) =>
        plant(path.join(target, "marker")).then(() => link(target, grants[index])))))
      const settings = path.join(rust, "settings.toml", "marker")
      yield* Effect.promise(() => plant(settings))
      yield* environment({ ORCHESTRA_TEST_HOME: home, XDG_CONFIG_HOME: xdg, RUSTUP_HOME: rust })
      yield* exactly(directory, [], [...targets, ...grants].map((entry) => path.join(entry, "marker")).concat(settings))

      const regular = path.join(root, "regular", "git", "attributes")
      const linked = path.join(root, "linked-xdg", "git", "attributes")
      const gitconfig = path.join(root, "regular", ".gitconfig")
      const linkedHome = path.join(root, "linked-home")
      const system = path.join(root, "system-rustup", "settings.toml")
      yield* Effect.promise(() => Promise.all([plant(regular).then(() => link(regular, linked)),
        plant(gitconfig, "[probe]\n\tmarker = regular-config\n").then(() => link(gitconfig, path.join(linkedHome, ".gitconfig")))]))
      // Compatibility control, not Nix proof: pinned SRT refuses cross-root /usr-to-/tmp restoration.
      yield* Effect.promise(() => link("/usr/bin/env", system))
      yield* environment({ ORCHESTRA_TEST_HOME: linkedHome,
        XDG_CONFIG_HOME: path.dirname(path.dirname(linked)), RUSTUP_HOME: path.dirname(system) })
      yield* exactly(directory, [linked, path.join(linkedHome, ".gitconfig"), system], [])
    }), 300_000,
  )

  it.live("a seat runs cargo through its rustup proxy and builds path and vendored dependencies offline", () =>
    Effect.gen(function* () {
      yield* rustup()
      const directory = yield* tmpdirScoped({ git: true })
      yield* Effect.promise(() => Promise.all([
        crate(directory, "seat_probe", 'local_dep = { path = "local" }\nvendored_dep = "0.1"\n',
          "pub fn sum() -> u32 { local_dep::one() + vendored_dep::two() }\n#[test]\nfn deps() { assert_eq!(sum(), 3); }"),
        crate(path.join(directory, "local"), "local_dep", "", "pub fn one() -> u32 { 1 }"),
        crate(path.join(directory, "vendor", "vendored_dep"), "vendored_dep", "", "pub fn two() -> u32 { 2 }"),
        plant(path.join(directory, "vendor", "vendored_dep", ".cargo-checksum.json"), '{"files":{},"package":null}'),
        // Source replacement, as `cargo vendor` prints it: crates.io resolves to the vendor directory.
        plant(path.join(directory, ".cargo", "config.toml"),
          '[source.crates-io]\nreplace-with = "vendored-sources"\n[source.vendored-sources]\ndirectory = "vendor"\n'),
      ]))
      const version = yield* shell(directory, "backend", "cargo --version && rustc --version")
      expect(version.metadata.exit, version.output).toBe(0)
      expect(version.output).toMatch(/cargo \d+\.\d+/)
      expect(version.output).toMatch(/rustc \d+\.\d+/)
      const tested = yield* shell(directory, "backend", "cargo test --offline --lib -- --test-threads=1")
      expect(tested.metadata.exit, tested.output).toBe(0)
      expect(tested.output).toContain("test result: ok. 3 passed")
    }), 300_000,
  )

  it.live("a seat builds fetched registry dependencies offline; git dependencies need cargo's git database, which it cannot read", () =>
    Effect.gen(function* () {
      yield* rustup()
      const cargo = path.join(yield* tmpdirScoped(), "cargo")
      const registry = yield* tmpdirScoped({ git: true })
      const git = yield* tmpdirScoped({ git: true })
      const body = "pub fn seven() -> String { itoa::Buffer::new().format(7).to_string() }\n#[test]\nfn dep() { assert_eq!(seven(), \"7\"); }"
      // The owner fetched these into the cargo home; a seat has no network.
      yield* Effect.promise(async () => {
        await crate(registry, "seat_registry", 'itoa = "=1.0.11"\n', body)
        await crate(git, "seat_git", 'itoa = { git = "https://github.com/dtolnay/itoa", tag = "1.0.11" }\n', body)
        for (const dir of [registry, git]) await run(["cargo", "fetch"], dir, { CARGO_HOME: cargo })
      })
      yield* environment({ CARGO_HOME: cargo })
      const built = yield* shell(registry, "backend", "cargo test --offline --lib -- --test-threads=1")
      expect(built.metadata.exit, built.output).toBe(0)
      expect(built.output).toContain("test result: ok. 3 passed")
      // Control: the same offline git build works where the database is readable.
      const owner = yield* shell(git, "maestro", "cargo build --offline")
      expect(owner.metadata.exit, owner.output).toBe(0)
      const seat = yield* shell(git, "backend", "cargo build --offline")
      expect(seat.metadata.exit).not.toBe(0)
      expect(seat.output).toContain("failed to load source for dependency `itoa`")
    }), 300_000,
  )
})
