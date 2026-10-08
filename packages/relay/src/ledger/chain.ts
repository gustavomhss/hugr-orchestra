export * as LedgerChain from "./chain"

import path from "node:path"
import { createHash, createHmac } from "node:crypto"
import { appendFileSync, mkdirSync, readFileSync, rmdirSync } from "node:fs"
import { Effect, Redacted, Result, Schema } from "effect"
import { RelayJson } from "../json"

// `relay_chain_append` and `bin/relay-note` (WP1): the only way a line reaches a ledger.

export class AppendError extends Schema.TaggedErrorClass<AppendError>()("LedgerChain.AppendError", {
  ledger: Schema.String,
  // lock: `.chain.lock` not acquired after 200 tries 50 ms apart; body: not one object, or a top-level `h`;
  // write: the append itself failed. Nothing is appended in any case and an owned lock is always released.
  reason: Schema.Literals(["lock", "body", "write"]),
}) {}

export interface AppendInput {
  readonly ledger: string
  // One compact JSON object without a top-level `h`; nested `h` is allowed.
  readonly body: string
  // The sprint generation, resolved once per evaluation; anything but a nonnegative integer resolves to 0.
  readonly gen: number
  // HMAC-SHA256 with the key, plain SHA-256 without. The mode is stamped as `mac` inside the hashed body.
  readonly key?: Redacted.Redacted<string>
}

export interface Appended {
  readonly seq: number
  readonly h: string
  // The appended line without its LF.
  readonly line: string
}

/**
 * Appends `body + {gen, prev, seq, mac}` and then `h` as the final root member, under the ledger directory's
 * `.chain.lock` mkdir lock. `prev` is the previous line's `h` (GENESIS first) and `seq` the previous seq + 1.
 *
 * The lock, the tail read and the append are synchronous: effect 4.0.0-beta.83 drops an async step of a release when
 * its fiber is interrupted, and an interrupted async write could still land after the lock was released. Only the
 * waits between lock attempts are interruptible, and no lock is held during them.
 */
export const append = (input: AppendInput): Effect.Effect<Appended, AppendError> => {
  const lock = path.join(path.dirname(input.ledger), LOCK)
  // Like the bash loop, keep trying through any mkdir failure (Windows reports a lock directory that is still being
  // removed as EPERM), except a missing parent directory, which waiting cannot fix.
  const take = (attempt: number): Effect.Effect<void, AppendError> =>
    Effect.try({ try: () => mkdirSync(lock), catch: (error) => error }).pipe(
      Effect.catch((error) =>
        attempt + 1 >= LOCK_ATTEMPTS || code(error) === "ENOENT" || code(error) === "ENOTDIR"
          ? Effect.fail(new AppendError({ ledger: input.ledger, reason: "lock" }))
          : Effect.interruptible(Effect.sleep(`${LOCK_INTERVAL_MS} millis`)).pipe(
              Effect.flatMap(() => take(attempt + 1)),
            ),
      ),
    )
  return Effect.acquireUseRelease(
    take(0),
    () => seal(input),
    () => Effect.try({ try: () => rmdirSync(lock), catch: () => undefined }).pipe(Effect.ignore),
  )
}

export const LOCK = ".chain.lock"
export const LOCK_ATTEMPTS = 200
export const LOCK_INTERVAL_MS = 50

// The keyed or plain digest of a signed body, as hex. Verification uses the same function.
export const mac = (body: string, key?: Redacted.Redacted<string>): string => {
  const secret = key === undefined ? "" : Redacted.value(key)
  if (secret === "") return createHash("sha256").update(body).digest("hex")
  return createHmac("sha256", secret).update(body).digest("hex")
}

/**
 * `RELAY_GEN`: what `jq -r '.gen // 0'` prints for sprint.json (read with the jq flavor), and 0 unless that is all
 * digits. A float literal such as `7.0`, a negative number, a non-digit string and a missing or unreadable sprint all
 * resolve to 0, while the string "7" resolves to 7.
 */
export const generation = (sprint: RelayJson.Node | undefined): number => {
  const gen = sprint instanceof RelayJson.Members ? sprint.get("gen") : undefined
  const printed = gen instanceof RelayJson.Int ? gen.digits : typeof gen === "string" ? gen.replace(/\n+$/, "") : ""
  return /^\d+$/.test(printed) && Number.isSafeInteger(Number(printed)) ? Number(printed) : 0
}

function seal(input: AppendInput) {
  return Effect.gen(function* () {
    const fail = (reason: AppendError["reason"]) => Effect.fail(new AppendError({ ledger: input.ledger, reason }))
    // The body is read as jq read it: a repeated key keeps its first place and its last value.
    const parsed = RelayJson.read(input.body, { flavor: "jq" })
    const body = Result.isSuccess(parsed) && parsed.success instanceof RelayJson.Members ? parsed.success : undefined
    if (body === undefined || body.get("h") !== undefined) return yield* fail("body")
    const tail = link(lastLine(input.ledger))
    if (tail === undefined) return yield* fail("write")
    const keyed = input.key !== undefined && Redacted.value(input.key) !== ""
    // jq's `body + {gen, prev, seq, mac}`: a key the body already has keeps its place and takes the new value.
    const suffix = new Map<string, RelayJson.Node>([
      ["gen", new RelayJson.Int(String(Number.isSafeInteger(input.gen) && input.gen >= 0 ? input.gen : 0))],
      ["prev", tail.prev],
      ["seq", new RelayJson.Int(String(tail.seq))],
      ["mac", keyed ? "hmac-sha256" : "sha256"],
    ])
    const written = RelayJson.compactNode(
      new RelayJson.Members([
        ...body.entries.map((entry) => [entry[0], suffix.get(entry[0]) ?? entry[1]] as const),
        ...[...suffix].filter((entry) => body.get(entry[0]) === undefined),
      ]),
    )
    const h = mac(written, input.key)
    const line = `${written.slice(0, -1)},"h":"${h}"}`
    yield* Effect.try({
      try: () => appendFileSync(input.ledger, `${line}\n`),
      catch: () => new AppendError({ ledger: input.ledger, reason: "write" }),
    })
    return { seq: tail.seq, h, line }
  })
}

// `tail -1` as jq then reads it: an unreadable ledger is an empty one, and invalid UTF-8 becomes U+FFFD.
function lastLine(ledger: string) {
  const bytes = Result.try(() => readFileSync(ledger))
  const text = Result.isSuccess(bytes) ? RelayJson.argText(bytes.success) : ""
  return text.replace(/\n$/, "").split("\n").at(-1) ?? ""
}

/**
 * `jq -r '.h // empty'` and `jq -r '.seq // -1'` over the last line, read the way jq reads it (a repeated key keeps
 * its last value). Undefined when the tail holds an `h` or `seq` the bash writer would have fed to bash arithmetic or
 * printed as raw JSON; the TS writer refuses to link from it (PARITY-EXCEPTIONS WP1-1).
 */
function link(last: string) {
  const parsed = RelayJson.read(last, { flavor: "jq" })
  const tail = Result.isSuccess(parsed) && parsed.success instanceof RelayJson.Members ? parsed.success : undefined
  const h = tail?.get("h")
  const seq = tail?.get("seq")
  const prev = h === undefined || h === null || h === false ? "GENESIS" : raw(h)
  const next =
    seq === undefined || seq === null || seq === false
      ? 0
      : seq instanceof RelayJson.Int && Number.isSafeInteger(Number(seq.digits))
        ? Number(seq.digits) + 1
        : undefined
  if (prev === undefined || next === undefined) return undefined
  return { prev: prev === "" ? "GENESIS" : prev, seq: next }
}

// jq's raw output as `$(...)` captures it: NUL dropped and trailing LF stripped.
function raw(node: RelayJson.Node) {
  if (typeof node === "string") return node.replaceAll("\u0000", "").replace(/\n+$/, "")
  if (node === true) return "true"
  if (node instanceof RelayJson.Int) return node.digits
  return undefined
}

function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined
}
