// harness/probes/atlas-store-read.mjs — the READ side of a durable Atlas store, from the OUTSIDE.
//
// Split out of `genesis-output-probe.mjs` along the seam the product itself draws: `store.ts` owns the
// immutable content-addressed CAS, `sidecar.ts` owns the one mutable cell and the order it is read back in.
// This module is that pair, restated for a reader that holds no `@atlas/*` import — the harness invariant
// (`harness/README.md`): harness code reasons about the repo from the outside and never links product
// internals, so it stays a clean `git mv` into Orchestra.
//
// ── WHAT IS RESTATED HERE, AND THEREFORE CAN DRIFT ───────────────────────────────────────────────────────
// Three product rules are transcribed rather than imported. Each names its source so a reader can diff them:
//   1. the sidecar READ ORDER — newest READABLE `<base>.<g>.json`, then the next one down, then the
//      pre-protocol `<base>.json` mirror  (`packages/adapter-io/src/sidecar.ts`, `readSidecarSet`);
//   2. the CAS value path — `<repo>/.atlas/cas/<h[0:2]>/<h>`  (`packages/adapter-io/src/store.ts`, `valuePath`);
//   3. the CAS key charset — exactly 64 lowercase hex, checked BEFORE any filesystem touch  (same file, `get`).
//
// What is deliberately NOT restated: the canonical preimage and the BLAKE3 digest. This module never
// re-derives a `contentHash` or a `nodeKey`, so a caller can check that a store AGREES WITH ITSELF and can
// never check that it agrees with `@atlas/kernel`. That second question has a shipped answer — `atlas node
// <addr>` re-hashes on read — and the probe reaches for the binary instead of reimplementing the seam.
//
// TOTAL AND READ-ONLY. Every function here answers `undefined` / an empty result on a miss, a non-regular
// file, unparseable bytes or an absent directory, and none of them writes, creates or removes anything.

import { execFileSync } from "node:child_process"
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** A CAS key / nodeKey at runtime: exactly 64 lowercase hex (`store.ts` `get`, applied before any read). */
export const HEX64 = /^[0-9a-f]{64}$/

/** The store root and the CAS root of a repository (`compose.ts`: `.atlas/` and `.atlas/cas`). */
export const atlasDir = (repo) => join(repo, ".atlas")
export const casDir = (repo) => join(atlasDir(repo), "cas")

/** The sharded, content-addressed value path for `h` — `<cas>/<h[0:2]>/<h>` (`store.ts` `valuePath`). */
export const valuePath = (repo, h) => join(casDir(repo), h.slice(0, 2), h)

/**
 * Every published generation NUMBER of one sidecar family, DESCENDING — including ones that fail to parse,
 * because a corrupt generation still OCCUPIES its name (`sidecar.ts` `generations`). Total: an absent
 * directory is "no generations", never a throw.
 */
export function generations(repo, base) {
  let names
  try {
    names = readdirSync(atlasDir(repo))
  } catch {
    return []
  }
  const re = new RegExp(`^${base}\\.(\\d{1,15})\\.json$`)
  const out = []
  for (const n of names) {
    const m = re.exec(n)
    if (m !== null) out.push(Number(m[1]))
  }
  return out.sort((a, b) => b - a)
}

/**
 * Parse ONE sidecar file. `undefined` on a missing file, unparseable bytes, or a shape that is valid JSON
 * but not a projection (`{}`, `[]`, `{current:5}`) — the same three refusals `readOne` makes.
 *
 * The `[key, row]` entries are handed back RAW. Validating them is the caller's job on purpose: the product
 * rejects the WHOLE file on one bad row, which is right for a store that must not be selectively poisoned,
 * and wrong for a probe, whose entire value is naming WHICH row is bad.
 */
function readSidecarFile(file) {
  let wire
  try {
    wire = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
  if (wire === null || typeof wire !== "object") return undefined
  if (!Array.isArray(wire.current) || !Array.isArray(wire.cas)) return undefined
  return { entries: wire.current, cas: wire.cas, identity: wire.identity, gen: wire.gen, builtAt: wire.builtAt, file }
}

/**
 * The newest READABLE state of one sidecar family (`projection` | `staging`), by the product's own read
 * order. The distinction between the two absent cases is the whole point and is carried out whole:
 *   `present:false, unreadable:true`  — files EXIST and none of them parses. NOT "0 facts".
 *   `present:false, unreadable:false` — nothing was ever published here.
 * Reporting the first as the second is the amplification that once turned a torn read into a 402-node
 * erasure, and the one `promote.md` warns about in the other direction.
 */
export function readSidecar(repo, base) {
  const gens = generations(repo, base)
  const top = gens.length > 0 ? gens[0] : 0
  for (const g of gens) {
    const hit = readSidecarFile(join(atlasDir(repo), `${base}.${g}.json`))
    if (hit !== undefined) return { ...hit, present: true, unreadable: false, top }
  }
  const mirror = readSidecarFile(join(atlasDir(repo), `${base}.json`))
  if (mirror !== undefined) return { ...mirror, present: true, unreadable: false, top }
  const anyFile = gens.length > 0 || existsSync(join(atlasDir(repo), `${base}.json`))
  return { present: false, unreadable: anyFile, top, entries: [], cas: [] }
}

/**
 * Read a CAS object back by content address. Total on every branch: a bad charset, a miss, a non-regular
 * file (device / FIFO / directory / symlink) or unparseable bytes all answer `undefined`, never a throw.
 * `lstat` rather than `stat` so a symlink is refused rather than followed — the product opens the final
 * component `O_NOFOLLOW` for the same reason, and a probe that follows one would read a file the product
 * never would.
 */
export function casGet(repo, h) {
  if (typeof h !== "string" || !HEX64.test(h)) return undefined
  const p = valuePath(repo, h)
  try {
    if (!lstatSync(p).isFile()) return undefined
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return undefined
  }
}

/**
 * Which durable-store files git TRACKS. A `.atlas/` that arrived by COMMIT is `untrusted`
 * (`store-provenance.ts`): it reads as EMPTY and refuses every write, so judging one tells you nothing
 * about what a run produced. `undefined` means git could not be consulted at all — reported as unknown,
 * never assumed clean.
 */
export function trackedStoreFiles(repo) {
  let listed
  try {
    listed = execFileSync("git", ["ls-files", "--", ".atlas"], { cwd: repo, encoding: "utf8" })
  } catch {
    return undefined
  }
  return listed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => /(^|\/)(projection|staging)(\.\d+)?\.json$/.test(l) || l.includes("/cas/"))
}
