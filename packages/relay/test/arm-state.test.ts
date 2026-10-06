import { afterAll, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { Deferred, Effect, Exit, Fiber, Option, Schema } from "effect"
import { RelayArm } from "@opencode-ai/schema/relay-arm"
import { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import { ArmCreate } from "../src/arm/create"
import { ArmLoad } from "../src/arm/load"
import { ArmState } from "../src/arm/state"

// WP5: arm state, the strict loader and the idempotent PUT. Expected values are read off the oracle: `tr -c` in
// `relay-arm-hook.sh`, `relay_position_index` in `lib/relay-gate.sh`, the hook's position migration and release
// pipeline, and the Python cases in tests/test_position_{by_id,macro}.py and tests/test_arm_state.py.

const roots: string[] = []
afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))))

async function scratch() {
  const root = await mkdtemp(path.join(os.tmpdir(), "relay-arm-state-"))
  roots.push(root)
  return root
}

function provide<A, E>(armsDir: string, effect: Effect.Effect<A, E, ArmState.Store>) {
  return effect.pipe(Effect.provideService(ArmState.Store, { armsDir, ledgerKey: Option.none() }))
}
const run = <A, E>(armsDir: string, effect: Effect.Effect<A, E, ArmState.Store>) =>
  Effect.runPromise(provide(armsDir, effect))
const failure = <A, E>(armsDir: string, effect: Effect.Effect<A, E, ArmState.Store>) =>
  Effect.runPromise(Effect.flip(provide(armsDir, effect)))

function sprint(...wps: RelaySprint.WorkPackage[]): RelaySprint.Sprint {
  return { work_packages: wps }
}

describe("safe", () => {
  // `printf '%s' "$id" | tr -c 'A-Za-z0-9._-' '_'` under the generator's C locale: one `_` per UTF-8 byte.
  const table: [string, string][] = [
    ["write-result", "write-result"],
    ["A.Z_az-09", "A.Z_az-09"],
    ["", ""],
    ["a b", "a_b"],
    ["a/b", "a_b"],
    ["../x", ".._x"],
    ["a\nb\r\t", "a_b__"],
    ["~!@#$%^&*()+=", "_____________"],
    ["é", "__"],
    ["日本", "______"],
    ["🙂", "____"],
    ["a\u007fb", "a_b"],
    ["\ud800", "___"], // a lone surrogate encodes as U+FFFD, three bytes
  ]
  test.each(table)("%j → %j", (input, expected) => expect(ArmState.safe(input)).toBe(expected))
})

describe("position", () => {
  const plan = sprint({ id: "build.write" }, { id: "write" }, { id: "a.b.c" }, { id: "x" }, { id: "b" }, { id: "a.b" })
  // `relay_position_index`: whole ID first, then the raw text after the first dot.
  const index: [string, number | undefined][] = [
    ["build.write", 0],
    ["write", 1],
    ["a.b.c", 2],
    ["m.a.b.c", 2],
    ["x", 3],
    ["macro.x", 3],
    ["a.b", 5], // the whole ID beats the suffix `b`
    ["q.b", 4],
    ["c.a.b", 5],
    ["z.b.c", undefined], // only the first dot splits: `b.c` is not an ID
    ["nope", undefined],
    ["", undefined],
    [".", undefined],
    ["x\n", undefined],
    ["x\r", undefined],
    ["X", undefined],
  ]
  test.each(index)("index of %j is %p", (position, expected) =>
    expect(Option.getOrUndefined(ArmState.positionIndex(plan, position))).toBe(expected),
  )

  // A raw miss alone permits the legacy trailing-LF strip; CR stays identity data.
  const resolved: [string, number | undefined][] = [
    ["x", 3],
    ["x\n", 3],
    ["x\n\n\n", 3],
    ["m.x\n", 3],
    ["x\r", undefined],
    ["x\r\n", undefined],
    ["\nx", undefined],
    ["\n", undefined],
  ]
  test.each(resolved)("resolve %j is %p", (position, expected) =>
    expect(Option.getOrUndefined(ArmState.resolve(plan, position))).toBe(expected),
  )

  test("an ID that is itself `x\\n` resolves raw before any strip", () => {
    const lf = sprint({ id: "x" }, { id: "x\n" })
    expect(Option.getOrUndefined(ArmState.resolve(lf, "x\n"))).toBe(1)
  })

  const canonical: [RelaySprint.WorkPackage, string][] = [
    [{ id: "write", macro: "build" }, "build.write"],
    [{ id: "build.write", macro: "build" }, "build.write"],
    [{ id: "seal.assemble_seal", macro: "seal" }, "seal.assemble_seal"],
    [{ id: "v1.test", macro: "frame" }, "frame.v1.test"],
    [{ id: "buildx", macro: "build" }, "build.buildx"],
    [{ id: "build", macro: "build" }, "build.build"],
    [{ id: "write", macro: null }, "write"],
    [{ id: "write", macro: "" }, "write"],
    [{ id: "write" }, "write"],
    [{ id: "a\n", macro: "m\r" }, "m\r.a\n"],
  ]
  test.each(canonical)("canonical %j is %j", (wp, expected) => {
    expect(ArmState.canonicalPosition(wp)).toBe(expected)
    // Every canonical position resolves back to its own WP.
    expect(Option.getOrUndefined(ArmState.resolve(sprint({ id: "other" }, wp), expected))).toBe(1)
  })
})

describe("golden position table", () => {
  // `relay-gate check --position` resolves through the same `relay_position_index`, so every named check in the G2
  // goldens is a row: the selected `i`, or `unknown-position` for a miss.
  type ByteValue = string | { base64: string }
  interface Scenario {
    sprint: unknown
    fires: { check?: { position?: ByteValue } }[]
  }
  const text = (value: ByteValue) =>
    typeof value === "string" ? value : Buffer.from(value.base64, "base64").toString("utf8")

  test("positionIndex matches every named `relay-gate check` position", async () => {
    const dir = path.join(import.meta.dir, "golden", "check")
    const names = [...new Bun.Glob("*/scenario.json").scanSync(dir)].map((file) => path.dirname(file)).sort()
    const rows = await Promise.all(
      names.map(async (name) => {
        const scenario: Scenario = await Bun.file(path.join(dir, name, "scenario.json")).json()
        const fires = await Promise.all(
          scenario.fires.map(async (fire, n) => {
            const outcome: { stdout: { outcome: string; i?: number } | null } = await Bun.file(
              path.join(dir, name, "expected", `${n}`, "outcome.json"),
            ).json()
            if (fire.check?.position === undefined) return []
            if (outcome.stdout?.outcome !== "check" && outcome.stdout?.outcome !== "error") return []
            const sprint = Schema.decodeUnknownSync(RelaySprint.Sprint)(scenario.sprint)
            const position = text(fire.check.position)
            return [{ name, position, expected: outcome.stdout.i, actual: ArmState.positionIndex(sprint, position) }]
          }),
        )
        return fires.flat()
      }),
    ).then((all) => all.flat())

    // Positive control: the walk reaches the K3 and K5 scenarios and each of their named fires.
    const covered = rows.map((row) => row.name)
    for (const name of [
      "k3-unknown-position",
      "k5-newline-sibling",
      "k5-position-overrides-counter",
      "k5-position-overrides-parked",
      "k5-whole-id-before-suffix",
    ])
      expect(covered).toContain(name)
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(rows.some((row) => row.expected === undefined)).toBe(true)
    for (const row of rows)
      expect({ ...row, actual: Option.getOrUndefined(row.actual) }).toEqual({ ...row, actual: row.expected })
  })
})

describe("golden safe table", () => {
  // Every per-WP state file the hook wrote in the G2 arm goldens is `<prefix><safe(x)>`: x is a WP ID, or a macro ID
  // for `macro_`. Prestate files are the scenario's, not the hook's, and are left out.
  interface Scenario {
    sprint: { work_packages?: { id?: unknown; macro?: unknown }[] } | null
    prestate?: Record<string, unknown>
  }
  const strings = (values: unknown[]) => values.filter((value): value is string => typeof value === "string")

  test("per-WP file names in arm/** are safe() of their WP or macro ID", async () => {
    const dir = path.join(import.meta.dir, "golden", "arm")
    const names = [...new Bun.Glob("*/scenario.json").scanSync(dir)].map((file) => path.dirname(file)).sort()
    const prefixes = Object.values(RelayArm.WpFilePrefix)
    const rows = await Promise.all(
      names.map(async (name) => {
        const scenario: Scenario = await Bun.file(path.join(dir, name, "scenario.json")).json()
        const wps = Array.isArray(scenario.sprint?.work_packages) ? scenario.sprint.work_packages : []
        const ids = new Set(strings(wps.map((wp) => wp.id)).map(ArmState.safe))
        const macros = new Set(strings(wps.map((wp) => wp.macro)).map(ArmState.safe))
        const files = [...new Bun.Glob("expected/*/arm/*").scanSync(path.join(dir, name))].map((file) =>
          path.basename(file),
        )
        return files
          .filter((file) => !Object.hasOwn(scenario.prestate ?? {}, file))
          .flatMap((file) => {
            const prefix = prefixes.find((candidate) => file.startsWith(candidate))
            if (prefix === undefined) return []
            const known = prefix === RelayArm.WpFilePrefix.macro ? macros : ids
            return [{ name, file, known: known.has(file.slice(prefix.length)) }]
          })
      }),
    ).then((all) => all.flat())

    // Positive control: the walk reaches names where safe() rewrote a CR or LF, so an identity safe() would fail.
    expect(rows).toContainEqual({ name: "b8-literal-cr-position", file: "retry_target_", known: true })
    expect(rows).toContainEqual({ name: "identity-lossless-advance", file: "retry_target__", known: true })
    expect(rows).toContainEqual({ name: "identity-lossless-advance", file: "macro_next_", known: true })
    expect(rows.length).toBeGreaterThanOrEqual(100)
    expect(rows.filter((row) => !row.known)).toEqual([])
  })
})

describe("release", () => {
  // `tr -d '\r' | tr '\n' ' ' | sed 's/^ *//; s/ *$//'`, then `[[ =~ [^[:space:]] ]]` in the C locale.
  const table: [string, string | undefined][] = [
    ["owner: retry after fixture fix", "owner: retry after fixture fix"],
    ["  owner \r\n reason \n", "owner   reason"],
    ["a\r\nb\n", "a b"],
    [" a\tb ", "a\tb"],
    ["\t x", "\t x"], // only spaces are trimmed
    ["x \t", "x \t"],
    [" ", " "], // not a C-locale space
    ["", undefined],
    ["   ", undefined],
    ["\n\n", undefined],
    ["\r\n", undefined],
    ["\t", undefined],
    [" \t\v\f ", undefined],
  ]
  test.each(table)("%j → %j", (input, expected) =>
    expect(Option.getOrUndefined(ArmState.normalizeRelease(input))).toBe(expected),
  )
})

describe("arm files", () => {
  test("dir joins a valid token and refuses the rest", async () => {
    const armsDir = await scratch()
    expect(await run(armsDir, ArmState.dir("run-01J.a_b"))).toBe(path.join(armsDir, "run-01J.a_b"))
    expect(await run(armsDir, ArmState.dir(".hidden"))).toBe(path.join(armsDir, ".hidden"))
    for (const token of [".", "..", "a..b", "a/b", "", "a b", "a\u0000", "é"]) {
      const error = await failure(armsDir, ArmState.dir(token))
      expect(error._tag).toBe("ArmState.StateError")
    }
  })

  test("write applies the terminator rule and read returns the raw text", async () => {
    const arm = await scratch()
    const values: [string, string, string][] = [
      ["counter", "2", "2\n"],
      ["reg_retry", "1", "1\n"],
      ["retry_write-result", "3", "3\n"],
      ["retry_0", "1", "1\n"],
      ["position", "build.write", "build.write"],
      ["state", "awaiting-human", "awaiting-human"],
      ["agent_id", "agent-1", "agent-1"],
      ["base_write", "abc", "abc"],
      ["round_write", "f00d", "f00d"],
      ["repeat_write", "0", "0"],
      ["blocked_write", "beef", "beef"],
      ["macro_build", "", ""],
      ["preflight", "", ""],
      ["tr_cursor", "12", "12"],
      ["entered_at", "1700000000", "1700000000"],
    ]
    for (const [name, value, bytes] of values) {
      await Effect.runPromise(ArmState.write(arm, name, value))
      expect(await readFile(path.join(arm, name), "utf8")).toBe(bytes)
      expect(Option.getOrUndefined(await Effect.runPromise(ArmState.read(arm, name)))).toBe(bytes)
    }
    expect(Option.isNone(await Effect.runPromise(ArmState.read(arm, "release")))).toBe(true)
    await writeFile(path.join(arm, "release"), "\ufeffowner: why\r\n")
    expect(Option.getOrUndefined(await Effect.runPromise(ArmState.read(arm, "release")))).toBe("\ufeffowner: why\r\n")
    for (const name of ["../x", "a/b", ".", "..", "", "x y"]) {
      expect((await Effect.runPromise(Effect.flip(ArmState.read(arm, name))))._tag).toBe("ArmState.StateError")
      expect((await Effect.runPromise(Effect.flip(ArmState.write(arm, name, "v"))))._tag).toBe("ArmState.StateError")
    }
  })

  test("state reads like `$(cat state)`; unknown text is active", async () => {
    const arm = await scratch()
    const read = () => Effect.runPromise(ArmState.state(arm)).then(Option.getOrUndefined)
    expect(await read()).toBeUndefined()
    const table: [string, RelayArm.State][] = [
      ["complete", "complete"],
      ["awaiting-human\n", "awaiting-human"],
      ["escalated", "escalated"],
      ["active", "active"],
      ["complete\r", "active"],
      ["", "active"],
      ["garbage", "active"],
    ]
    for (const [text, expected] of table) {
      await writeFile(path.join(arm, "state"), text)
      expect(await read()).toBe(expected)
    }
  })
})

describe("migration from counter to position", () => {
  const plan = sprint(
    { id: "intake", macro: "frame" },
    { id: "frame.terms", macro: "frame" },
    { id: "carve", macro: "carve" },
  )

  async function migrate(files: Record<string, string>, target = plan) {
    const arm = await scratch()
    await Promise.all(Object.entries(files).map(([name, text]) => writeFile(path.join(arm, name), text)))
    const position = await Effect.runPromise(ArmState.position(arm, target))
    const onDisk = await readFile(path.join(arm, "position"), "utf8").catch(() => undefined)
    const state = await readFile(path.join(arm, "state"), "utf8").catch(() => undefined)
    return { position, onDisk, state }
  }

  test("a present position is returned unchanged and the counter is ignored", async () => {
    expect(await migrate({ position: "a\n", counter: "2\n" })).toEqual({
      position: "a\n",
      onDisk: "a\n",
      state: undefined,
    })
  })

  const table: [string, Record<string, string>, string, string | undefined][] = [
    ["no position and no counter", {}, "frame.intake", undefined],
    ["an empty position file", { position: "", counter: "1" }, "frame.terms", undefined],
    ["counter 1 with LF", { counter: "1\n" }, "frame.terms", undefined],
    ["counter 2", { counter: "2" }, "carve.carve", undefined],
    ["counter with leading zeros", { counter: "002\n\n" }, "carve.carve", undefined],
    ["counter at the end", { counter: "3\n" }, "carve.carve", "complete"],
    ["counter past the end", { counter: "99" }, "carve.carve", "complete"],
    ["a negative counter", { counter: "-1" }, "frame.intake", undefined],
    ["a counter with a space", { counter: "1 " }, "frame.intake", undefined],
    ["a counter with CR", { counter: "1\r\n" }, "frame.intake", undefined],
    ["an empty counter", { counter: "" }, "frame.intake", undefined],
  ]
  test.each(table)("%s", async (_, files, position, state) => {
    expect(await migrate(files)).toEqual({ position, onDisk: position, state })
  })

  test("an empty plan migrates to `?` and completes", async () => {
    expect(await migrate({}, sprint())).toEqual({ position: "?", onDisk: "?", state: "complete" })
  })

  test("tests/test_position_by_id: counter 2 on A, B, C stands on C", async () => {
    expect((await migrate({ counter: "2" }, sprint({ id: "A" }, { id: "B" }, { id: "C" }))).position).toBe("C")
  })

  test("an invalid identity or a NUL position is an error, not a guess", async () => {
    const arm = await scratch()
    const bad = sprint({ id: "a", macro: "m\u0000" })
    expect((await Effect.runPromise(Effect.flip(ArmState.position(arm, bad))))._tag).toBe("ArmState.StateError")
    expect(existsSync(path.join(arm, "position"))).toBe(false)
    await writeFile(path.join(arm, "position"), "a\u0000b")
    expect((await Effect.runPromise(Effect.flip(ArmState.position(arm, plan))))._tag).toBe("ArmState.StateError")
  })
})

describe("run lock", () => {
  test("held for the effect and removed after success and failure", async () => {
    const arm = await scratch()
    const lock = path.join(arm, ".run.lock")
    const seen = await Effect.runPromise(
      ArmState.withRunLock(
        arm,
        Effect.sync(() => [existsSync(lock), ArmState.held(arm)]),
      ),
    )
    expect(seen).toEqual([true, true])
    expect(existsSync(lock)).toBe(false)
    expect(ArmState.held(arm)).toBe(false)

    const exit = await Effect.runPromiseExit(ArmState.withRunLock(arm, Effect.fail("boom")))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(existsSync(lock)).toBe(false)
    expect(ArmState.held(arm)).toBe(false)
  })

  test("a lock held by another process is Busy before the effect runs, and is left in place", async () => {
    const arm = await scratch()
    const lock = path.join(arm, ".run.lock")
    await mkdir(lock)
    let ran = false
    const error = await Effect.runPromise(
      Effect.flip(
        ArmState.withRunLock(
          arm,
          Effect.sync(() => (ran = true)),
        ),
      ),
    )
    expect(error).toMatchObject({ _tag: "ArmState.Busy", lock })
    expect(ran).toBe(false)
    expect(existsSync(lock)).toBe(true)
    expect(ArmState.held(arm)).toBe(false)
  })

  test("a second evaluation in this process is Busy, even through another spelling of the path", async () => {
    const arm = await scratch()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const first = yield* ArmState.withRunLock(
          arm,
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        const second = yield* Effect.flip(ArmState.withRunLock(`${arm}${path.sep}.`, Effect.void))
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(first)
        return second
      }),
    )
    expect(result._tag).toBe("ArmState.Busy")
    expect(existsSync(path.join(arm, ".run.lock"))).toBe(false)
  })

  test("an interrupted evaluation releases the lock", async () => {
    const arm = await scratch()
    await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const fiber = yield* ArmState.withRunLock(
          arm,
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* Fiber.interrupt(fiber)
      }),
    )
    expect(existsSync(path.join(arm, ".run.lock"))).toBe(false)
    expect(ArmState.held(arm)).toBe(false)
  })
})

describe("strict loader", () => {
  const reason = (file: string) => Effect.runPromise(Effect.flip(ArmLoad.bytes(file))).then((error) => error.reason)

  test("reads a regular file's exact bytes, up to exactly 512 KB", async () => {
    const dir = await scratch()
    const file = path.join(dir, "f")
    const data = new Uint8Array(ArmLoad.MAX_BYTES).map((_, index) => index % 251)
    await writeFile(file, data)
    expect(await Effect.runPromise(ArmLoad.bytes(file))).toEqual(data)
    await writeFile(file, "")
    expect((await Effect.runPromise(ArmLoad.bytes(file))).length).toBe(0)
  })

  test("refuses a missing file, a symlink, an oversized file and a non-regular file", async () => {
    const dir = await scratch()
    const file = path.join(dir, "f")
    expect(await reason(file)).toBe("missing")
    expect(await reason(path.join(dir, "no-dir", "f"))).toBe("missing")
    await writeFile(file, "{}")
    await symlink(file, path.join(dir, "link"))
    expect(await reason(path.join(dir, "link"))).toBe("symlink")
    await symlink(path.join(dir, "gone"), path.join(dir, "dangling"))
    expect(await reason(path.join(dir, "dangling"))).toBe("symlink")
    await writeFile(file, new Uint8Array(ArmLoad.MAX_BYTES + 1))
    expect(await reason(file)).toBe("overflow")
    await mkdir(path.join(dir, "sub"))
    expect(await reason(path.join(dir, "sub"))).toBe("overflow")
  })

  // Positive control for the stability check: procfs reports size 0 and then serves bytes.
  test.skipIf(process.platform !== "linux")("refuses a file whose size changes across the read", async () => {
    expect((await stat("/proc/self/status")).size).toBe(0)
    expect(await reason("/proc/self/status")).toBe("changed")
  })

  test("loads an arm and keeps the exact sprint bytes", async () => {
    const dir = await scratch()
    const sprintText = '{ "brief" : "x", "model":"keep", "work_packages":[{"id":"a","rubric":{"r":1}}] }'
    await writeFile(path.join(dir, "sprint.json"), sprintText)
    await writeFile(path.join(dir, "meta.json"), '{"workdir":"/w","base_ref":"abc","extra":true}')
    const loaded = await Effect.runPromise(ArmLoad.arm(dir))
    expect(new TextDecoder().decode(loaded.sprintBytes)).toBe(sprintText)
    expect(loaded.sprint.work_packages[0]).toMatchObject({ id: "a", rubric: { r: 1 } })
    expect(loaded.sprint).toMatchObject({ model: "keep" })
    expect(loaded.meta).toMatchObject({ workdir: "/w", base_ref: "abc", extra: true })
  })

  test("refuses an arm that is missing, symlinked or invalid", async () => {
    const root = await scratch()
    const arm = (dir: string) => Effect.runPromise(Effect.flip(ArmLoad.arm(dir)))
    const dir = path.join(root, "tok")
    expect(await arm(dir)).toMatchObject({ reason: "missing", path: dir })
    await mkdir(dir)
    expect(await arm(dir)).toMatchObject({ reason: "missing", path: path.join(dir, "sprint.json") })
    await writeFile(path.join(dir, "sprint.json"), '{"work_packages":[]}')
    expect(await arm(dir)).toMatchObject({ reason: "missing", path: path.join(dir, "meta.json") })
    await writeFile(path.join(dir, "meta.json"), '{"workdir":"/w"}')
    expect((await Effect.runPromise(ArmLoad.arm(dir))).sprint.work_packages).toEqual([])

    await symlink(dir, path.join(root, "alias"))
    expect(await arm(path.join(root, "alias"))).toMatchObject({ reason: "symlink" })
    await writeFile(path.join(root, "file"), "")
    expect(await arm(path.join(root, "file"))).toMatchObject({ reason: "missing" })

    const invalid: [string, string | Uint8Array][] = [
      ["sprint.json", "{"],
      ["sprint.json", '{"brief":"x"}'],
      ["sprint.json", '{"work_packages":[{"id":""}]}'],
      ["sprint.json", '{"work_packages":[]} {"work_packages":[]}'],
      ["sprint.json", "NaN"],
      ["sprint.json", new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])],
      ["meta.json", '{"base_ref":"abc"}'],
      ["meta.json", '{"workdir":1}'],
    ]
    for (const [name, text] of invalid) {
      const good = await readFile(path.join(dir, name))
      await writeFile(path.join(dir, name), text)
      expect(await arm(dir)).toMatchObject({ reason: "invalid", path: path.join(dir, name) })
      await writeFile(path.join(dir, name), good)
    }

    await rm(path.join(dir, "meta.json"))
    await symlink(path.join(root, "file"), path.join(dir, "meta.json"))
    expect(await arm(dir)).toMatchObject({ reason: "symlink", path: path.join(dir, "meta.json") })
  })

  test("a UTF-8 BOM is skipped, as jq does", async () => {
    const dir = await scratch()
    await writeFile(path.join(dir, "sprint.json"), "﻿" + '{"work_packages":[{"id":"a"}]}')
    await writeFile(path.join(dir, "meta.json"), '{"workdir":"/w"}')
    expect((await Effect.runPromise(ArmLoad.arm(dir))).sprint.work_packages[0]!.id).toBe("a")
  })
})

describe("create", () => {
  const plan: RelaySprint.Sprint = {
    brief: "Result+Summary",
    retry_budget: 2,
    work_packages: [
      { id: "write-result", macro: "build", checklist: [{ id: "result", cmd: "test -f result.json" }] },
      { id: "write-summary", instructions: "Summarize.\tDone.\n" },
    ],
  }
  const meta: RelayArm.Meta = { workdir: "/work", base_ref: "abc123", run_id: "01J" }
  const input = { token: "run-01J", sprint: plan, meta, agentID: "01J" }

  const files = async (arm: string) =>
    Object.fromEntries(
      await Promise.all(
        (await readdir(arm)).sort().map(async (name) => [name, await readFile(path.join(arm, name), "utf8")] as const),
      ),
    )

  test("creates the arm with compact JSON and no trailing LF, then loads it", async () => {
    const armsDir = path.join(await scratch(), "arms")
    expect(await run(armsDir, ArmCreate.create(input))).toBe("created")
    const arm = path.join(armsDir, "run-01J")
    expect(await files(arm)).toEqual({
      agent_id: "01J",
      "meta.json": '{"workdir":"/work","base_ref":"abc123","run_id":"01J"}',
      "sprint.json":
        '{"brief":"Result+Summary","retry_budget":2,"work_packages":[{"id":"write-result","macro":"build",' +
        '"checklist":[{"id":"result","cmd":"test -f result.json"}]},' +
        '{"id":"write-summary","instructions":"Summarize.\\tDone.\\n"}]}',
    })
    const loaded = await Effect.runPromise(ArmLoad.arm(arm))
    expect(loaded.sprint).toEqual(plan)
    expect(loaded.meta).toEqual(meta)
    expect(await readdir(armsDir)).toEqual(["run-01J"])
  })

  test("the same body is unchanged and leaves arm state alone; a different body is a Conflict", async () => {
    const armsDir = await scratch()
    const arm = path.join(armsDir, "run-01J")
    expect(await run(armsDir, ArmCreate.create(input))).toBe("created")
    await writeFile(path.join(arm, "position"), "build.write-result")
    const before = await files(arm)
    const mtime = (await stat(path.join(arm, "sprint.json"))).mtimeMs

    expect(await run(armsDir, ArmCreate.create(input))).toBe("unchanged")
    expect(await run(armsDir, ArmCreate.create({ ...input, sprint: structuredClone(plan) }))).toBe("unchanged")

    const conflicts = [
      { ...input, sprint: { ...plan, retry_budget: 3 } },
      { ...input, sprint: { work_packages: [...plan.work_packages].reverse() } },
      { ...input, meta: { ...meta, base_ref: "def456" } },
      { ...input, meta: { base_ref: "abc123", workdir: "/work", run_id: "01J" } }, // key order is the body
      { ...input, agentID: "someone-else" },
    ]
    for (const body of conflicts) {
      expect(await failure(armsDir, ArmCreate.create(body))).toMatchObject({
        _tag: "ArmCreate.Conflict",
        token: "run-01J",
      })
    }
    expect(await files(arm)).toEqual(before)
    expect((await stat(path.join(arm, "sprint.json"))).mtimeMs).toBe(mtime)
    expect(await readdir(armsDir)).toEqual(["run-01J"])
  })

  test("without an agent ID, a binding made by the first evaluation does not change the body", async () => {
    const armsDir = await scratch()
    const bare = { token: "tok", sprint: plan, meta }
    expect(await run(armsDir, ArmCreate.create(bare))).toBe("created")
    expect(existsSync(path.join(armsDir, "tok", "agent_id"))).toBe(false)
    await writeFile(path.join(armsDir, "tok", "agent_id"), "agent-7")
    expect(await run(armsDir, ArmCreate.create(bare))).toBe("unchanged")
    expect(await run(armsDir, ArmCreate.create({ ...bare, agentID: "agent-7" }))).toBe("unchanged")
    expect(await failure(armsDir, ArmCreate.create({ ...bare, agentID: "agent-8" }))).toMatchObject({
      _tag: "ArmCreate.Conflict",
    })
  })

  test("an empty arm directory is filled; a populated one without this body is a Conflict", async () => {
    const armsDir = await scratch()
    await mkdir(path.join(armsDir, "empty"))
    expect(await run(armsDir, ArmCreate.create({ ...input, token: "empty" }))).toBe("created")
    await mkdir(path.join(armsDir, "stale"))
    await writeFile(path.join(armsDir, "stale", "counter"), "1\n")
    expect(await failure(armsDir, ArmCreate.create({ ...input, token: "stale" }))).toMatchObject({
      _tag: "ArmCreate.Conflict",
    })
    expect(await readdir(path.join(armsDir, "stale"))).toEqual(["counter"])
    await symlink(path.join(armsDir, "empty"), path.join(armsDir, "alias"))
    expect(await failure(armsDir, ArmCreate.create({ ...input, token: "alias" }))).toMatchObject({
      _tag: "ArmState.StateError",
      reason: "symlink",
    })
  })

  test("refuses a bad token, an agent ID the hook cannot compare and a plan the loader would refuse", async () => {
    const armsDir = await scratch()
    const refused = [
      { ...input, token: ".." },
      { ...input, token: "a/b" },
      { ...input, agentID: "" },
      { ...input, agentID: "a\u0000b" },
      { ...input, sprint: { ...plan, gen: Number.NaN } },
      { ...input, sprint: { work_packages: [{ id: "" }] } },
      { ...input, meta: { workdir: undefined } as unknown as RelayArm.Meta },
      { ...input, sprint: { ...plan, brief: "x".repeat(ArmLoad.MAX_BYTES) } },
    ]
    for (const body of refused) {
      expect(await failure(armsDir, ArmCreate.create(body))).toMatchObject({ _tag: "ArmState.StateError" })
    }
    expect(await readdir(armsDir)).toEqual([])
  })

  test("concurrent PUTs settle on one winner", async () => {
    const armsDir = await scratch()
    const same = await run(
      armsDir,
      Effect.all(
        Array.from({ length: 8 }, () => ArmCreate.create(input)),
        { concurrency: "unbounded" },
      ),
    )
    expect(same.filter((result) => result === "created").length).toBe(1)
    expect(same.filter((result) => result === "unchanged").length).toBe(7)

    const bodies = Array.from({ length: 8 }, (_, n) => ({ ...input, token: "race", meta: { ...meta, run_id: `${n}` } }))
    const results = await run(
      armsDir,
      Effect.all(
        bodies.map((body) => Effect.exit(ArmCreate.create(body))),
        { concurrency: "unbounded" },
      ),
    )
    const winners = results.flatMap((exit, n) => (Exit.isSuccess(exit) ? [n] : []))
    expect(winners.length).toBe(1)
    expect(
      results.flatMap((exit) => (Exit.isFailure(exit) ? [Option.getOrUndefined(Exit.findErrorOption(exit))] : [])),
    ).toEqual(Array.from({ length: 7 }, () => expect.objectContaining({ _tag: "ArmCreate.Conflict", token: "race" })))
    const stored = JSON.parse(await readFile(path.join(armsDir, "race", "meta.json"), "utf8"))
    expect(stored.run_id).toBe(`${winners[0]}`)
    expect((await readdir(armsDir)).sort()).toEqual(["race", "run-01J"])
  })
})
