// Acceptance suite for `loadModelConfig` — the OPERATOR-scoped model command (ADR-0011 Decision 2).
//
// Two families carry the weight:
//   • THE SECURITY BOUNDARY. The config names an executable Atlas will RUN. If it could be sourced from the
//     repository under analysis, `atlas mine` on a cloned repo would be an arbitrary-code-execution path.
//     The refusal is asserted to happen BEFORE the file is opened, so it cannot depend on contents.
//   • ABSENT vs MALFORMED. Absent ⇒ `null` (no model wired — the honest zero-config state). Malformed ⇒
//     THROW. This deliberately INVERTS `loadPolicy`, which fails closed to a denying default: a denying
//     policy is safe, whereas a silently-absent model abstains everywhere and reports a clean empty run —
//     indistinguishable from a repo that genuinely holds no groundable fact.
//   • EVERY KNOB IS AN INTEGER, and the resolved config therefore REACHES THE SEALED `id` SEAM. ADR-0011
//     promises the resolved configuration is hashed into the run's provenance; the shipped default cost cap
//     was `0.05`, which `canonical.ts` refuses outright, so the promise was unimplementable rather than
//     merely unimplemented. The ratio is now an exact integer pair (`rank.ts`'s `DAMPING_NUM`/`DAMPING_DEN`
//     idiom) and a float is REFUSED rather than coerced.

import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { id } from "@atlas/kernel"

import {
  loadModelConfig,
  modelConfigPath,
  ModelConfigError,
  PROVISIONAL_COST_CAP,
  PROVISIONAL_COST_CAP_DEN,
  PROVISIONAL_COST_CAP_NUM,
  PROVISIONAL_TIMEOUT_MS,
} from "../src/model-config.js"

/** Exact paths this suite created, removed one by one — never a glob, never a pattern sweep. */
const created: string[] = []
function tempDir(label: string): string {
  const d = mkdtempSync(join(tmpdir(), `atlas-modelcfg-${label}-`))
  created.push(d)
  return d
}
afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true })
})

/** An operator config that is valid in every respect — so a refusal can never be blamed on its contents. */
const VALID = JSON.stringify({ roles: { propose: { cmd: "some-model-cli", args: ["-m", "a-model"] } } })

/** Point `$ATLAS_MODEL_CONFIG` at `path` without touching the real environment. */
const envAt = (path: string): NodeJS.ProcessEnv => ({ ATLAS_MODEL_CONFIG: path })

// ── the folding probe: what this filesystem can actually reproduce ──────────────────────────────────────
// Case folding is a property of the VOLUME, not of the platform — APFS folds ASCII case, ext4 folds nothing,
// and CI runs on ext4 while this machine runs on APFS. The case-variant story below is only a test on a
// volume that folds; anywhere else `…/REPO` names a different, non-existent directory, the bypass has no
// second spelling to attack through, and a green tick would report coverage that does not exist. So it is
// SKIPPED there, loudly and specifically, rather than passing vacuously.

/** Does the KERNEL say these two spellings are the same directory? The oracle — never `toLowerCase()`,
 *  which is a guess about a volume's folding table and the reason the string guard was wrong. */
function sameDirectory(a: string, b: string): boolean {
  try {
    const x = statSync(a, { bigint: true })
    const y = statSync(b, { bigint: true })
    return x.dev === y.dev && x.ino === y.ino
  } catch {
    return false
  }
}

/** Ask that same oracle, ON THE VOLUME THE FIXTURES ACTUALLY USE, whether `variant` denotes the directory
 *  created as `name`. Probed, never inferred from `process.platform`: a case-sensitive volume mounted on
 *  macOS folds nothing, and a probe is the only thing that knows. */
function probeFolds(name: string, variant: string): boolean {
  const probe = mkdtempSync(join(tmpdir(), "atlas-fold-probe-"))
  try {
    mkdirSync(join(probe, name))
    return sameDirectory(join(probe, name), join(probe, variant))
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

const FOLDS_CASE = probeFolds("probe", "PROBE")
const SKIP_SUFFIX = " — SKIPPED: this filesystem does not fold case, so the bypass has no second spelling"
if (!FOLDS_CASE) {
  console.warn(
    `[model-config.test] NOT COVERED on this filesystem (${tmpdir()}): it does not fold ASCII case, so ` +
      "`…/repo` and `…/REPO` are two different directories and the F1 case-variant bypass of the " +
      "inside-repo (arbitrary-code-execution) guard cannot be reproduced here. That guard is UNTESTED on " +
      "this run — not passing. It is exercised on a folding volume (APFS).",
  )
}

function refusalOf(fn: () => unknown): ModelConfigError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ModelConfigError) return e
    throw new Error(`expected a ModelConfigError, got ${String(e)}`)
  }
  throw new Error("expected a throw, got a return")
}

describe("loadModelConfig — the security boundary (ADR-0011 D2)", () => {
  it("REFUSES a config that lives inside the repository under analysis, however valid it is", () => {
    // The attack: ship `.atlas/model.json` in a repo, tell the victim to export ATLAS_MODEL_CONFIG in a
    // README. Without this refusal, `atlas mine` then executes whatever `cmd` names.
    const repo = tempDir("repo")
    mkdirSync(join(repo, ".atlas"), { recursive: true })
    const planted = join(repo, ".atlas", "model.json")
    writeFileSync(planted, VALID) // byte-for-byte the config that loads fine from outside

    const err = refusalOf(() => loadModelConfig(repo, envAt(planted)))
    expect(err.refusal).toBe("inside-repo")
    // teeth (breaks-on "the isInside guard is removed"): the identical bytes load successfully below, so
    // nothing about the CONTENTS can be what makes this fail — only the location.
    expect(err.message).toContain("arbitrary-code-execution")
  })

  it("the SAME bytes load fine from outside the repo — the location is the only difference", () => {
    const repo = tempDir("repo")
    const elsewhere = tempDir("operator")
    const path = join(elsewhere, "model.json")
    writeFileSync(path, VALID)

    expect(loadModelConfig(repo, envAt(path))?.roles.propose).toStrictEqual({
      cmd: "some-model-cli",
      args: ["-m", "a-model"],
    })
  })

  it("the refusal happens BEFORE the file is opened — a path that does not even exist is still refused", () => {
    // teeth (breaks-on "the guard is moved below the readFileSync"): a non-existent path would then take
    // the ENOENT branch and return `null`, so the boundary would silently not apply to a missing file —
    // and the caller would learn nothing about a repo trying to name its own executable.
    const repo = tempDir("repo")
    const ghost = join(repo, "deep", "nested", "never-created.json")
    expect(refusalOf(() => loadModelConfig(repo, envAt(ghost))).refusal).toBe("inside-repo")
  })

  it("the repo ROOT itself is inside the repo — containment includes the directory, not just its children", () => {
    const repo = tempDir("repo")
    expect(refusalOf(() => loadModelConfig(repo, envAt(repo))).refusal).toBe("inside-repo")
  })

  it("a SIBLING directory whose name merely PREFIXES the repo path is NOT inside it", () => {
    // teeth (breaks-on "containment is implemented as a startsWith(repoPath) string test"): `…/repo-notes`
    // starts with `…/repo` as a string while being a different directory, so a prefix test would refuse a
    // perfectly legitimate operator config. Path-relative containment gets this right.
    const repo = tempDir("repo")
    const sibling = `${repo}-notes`
    mkdirSync(sibling, { recursive: true })
    created.push(sibling)
    const path = join(sibling, "model.json")
    writeFileSync(path, VALID)

    expect(loadModelConfig(repo, envAt(path))).not.toBeNull()
  })

  it.skipIf(!FOLDS_CASE)(
    `a config planted inside the repo is refused through a CASE-VARIANT spelling of the repo path too${FOLDS_CASE ? "" : SKIP_SUFFIX}`,
    () => {
      // THE F1 BYPASS. `realpathSync` is case-PRESERVING on APFS — it hands back the path as REQUESTED, not
      // the canonical on-disk name — so `…/repo` and `…/REPO`, one directory to the kernel, stayed two strings
      // to `relative()`, which returned a `..`-prefixed path and let the guard read "outside the repo".
      // Measured against the built module before the fix: the honest spelling was refused, and the case
      // variant LOADED `{"cmd":"/bin/sh","args":["-c","echo PLANTED-COMMAND-RAN"]}`.
      //
      // teeth (breaks-on "containment is decided by string relative() again"): the refusal below disappears
      // and `loadModelConfig` returns a config naming a command `atlas mine` would then execute.
      //
      // FILESYSTEM-CONDITIONAL, and it SKIPS rather than asserting something else. On a case-SENSITIVE volume
      // (CI's ext4 runner) `…/REPO` is a different, non-existent directory: the case cannot reproduce the
      // condition, so it cannot fail, and a green tick would read as coverage that does not exist. The
      // predicate is probed against the real filesystem below, never guessed from `process.platform`.
      const parent = tempDir("caserepo")
      const repo = join(parent, "repo")
      mkdirSync(join(repo, ".atlas"), { recursive: true })
      const planted = join(repo, ".atlas", "model.json")
      writeFileSync(planted, VALID)
      const variantPath = join(parent, "REPO", ".atlas", "model.json")

      // ANTI-VACUITY: the two spellings must really be one directory here, or the case proves nothing.
      expect(sameDirectory(repo, join(parent, "REPO"))).toBe(true)
      expect(refusalOf(() => loadModelConfig(repo, envAt(variantPath))).refusal).toBe("inside-repo")
    },
  )
})

describe("loadModelConfig — absent is a state, malformed is an error", () => {
  it("an ABSENT config is `null` — the honest zero-config state, not an error", () => {
    const repo = tempDir("repo")
    const elsewhere = tempDir("operator")
    expect(loadModelConfig(repo, envAt(join(elsewhere, "nothing-here.json")))).toBeNull()
  })

  it('a NON-JSON config THROWS — it must never degrade to "no model wired"', () => {
    // teeth (breaks-on "the JSON.parse catch returns null"): a typo'd config would then produce a clean,
    // empty run that reads exactly like a repository with nothing to say.
    const repo = tempDir("repo")
    const elsewhere = tempDir("operator")
    const path = join(elsewhere, "model.json")
    writeFileSync(path, "{ this is not json")
    expect(refusalOf(() => loadModelConfig(repo, envAt(path))).refusal).toBe("not-json")
  })

  describe("validation names the offending field", () => {
    const badConfig = (body: unknown): (() => unknown) => {
      const repo = tempDir("repo")
      const elsewhere = tempDir("operator")
      const path = join(elsewhere, "model.json")
      writeFileSync(path, JSON.stringify(body))
      return () => loadModelConfig(repo, envAt(path))
    }

    it("a missing `roles.propose` is refused — it is the cheap-pass binding", () => {
      const err = refusalOf(badConfig({ roles: { refuter: { cmd: "x", args: [] } } }))
      expect(err.refusal).toBe("malformed")
      expect(err.message).toContain("roles.propose")
    })

    it("`args` given as a STRING is refused, and the message says why there is no splitting", () => {
      // The likeliest operator mistake, because every other tool in the world takes a command line. There
      // is no shell here, so `"-m a-model"` would become one argv entry and surface as a baffling ENOENT.
      const err = refusalOf(badConfig({ roles: { propose: { cmd: "x", args: "-m a-model" } } }))
      expect(err.message).toContain("no shell")
    })

    it("an EMPTY `cmd` is refused", () => {
      expect(refusalOf(badConfig({ roles: { propose: { cmd: "   ", args: [] } } })).refusal).toBe("malformed")
    })

    it("a PRESENT-but-invalid `timeoutMs` is refused, never silently defaulted", () => {
      // teeth (breaks-on "optionalPositiveInteger falls back instead of refusing on an invalid value"): a
      // `timeoutMs: 0` typo would silently become 60s, and the operator would never learn their cap is dead.
      expect(refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, timeoutMs: 0 })).refusal).toBe(
        "malformed",
      )
    })

    it("a FRACTIONAL `timeoutMs` is refused — every knob is an integer, and the canonicalizer is why", () => {
      // teeth (breaks-on "the Number.isInteger test is relaxed back to Number.isFinite"): `1500.5` would be
      // admitted into the resolved config, and the config could then never be canonicalized at all.
      const err = refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, timeoutMs: 1500.5 }))
      expect(err.refusal).toBe("malformed")
      expect(err.message).toContain("INTEGER")
    })

    it("a FRACTIONAL `costCapNum` is refused — the ceiling is an exact ratio, never a decimal", () => {
      // teeth (breaks-on "the Number.isInteger test is relaxed back to Number.isFinite"): the pair would
      // carry a float, `id(cfg)` would throw `floats forbidden`, and the resolved configuration could not
      // be hashed into the run's provenance — the exact defect the pair exists to close.
      const err = refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, costCapNum: 0.5, costCapDen: 10 }))
      expect(err.refusal).toBe("malformed")
      expect(err.message).toContain("costCapNum")
    })

    it("a DECIMAL `costCap` is refused and the refusal names its replacement — never ignored, never rounded", () => {
      // `{"costCap": 0.05}` is the spelling ADR-0011's own example JSON showed, so operators will have
      // written it. teeth (breaks-on "the unknown key is simply ignored"): the operator would keep a config
      // that reads as if a ceiling were set while the default silently applied.
      const err = refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, costCap: 0.05 }))
      expect(err.refusal).toBe("malformed")
      expect(err.message).toContain("costCapNum")
      expect(err.message).toContain("costCapDen")
    })

    it("HALF a ratio is refused — a numerator without a denominator is not a ceiling", () => {
      expect(refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, costCapNum: 5 })).refusal).toBe(
        "malformed",
      )
      expect(refusalOf(badConfig({ roles: { propose: { cmd: "x", args: [] } }, costCapDen: 100 })).refusal).toBe(
        "malformed",
      )
    })
  })

  it("ABSENT numeric fields take the provisional defaults, which are labelled provisional in source", () => {
    const repo = tempDir("repo")
    const elsewhere = tempDir("operator")
    const path = join(elsewhere, "model.json")
    writeFileSync(path, VALID)
    const cfg = loadModelConfig(repo, envAt(path))
    expect(cfg?.timeoutMs).toBe(PROVISIONAL_TIMEOUT_MS)
    expect(cfg?.costCapNum).toBe(PROVISIONAL_COST_CAP_NUM)
    expect(cfg?.costCapDen).toBe(PROVISIONAL_COST_CAP_DEN)
    // The decimal is DERIVED from the pair and is exactly the value that used to be the literal `0.05`.
    expect(cfg?.costCap).toBe(PROVISIONAL_COST_CAP)
    expect(cfg?.costCap).toBe(0.05)
  })
})

describe("loadModelConfig — the resolved config reaches the sealed `id` seam", () => {
  // ADR-0011 Decision 2 promises the resolved configuration is HASHED INTO THE RUN'S PROVENANCE. That was
  // not merely unimplemented before this suite: it was UNIMPLEMENTABLE for the value Atlas shipped, because
  // `canonical.ts` forbids a non-integer number and the default cost cap WAS `0.05`. Measured on the base
  // commit: `id({ roles, timeoutMs: 60000, costCap: 0.05 })` threw "canonical-form violation: floats
  // forbidden". These cases are what stop that from coming back.
  function loadValid(): NonNullable<ReturnType<typeof loadModelConfig>> {
    const repo = tempDir("repo")
    const elsewhere = tempDir("operator")
    const path = join(elsewhere, "model.json")
    writeFileSync(path, VALID)
    const cfg = loadModelConfig(repo, envAt(path))
    if (cfg === null) throw new Error("expected a config")
    return cfg
  }

  it("the DEFAULT resolved config canonicalizes — no float survives into it", () => {
    // teeth (breaks-on "a decimal cost cap is admitted into the resolved config again", by any route —
    // a float default, a relaxed validator, or the derived decimal becoming an enumerable own key): `id`
    // throws `floats forbidden` and this case goes red.
    const cfg = loadValid()
    expect(() => id(cfg as never)).not.toThrow()
    expect(typeof id(cfg as never)).toBe("string")
  })

  it("the PAIR is what the preimage carries — the derived decimal is excluded, and identically so", () => {
    // The exclusion is stated in source, so it is asserted here rather than left as a comment: two configs
    // whose pairs are equal have one id, and the derived decimal is not an own enumerable key at all.
    const cfg = loadValid()
    expect(Object.keys(cfg).sort()).toStrictEqual(["costCapDen", "costCapNum", "roles", "timeoutMs"])
    expect(id(cfg as never)).toBe(id({ ...cfg } as never)) // a spread copy drops nothing that is hashed
  })
})

describe("modelConfigPath — the resolved location is discoverable, not guesswork", () => {
  it("$ATLAS_MODEL_CONFIG wins over $XDG_CONFIG_HOME", () => {
    const path = modelConfigPath({ ATLAS_MODEL_CONFIG: "/somewhere/explicit.json", XDG_CONFIG_HOME: "/xdg" })
    expect(path).toBe("/somewhere/explicit.json")
  })

  it("$XDG_CONFIG_HOME is honoured when no explicit path is set", () => {
    expect(modelConfigPath({ XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/atlas/model.json")
  })

  it("an EMPTY env var does not count as set — it falls through rather than resolving to the cwd", () => {
    // teeth (breaks-on "the `.trim() !== ''` emptiness test is dropped"): `ATLAS_MODEL_CONFIG=` would
    // resolve to the current working directory, which inside a repo trips the security refusal for a user
    // who set nothing at all.
    expect(modelConfigPath({ ATLAS_MODEL_CONFIG: "", XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/atlas/model.json")
  })
})
