// harness/gates/godfile-guard.test.mjs — the LOC ceiling's OWN teeth.
//
// The gate had two holes and both were invisible in exactly the same way: it printed OK for files it had
// never read. It ran `git ls-files packages`, so
//
//   1. an UNTRACKED file was not in the list. A 900-line module written and not yet `git add`ed scored a
//      green gate. The worst direction for this check to fail, because a file is most likely to be
//      oversized on the day it is first written.
//   2. `harness/**` was not in the list. Every gate enforcing the repo's standing bars was itself unbarred.
//
// Each fixture below is built as a REAL git repo, because the untracked leg is meaningless against a
// directory git has never heard of: `--others --exclude-standard` has to resolve `.gitignore`, and the
// point of the test is that the guard's list is git's, not a hand-rolled walk. Every case asserts on the
// EXIT CODE and on the guard's own message naming the file — a gate that fails for the wrong file, or
// fails silently, has not been tested.

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "godfile-guard.mjs")
const TARGET = 400 // requested bar — exceeding it warns, never fails
const HARD = 600 // enforced bar — exceeding it fails

let root

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" })
const write = (rel, lines) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  // `lines` newline-JOINED lines with NO trailing newline, so the guard's `split('\n').length` reads
  // exactly `lines`. The fixture is written in the guard's own units so the boundary cases mean what they
  // say — a real source file, which does end in a newline, measures one MORE than its `wc -l`.
  writeFileSync(join(root, rel), Array.from({ length: lines }, (_, i) => `// line ${i}`).join("\n"))
}

const writeWaivers = (entries) => {
  mkdirSync(join(root, "harness/gates"), { recursive: true })
  writeFileSync(join(root, "harness/gates/godfile-waivers.json"), `${JSON.stringify(entries, null, 2)}\n`)
}

/** Run the guard against the fixture root. Returns the exit code and the combined output. */
function run() {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], {
      env: { ...process.env, GODFILE_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out: stdout }
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-godfile-"))
  git("init", "-q")
  git("config", "user.email", "gate@example.invalid")
  git("config", "user.name", "gate")
  writeFileSync(join(root, ".gitignore"), "dist/\nnode_modules/\n")
  writeWaivers({})
  write("packages/core/src/ok.ts", 10)
  write("harness/gates/ok.mjs", 10)
  git("add", "-A")
  git("commit", "-qm", "fixture")
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("godfile-guard", () => {
  it("CONTROL — a clean fixture passes, and the count proves it actually read both scopes", () => {
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toMatch(/1 packages/)
    expect(out).toMatch(/1 harness/)
  })

  it("FAILS an UNTRACKED over-HARD file under packages/ — the file has never been `git add`ed", () => {
    write("packages/core/src/godfile.ts", HARD + 50)
    expect(git("status", "--porcelain")).toMatch(/\?\? packages\/core\/src\/godfile\.ts/)
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toMatch(/packages\/core\/src\/godfile\.ts/)
    rmSync(join(root, "packages/core/src/godfile.ts"))
    expect(run().code).toBe(0)
  })

  it("FAILS an over-HARD file under harness/ — the gates are subject to the bar they enforce", () => {
    write("harness/gates/godfile.mjs", HARD + 50)
    git("add", "-A")
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toMatch(/harness\/gates\/godfile\.mjs/)
    git("rm", "-q", "-f", "harness/gates/godfile.mjs")
    expect(run().code).toBe(0)
  })

  // A file in (TARGET, HARD] is over the requested bar but allowed: exit 0, and the file is NAMED under the
  // target-warning so the 400-line discipline stays visible. This is the whole point of the two-tier policy.
  it("WARNS but passes for a file over TARGET and under HARD — named, exit 0", () => {
    write("packages/core/src/warned.ts", TARGET + 50)
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toMatch(/over the 400-LOC target/)
    expect(out).toMatch(new RegExp(`${TARGET + 50}\\s+packages/core/src/warned\\.ts`))
    rmSync(join(root, "packages/core/src/warned.ts"))
  })

  // Both boundaries are EXCLUSIVE (`> TARGET`, `> HARD`): a file measuring exactly the number is under it.
  it("is EXCLUSIVE at both boundaries: exactly TARGET is silent, TARGET+1 warns, exactly HARD passes, HARD+1 fails", () => {
    write("packages/core/src/edge.ts", TARGET)
    expect(run().out).not.toMatch(/over the 400-LOC target/) // exactly TARGET: not even warned
    write("packages/core/src/edge.ts", TARGET + 1)
    expect(run().code).toBe(0) // over target, still passes
    write("packages/core/src/edge.ts", HARD)
    expect(run().code).toBe(0) // exactly HARD: passes
    write("packages/core/src/edge.ts", HARD + 1)
    const { code, out } = run()
    expect(code).toBe(1) // over HARD: fails
    expect(out).toMatch(new RegExp(`${HARD + 1}\\s+packages/core/src/edge\\.ts`))
    rmSync(join(root, "packages/core/src/edge.ts"))
  })

  it("permits only an active bounded waiver and rejects stale or exceeded entries", () => {
    const waived = "packages/adapter-io/src/reverify-store.ts"
    write(waived, HARD + 5)
    writeWaivers({
      [waived]: { maxLines: 705, reason: "owner-authorized fixture" },
    })
    let result = run()
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/authorized bounded waiver/)

    write(waived, 706)
    result = run()
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/waived through 705/)

    write(waived, HARD)
    result = run()
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/waiver is stale/)

    writeWaivers({})
    rmSync(join(root, waived))
    expect(run().code).toBe(0)
  })

  it("rejects a waiver for an unapproved path", () => {
    write("packages/core/src/unapproved.ts", HARD + 5)
    writeWaivers({
      "packages/core/src/unapproved.ts": { maxLines: HARD + 5, reason: "not authorized" },
    })
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toMatch(/waiver is not owner-authorized/)
    writeWaivers({})
    rmSync(join(root, "packages/core/src/unapproved.ts"))
    expect(run().code).toBe(0)
  })

  it("respects .gitignore rather than a denylist of its own — dist/ is out of scope", () => {
    write("packages/core/dist/generated.ts", HARD + 50)
    expect(run().code).toBe(0)
    rmSync(join(root, "packages/core/dist"), { recursive: true })
  })

  it("exempts .d.ts, which is generated output, not a module", () => {
    write("packages/core/src/huge.d.ts", HARD + 50)
    expect(run().code).toBe(0)
    rmSync(join(root, "packages/core/src/huge.d.ts"))
  })

  it("FAILS rather than passes when it cannot build its file list (no git ⇒ nothing was checked)", () => {
    const bare = mkdtempSync(join(tmpdir(), "atlas-godfile-nogit-"))
    try {
      mkdirSync(join(bare, "harness/gates"), { recursive: true })
      writeFileSync(join(bare, "harness/gates/godfile-waivers.json"), "{}\n")
      const prev = root
      root = bare
      const { code, out } = run()
      root = prev
      expect(code).toBe(1)
      expect(out).toMatch(/could not list files/)
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})
