// @atlas/cli — test/error-attribution-cli.test.ts  (WP-F2F5 over the CLI transport + the exit-code pin)
//
// Two things are pinned here, and neither was pinned anywhere before.
//
// (1) THE THREE ERROR CLASSES, as the CLI actually renders them. The CLI has its own render path, so a fix
//     at the handler is not a fix here: the `reason:` line and the `invariant:` line are what an operator
//     and a log both see, and an internal fault must not arrive wearing the tool's caller-facing guidance.
//
// (2) THE EXIT CODE OF A GOVERNANCE REFUSAL RAISED AT THE ENTRYPOINT. `atlas emit` / `atlas link` over a
//     COMMITTED durable store exited 1 — a CLI usage error — because the provenance gate fires before the
//     door. Every sibling refusal of a write (unauthorized / unratified / ungrounded) exits 2. NO TEST
//     COVERED IT EITHER WAY: `s20` and `doctor-provenance-total` both assert `not.toBe(0)`, which is
//     satisfied by 1 and by 2 alike, so the contract a script depends on was unpinned in both directions.
//
// The handler injected below is the REAL `createHandler` over throwing legs — a canned-verdict fake would
// pin the rendering and skip the attribution entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHandler, INTERNAL_GUIDANCE } from "@atlas/tools"
import type { ToolLeg } from "@atlas/tools"
import type { WiredHandler } from "@atlas/adapter-io"
import { main } from "../src/cli.js"

/** THE DISCRIMINANT — everything before the first `:` (the `reasonOf` rule, ADR-0007). */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The `reason: …` line the CLI renders, without its label — or `''` when none was rendered. */
function reasonLine(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("reason: "))
  return line === undefined ? "" : line.slice("reason: ".length)
}

/** The `invariant: …` line the CLI renders. */
function invariantLine(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("invariant: "))
  return line === undefined ? "" : line.slice("invariant: ".length)
}

/** The `status: …` line. */
const statusLine = (stdout: string): string =>
  (stdout.split("\n").find((l) => l.startsWith("status: ")) ?? "").slice("status: ".length)

const throwing =
  (e: unknown): ToolLeg =>
  () => {
    throw e
  }

/** The read-provenance refusal, shaped as `adapter-io` ships it: the discriminant leads the text. */
const REFUSAL =
  "untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT " +
  "rather than through a governed door. To repair it: `git rm -r --cached .atlas/`"

/** A handler whose every governance leg throws `e` — the real handler, so the real attribution runs. */
function handlerThatThrows(e: unknown): WiredHandler {
  const leg = throwing(e)
  return createHandler({
    "atlas-init": leg,
    "atlas-query": leg,
    "atlas-emit": leg,
    "atlas-reconcile": leg,
    "atlas-link": leg,
  })
}

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

const out = (): string => writes.join("")

describe("WP-F2F5 over the CLI — the rendered outcome names WHOSE fault it is", () => {
  it("I1: an internal crash renders as `internal-fault` with the internal invariant, not the tool's", async () => {
    const crash = new TypeError("Cannot read properties of undefined (reading 'contentHash')")
    const code = await main(["link", "k:one", "k:two"], { handler: handlerThatThrows(crash) })

    expect(reasonOf(reasonLine(out()))).toBe("internal-fault")
    // The tool guidance for `atlas-link` tells the caller to "fix and re-link". Printing that under our own
    // crash is the blame-shift in its most concrete form — an operator reading it goes and edits the command.
    expect(invariantLine(out())).toBe(INTERNAL_GUIDANCE.invariant)
    // An internal fault is an ERROR (exit 1), not a governance rejection (exit 2): no gate declined anything.
    expect(code).toBe(1)
    expect(statusLine(out())).toBe("error")
  })

  it("I2/I3: a governed refusal reaching the CLI keeps its own name on the reason line", async () => {
    const noAxes = "atlas query --by dependency|trigger needs the composition-root axes"
    await main(["query", "src"], { handler: handlerThatThrows(new Error(noAxes)) })
    expect(reasonLine(out())).toBe(noAxes) // verbatim: no prefix of ours, no relabel

    writes = []
    const untrusted = new Error(REFUSAL)
    untrusted.name = "UntrustedStoreError"
    await main(["query", "src"], { handler: handlerThatThrows(untrusted) })
    expect(reasonOf(reasonLine(out()))).toBe("untrusted-store")
  })

  it("class (a): a schema-violating argument is `malformed-args` and the leg is never reached", async () => {
    let calls = 0
    const leg: ToolLeg = () => {
      calls += 1
      return { emitted: true } as never
    }
    // `--at` is a VALUED flag; `emit` marshals `{ node, at }` where `node` is read from a file. The file is
    // absent, so this stops at the marshaller — the case that DOES reach the door is `reconcile`, whose
    // `mergeBase` the schema declares as a string. `--by` is folded to a string by the parser, so a wrong
    // TYPE has to be injected at the handler; what the CLI can produce is the ENVELOPE case, below.
    const handler = createHandler({ "atlas-reconcile": leg })
    const code = await main(["reconcile", "HEAD~1"], { handler })
    expect(calls).toBe(1) // the well-formed call goes through — the door narrows, it does not refuse all
    expect(code).toBe(0)

    writes = []
    // The envelope case, straight at the door (the shape an MCP client can send and the CLI cannot).
    const v = handler.handle("atlas-reconcile", "HEAD~1")
    expect(reasonOf(v.rejected)).toBe("malformed-args")
    expect(calls).toBe(1) // still 1 — the malformed call never reached the leg
  })
})

describe("EXIT CODE — a governance refusal at the entrypoint is 2, not 1", () => {
  const deps = (): { handler: WiredHandler; readRefusal: string } => ({
    handler: handlerThatThrows(new Error("the door is never reached in these cases")),
    readRefusal: REFUSAL,
  })

  it("`emit` and `link` over a committed store exit 2 — the same code every OTHER write refusal uses", async () => {
    // The write doors are the sharpest case: a script that branches on `$?` sees 2 for unauthorized,
    // unratified and ungrounded, and saw 1 for this one, purely because THIS gate runs in the entrypoint.
    expect(await main(["emit", "fact.json", "--at", "deadbeef"], deps())).toBe(2)
    writes = []
    expect(await main(["link", "k:one", "k:two"], deps())).toBe(2)
  })

  it("the READ doors refuse with the same code — the class is the outcome, not read-vs-write", async () => {
    for (const argv of [
      ["query", "src"],
      ["node", "0".repeat(64)],
      ["doctor", "hotset", "5"],
      ["reconcile", "HEAD"],
    ]) {
      writes = []
      expect(await main(argv, deps()), argv.join(" ")).toBe(2)
    }
  })

  it("the refusal is RENDERED as a rejection, carrying its own name and its remediation", async () => {
    await main(["query", "src"], deps())
    expect(statusLine(out())).toBe("rejected")
    expect(reasonOf(reasonLine(out()))).toBe("untrusted-store")
    expect(out()).toContain("git rm -r --cached") // a refusal a user cannot act on is a dead end
    // And it does NOT claim the invocation was malformed — `errorVerdict`'s invariant line said exactly that.
    expect(invariantLine(out())).not.toContain("malformed invocation")
  })

  it("CONTROL: with no refusal present the SAME argv reaches the door and exits on the door's verdict", async () => {
    // Teeth against a mutant that pins exit 2 unconditionally: the refusal must be what selects the code.
    const code = await main(["query", "src"], { handler: handlerThatThrows(new TypeError("boom")) })
    expect(code).toBe(1)
    expect(statusLine(out())).toBe("error")
  })
})
