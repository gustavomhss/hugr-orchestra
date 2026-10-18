// Acceptance suite for `isContainedIn` — the ONE predicate two security doors ask (containment.ts).
//
// The thing under test is a claim about the KERNEL, not about strings, so most of these cases are built by
// creating a real directory and then NAMING IT DIFFERENTLY. Every spelling below denotes the same inode on a
// filesystem that folds it; the predicate must answer the same way the kernel would, and a string comparison
// cannot.
//
// TWO CASES ARE FILESYSTEM-CONDITIONAL, and they SKIP rather than assert something weaker. APFS (macOS,
// default) folds case and Unicode normalization; ext4 (Linux CI) folds neither. On a folding volume
// `…/repo` and `…/REPO` are ONE directory and containment must say so — that is the property under test. On
// a non-folding volume there is no second spelling at all, so the case cannot reproduce its condition and
// cannot fail: it would then be asserting "a different, non-existent directory is not contained", which the
// `genuinely outside` case above already covers, dressed up as coverage of the bypass. A test that cannot
// fail must SAY so, so the folding is PROBED against the real filesystem and the case is skipped with a
// loud, specific reason naming what went uncovered. Where it does run, the folding branch carries an
// anti-vacuity assertion proving the two spellings really do diverge as text — otherwise the case would
// pass merely because both sides were spelled identically, which is exactly how the unit suite missed this
// defect the first time.

import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve, sep } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { isContainedIn } from "../src/containment.js"

/** Exact paths this suite created, removed one by one — never a glob, never a pattern sweep. */
const created: string[] = []
function tempDir(label: string): string {
  const d = mkdtempSync(join(tmpdir(), `atlas-containment-${label}-`))
  created.push(d)
  return d
}
afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true })
})

/** The kernel's OWN verdict on "are these two names the same file". The oracle the predicate is measured
 *  against — never `toLowerCase()`, never `normalize()`, both of which are guesses about a volume's rules. */
function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a, { bigint: true })
    const y = statSync(b, { bigint: true })
    return x.dev === y.dev && x.ino === y.ino
  } catch {
    return false
  }
}

/** Ask that oracle, ON THE VOLUME THE FIXTURES ACTUALLY USE, whether `variant` denotes the directory created
 *  as `name`. PROBED, never inferred from `process.platform`: a case-sensitive volume mounted on macOS folds
 *  nothing, and only the filesystem knows its own table. */
function probeFolds(name: string, variant: string): boolean {
  const probe = mkdtempSync(join(tmpdir(), "atlas-fold-probe-"))
  try {
    mkdirSync(join(probe, name))
    return sameFile(join(probe, name), join(probe, variant))
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

// The two probes, run once at load. Written as ESCAPES for the normalization probe, never as literal bytes:
// an editor that normalized this file would make both spellings one string and the probe would answer about
// nothing.
const FOLDS_CASE = probeFolds("probe", "PROBE")
const FOLDS_NORMALIZATION = probeFolds("caf\u00e9", "cafe\u0301")
const SKIP_CASE = " — SKIPPED: this filesystem does not fold case, so there is no second spelling"
const SKIP_NFC = " — SKIPPED: this filesystem does not fold Unicode normalization"

if (!FOLDS_CASE || !FOLDS_NORMALIZATION) {
  console.warn(
    `[containment.test] NOT COVERED on this filesystem (${tmpdir()}): it folds ` +
      `${FOLDS_CASE ? "" : "no ASCII case"}${!FOLDS_CASE && !FOLDS_NORMALIZATION ? " and " : ""}` +
      `${FOLDS_NORMALIZATION ? "" : "no Unicode normalization"}. The skipped case(s) below are the ONLY ` +
      "ones that exercise the F1 bypass — two spellings of one inode — and on this volume that bypass has " +
      "no second spelling to attack through. Those legs are UNTESTED on this run, not passing; they are " +
      "exercised on a folding volume (APFS).",
  )
}

describe("isContainedIn — containment is decided by (dev, ino), not by text", () => {
  it("the root IS contained in itself — the directory, not only its children", () => {
    const root = tempDir("root")
    expect(isContainedIn(root, root)).toBe(true)
  })

  it("a file beneath the root is contained", () => {
    const root = tempDir("root")
    const f = join(root, "a", "b.txt")
    mkdirSync(join(root, "a"), { recursive: true })
    writeFileSync(f, "x")
    expect(isContainedIn(root, f)).toBe(true)
  })

  it("a leaf that DOES NOT EXIST YET, under an existing contained parent, is contained", () => {
    // teeth (breaks-on "the walk requires the candidate to exist / returns false when the leaf is absent"):
    // both callers decide the boundary BEFORE opening the file, so a check that needs the file to be there
    // would be inapplicable in exactly the case it exists for — a config the attacker has not written yet.
    const root = tempDir("root")
    expect(isContainedIn(root, join(root, "never", "created", "model.json"))).toBe(true)
  })

  it("a genuinely outside directory is NOT contained", () => {
    const root = tempDir("root")
    const outside = tempDir("outside")
    expect(isContainedIn(root, join(outside, "model.json"))).toBe(false)
  })

  it("a SIBLING whose name merely PREFIXES the root is NOT contained", () => {
    // teeth (breaks-on "containment is implemented as startsWith(root)"): `…-notes` starts with the root as
    // a string while being a different inode, and a prefix test would refuse a legitimate operator config.
    const root = tempDir("root")
    const sibling = `${root}-notes`
    mkdirSync(sibling, { recursive: true })
    created.push(sibling)
    writeFileSync(join(sibling, "model.json"), "x")
    expect(isContainedIn(root, join(sibling, "model.json"))).toBe(false)
  })

  it.skipIf(!FOLDS_CASE)(
    `a CASE VARIANT of the root IS contained — one inode, two spellings${FOLDS_CASE ? "" : SKIP_CASE}`,
    () => {
      // teeth (breaks-on "containment is decided by string relative() again", the F1 bypass): `realpathSync`
      // is case-PRESERVING on APFS — it returns the path as requested — so `…/REPO/x` and `…/repo` compare as
      // different strings while being one directory, `relative()` yields `..`, and the guard reads "outside".
      const parent = tempDir("case")
      const root = join(parent, "repo")
      mkdirSync(root)
      const variant = join(parent, "REPO")

      // ANTI-VACUITY, twice: the volume must really fold these two spellings onto one directory (the probe
      // said so; this asserts it for THIS directory), and they must really diverge as text.
      expect(sameFile(root, variant)).toBe(true)
      expect(relative(resolve(root), resolve(variant)).startsWith("..")).toBe(true)

      expect(isContainedIn(root, join(variant, ".atlas", "model.json"))).toBe(true)
    },
  )

  it.skipIf(!FOLDS_NORMALIZATION)(
    `an NFD/NFC VARIANT of the root IS contained — one inode, two spellings${FOLDS_NORMALIZATION ? "" : SKIP_NFC}`,
    () => {
      // The same bypass in a different alphabet: the directory is created NFC-composed and named NFD-decomposed.
      // teeth (breaks-on "spellings are compared after normalize()/toLowerCase()"): a volume's folding table is
      // the volume's, not JavaScript's — guessing it is how a guard ends up disagreeing with the filesystem.
      const parent = tempDir("nfc")
      // Written as ESCAPES, never as literal bytes: an editor that normalizes this file would silently
      // make both sides the same string, and the case would go vacuous with nobody the wiser.
      const nfc = "caf\u00e9" //  c-a-f-é      (NFC, one composed code point)
      const nfd = "cafe\u0301" // c-a-f-e-́  (NFD, base letter + combining acute)
      const root = join(parent, nfc)
      mkdirSync(root)
      const variant = join(parent, nfd)

      expect(sameFile(root, variant)).toBe(true) // anti-vacuity: the volume really folds THESE two
      expect(resolve(root)).not.toBe(resolve(variant)) // anti-vacuity: two distinct strings, one directory
      expect(isContainedIn(root, join(variant, "model.json"))).toBe(true)
    },
  )

  it("a ~8000-segment path returns a VERDICT instead of throwing RangeError", () => {
    // teeth (breaks-on "the climb resolves one segment per stack frame again"): the predecessor recursed per
    // path segment, so a deep path blew the stack — an UNCAUGHT throw out of a security check, which the
    // callers turn into a crash rather than a refusal.
    const root = tempDir("deep")
    const deep = join(root, Array.from({ length: 8000 }, () => "x").join(sep))
    expect(isContainedIn(root, deep)).toBe(true)

    const outside = tempDir("deep-outside")
    expect(isContainedIn(root, join(outside, Array.from({ length: 8000 }, () => "x").join(sep)))).toBe(false)
  })

  it("an UNRESOLVABLE root contains nothing — the failure direction is closed", () => {
    // teeth (breaks-on "a root that cannot be stat'd is treated as containing everything / the walk throws"):
    // a mistyped repo path would then make every candidate inside-repo, or crash the caller.
    const ghost = join(tempDir("ghost"), "no-such-root")
    expect(isContainedIn(ghost, join(ghost, "model.json"))).toBe(false)
  })

  it("a symlink INSIDE the root whose target lives outside is NOT contained — bytes, not names", () => {
    // Containment is a claim about where the BYTES are. The name is inside; the file is not.
    const root = tempDir("linkroot")
    const outside = tempDir("linktarget")
    const target = join(outside, "secret.txt")
    writeFileSync(target, "not yours")
    const link = join(root, "leak.txt")
    symlinkSync(target, link)
    expect(isContainedIn(root, link)).toBe(false)
  })

  it("a symlink OUTSIDE the root whose target lives inside IS contained — the same rule, other direction", () => {
    // teeth (breaks-on "the climb walks the REQUESTED spelling instead of the resolved one"): an operator
    // config that is merely a link to a file the repo ships would otherwise be loaded and RUN.
    const root = tempDir("inroot")
    const outside = tempDir("inlink")
    const target = join(root, "planted.json")
    writeFileSync(target, "{}")
    const link = join(outside, "model.json")
    symlinkSync(target, link)
    expect(isContainedIn(root, link)).toBe(true)
  })
})
