export * as LedgerVerify from "./verify"

import { timingSafeEqual } from "node:crypto"
import { Effect, Redacted } from "effect"
import { RelayJson } from "../json"
import { LedgerChain } from "./chain"
import { LedgerRead } from "./read"

// `benchmark/verify_ledger.py` (WP1): the same messages, line for line, and the same exit codes.

export interface Result {
  // 0: intact, including an empty ledger or a valid nonterminal prefix; 1: broken or refused; 2: missing ledger.
  readonly exit: 0 | 1 | 2
  readonly stdout: string
  readonly stderr: string
}

// The key selects the mode the verifier demands; a keyed chain checked without it is REFUSED, never accepted as plain.
export const verify = (ledger: string, key?: Redacted.Redacted<string>): Effect.Effect<Result> =>
  LedgerRead.lines(ledger).pipe(
    // An empty RELAY_LEDGER_KEY is no key, as `if KEY:` reads it.
    Effect.map((lines) => check(lines, key !== undefined && Redacted.value(key) !== "" ? key : undefined)),
    Effect.catchTag("LedgerRead.Missing", () =>
      Effect.succeed<Result>({ exit: 2, stdout: "", stderr: `no ledger at ${ledger}\n` }),
    ),
    Effect.catchTag("LedgerRead.ReadError", (error) =>
      Effect.succeed(broken([`BROKEN ledger: cannot read ${ledger} (${error.reason})`])),
    ),
  )

export const TERMINAL = ["sprint-complete", "escalate"] as const

function check(lines: ReadonlyArray<string>, key: Redacted.Redacted<string> | undefined): Result {
  const mode = key ? "KEYED (HMAC-SHA256)" : "PLAIN (SHA-256)"
  const chain = { prev: "GENESIS", checklist: 0, last: "" }
  for (const [index, line] of lines.entries()) {
    const linked = link(line, index + 1, chain.prev, key, mode)
    if ("failure" in linked) return broken(linked.failure)
    chain.prev = linked.h
    chain.last = linked.event
    if (linked.event === "checklist-item") chain.checklist++
  }
  const notes = [
    `LEDGER INTACT — ${lines.length} chained entries [${mode}], chain head ${chain.prev.slice(0, 12)}…`,
    ...(chain.checklist ? [`  (${chain.checklist} checklist-item verdicts on the chain)`] : []),
    ...(key
      ? []
      : [
          "  NOTE: plain mode is tamper-evident, not unforgeable. Set RELAY_LEDGER_KEY for an adversary-resistant (keyed) chain.",
        ]),
    ...(lines.length > 0 && !TERMINAL.some((event) => event === chain.last)
      ? [
          `  NOTE: trace ends on '${chain.last}', not a terminal event — possible tail-truncation; only an out-of-band anchor of the head can rule it out.`,
        ]
      : []),
  ]
  return { exit: 0, stdout: notes.map((note) => `${note}\n`).join(""), stderr: "" }
}

// One line's checks in the verifier's order: the printed failure, or the line's digest and event.
function link(
  line: string,
  n: number,
  prev: string,
  key: Redacted.Redacted<string> | undefined,
  mode: string,
): { readonly failure: ReadonlyArray<string> } | { readonly h: string; readonly event: string } {
  const decoded = RelayJson.read(line)
  if (decoded._tag === "Failure")
    return { failure: [`BROKEN line ${n}: invalid or ambiguous JSON (${decoded.failure.reason})`] }
  const entry = decoded.success
  if (!(entry instanceof RelayJson.Members)) return { failure: [`BROKEN line ${n}: entry must be a JSON object`] }
  const h = entry.get("h")
  if (h === undefined) return { failure: [`TAMPERED line ${n}: missing h field (malformed or truncated entry)`] }
  if (entry.entries.at(-1)?.[0] !== "h")
    return { failure: [`TAMPERED line ${n}: h must be the final root member (unsigned fields after h)`] }
  if (typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h))
    return { failure: [`TAMPERED line ${n}: h must be a SHA-256 hex string`] }
  const body = signed(line)
  if (body === undefined) return { failure: [`TAMPERED line ${n}: missing final root h delimiter`] }
  // A missing `mac` is a legacy plain line; a present null is not.
  const sealed = entry.get("mac")
  const stamped = sealed === undefined ? "sha256" : sealed
  if (stamped !== (key ? "hmac-sha256" : "sha256")) {
    if (stamped === "hmac-sha256" && !key)
      return {
        failure: [
          `REFUSED line ${n}: this is a KEYED chain (mac=hmac-sha256) — set RELAY_LEDGER_KEY to verify it. Validating it as plain would accept a forgery.`,
        ],
      }
    if (stamped === "sha256" && key)
      return {
        failure: [
          `REFUSED line ${n}: a key is set but this entry is sealed PLAIN (mac=sha256) — possible downgrade of a keyed chain. Refusing to accept it as intact.`,
        ],
      }
    return { failure: [`TAMPERED line ${n}: unknown MAC algorithm ${RelayJson.repr(stamped)}`] }
  }
  if (!timingSafeEqual(Buffer.from(LedgerChain.mac(body, key)), Buffer.from(h)))
    return {
      failure: [
        `TAMPERED line ${n}: MAC mismatch under ${mode}`,
        ...(key ? ["   (wrong key, or the line was altered — both fail identically by design)"] : []),
      ],
    }
  const linked = entry.get("prev") ?? null
  if (linked !== prev)
    return {
      failure: [
        `TAMPERED line ${n}: broken link (prev=${RelayJson.repr(linked)}, expected ${RelayJson.reprString(prev)})`,
        "   -> a preceding line was altered, removed, or reordered.",
      ],
    }
  const seq = entry.get("seq") ?? null
  if (!(seq instanceof RelayJson.Int) || BigInt(seq.digits) !== BigInt(n - 1))
    return { failure: [`TAMPERED line ${n}: seq=${RelayJson.repr(seq)}, expected ${n - 1}`] }
  const event = entry.get("event")
  if (typeof event !== "string" || LedgerRead.strip(event) === "")
    return { failure: [`BROKEN line ${n}: event must be a nonempty string`] }
  return { h, event }
}

// `body_bytes`: everything before the final `,"h":`, closed again. The delimiter must start the final root member, not
// a nested `data.h` spelled the same way.
function signed(line: string) {
  const at = line.lastIndexOf(',"h":')
  if (at === -1) return undefined
  const suffix = RelayJson.read(`{${line.slice(at + 1)}`)
  if (suffix._tag === "Failure" || !(suffix.success instanceof RelayJson.Members)) return undefined
  if (suffix.success.entries.length !== 1 || suffix.success.entries[0]![0] !== "h") return undefined
  return `${line.slice(0, at)}}`
}

function broken(lines: ReadonlyArray<string>): Result {
  return { exit: 1, stdout: lines.map((line) => `${line}\n`).join(""), stderr: "" }
}
