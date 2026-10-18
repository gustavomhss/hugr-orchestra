// Acceptance suite for `createPromptFactory` — the prompt as a versioned, hashed artifact (ADR-0011 D3).
//
// The load-bearing families:
//   • THE JUSTIFICATION MUST NOT REACH THE MODEL. The template carries its own per-clause reasoning as an
//     HTML comment so the argument is versioned beside the text. If that block were sent, the model would
//     be reading commentary about how often it is expected to abstain — steering the very behaviour the
//     prompt is trying to elicit honestly.
//   • A PROMPT WITHOUT SOURCE IS NEVER SENT. Two distinct refusals guard it: a template that never
//     interpolates the code is rejected at LOAD time, and an unreadable unit throws rather than degrading
//     into an abstention. "No fact here" and "we never showed it the unit" must stay different answers.
//   • THE DIGEST COVERS THE ARTIFACT AS SHIPPED, comment included — provenance answers "which artifact
//     produced this fact", and editing the reasoning edits the artifact.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { asSubtreeHash, defaultEncoder } from "@atlas/kernel"
import { bindSpan } from "@atlas/grounding"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, MinedSignals } from "@atlas/genesis"

import { createFileSourceReader, createPromptFactory, PromptError, shippedTemplatePath } from "../src/prompt.js"
import type { SourceReader } from "../src/prompt.js"
import { ABSTAIN_SENTINEL } from "../src/llm.js"

const created: string[] = []
afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true })
})

/** Write a template to a fresh temp dir and return its path. */
function templateAt(body: string): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-prompt-"))
  created.push(d)
  const p = join(d, "propose.md")
  writeFileSync(p, body)
  return p
}

const NO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const candidateAt = (qualifiedPath: string): Candidate => ({
  site: { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash("st-x") } as StructRef,
  signals: NO_SIGNALS,
  ppr: 0,
  rank: 1,
})

const reader = (text: string | null): SourceReader => ({ read: () => text })

const CODE = "export function charge(): void { /* the bytes the claim must re-derive from */ }"

function refusalOf(fn: () => unknown): PromptError {
  try {
    fn()
  } catch (e) {
    if (e instanceof PromptError) return e
    throw new Error(`expected a PromptError, got ${String(e)}`)
  }
  throw new Error("expected a throw, got a return")
}

describe("createPromptFactory — the SHIPPED template", () => {
  const factory = () => createPromptFactory({ source: reader(CODE) })

  it("interpolates the unit path, the unit name and the source", () => {
    const out = factory().build(candidateAt("packages/billing/src/charge.ts::charge"))
    expect(out).toContain("packages/billing/src/charge.ts")
    expect(out).toContain("charge")
    expect(out).toContain(CODE)
  })

  it("leaves NO unfilled placeholder in the sent text", () => {
    // teeth (breaks-on "a slot is renamed in the template but not here"): the model would receive a literal
    // `{{SOURCE}}` and answer about a unit it was never shown.
    expect(factory().build(candidateAt("a/b.ts::b"))).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it("STRIPS the justification comment — the reasoning is versioned, not sent", () => {
    // teeth (breaks-on "stripComments is removed"): the model would read, among other things, the note that
    // abstention is expected to be the common outcome — steering the behaviour instead of eliciting it.
    const out = factory().build(candidateAt("a/b.ts::b"))
    expect(out).not.toContain("<!--")
    expect(out).not.toContain("arXiv") // a citation that appears ONLY inside the justification block
    expect(out.trimStart().startsWith("You are shown")).toBe(true)
  })

  it("does NOT carry the mined signals — GEN-6 is made structurally unviolable, not instructed", () => {
    // `Candidate.signals` is never read by the builder. A churn/SZZ figure in the prompt is how a signal
    // becomes a "fact"; the surest way to honour GEN-6 is for the model never to see one.
    const cand = { ...candidateAt("a/b.ts::b"), signals: { ...NO_SIGNALS, szzBugCommits: 4242, owners: ["zelda"] } }
    const out = createPromptFactory({ source: reader(CODE) }).build(cand)
    expect(out).not.toContain("4242")
    expect(out).not.toContain("zelda")
  })

  it("the shipped template is the default, resolved without a cwd assumption, and it EXISTS", () => {
    const path = shippedTemplatePath()
    expect(path.endsWith("/prompts/propose.md")).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(() => factory()).not.toThrow()

    // HONEST LIMIT: this test runs from `src/`, so it cannot by itself catch the packaging bug it was
    // written for — `tsc` copies no assets, so a module-relative path resolved to `dist/prompts/` and the
    // built CLI refused every run while this suite stayed green. It was found by probing the built binary.
    // The regression guard that would catch it is the black-box subprocess run, not this assertion; what
    // this pins is that the path is package-root-relative, which is what makes both layouts agree.
    expect(path).toContain("/adapter-io/prompts/")
    expect(path).not.toContain("/dist/")
  })
})

describe("createPromptFactory — a prompt without source is never sent", () => {
  it("a template that never interpolates {{SOURCE}} is refused at LOAD time", () => {
    // teeth (breaks-on "assertUsable is removed"): every site would get a well-formed ask with no code, and
    // the model would answer all of them from parametric memory — ungrounded facts at full rate.
    const path = templateAt("Say something about {{UNIT}}.")
    const err = refusalOf(() => createPromptFactory({ source: reader(CODE), templatePath: path }))
    expect(err.refusal).toBe("template-has-no-source-slot")
  })

  it("an unreadable unit THROWS — it is not silently an abstention", () => {
    // teeth (breaks-on "the null branch returns the template unfilled / returns ''"): a broken anchor path
    // would report as "this unit holds no fact", so a wholly unreadable repo would look merely barren.
    const err = refusalOf(() => createPromptFactory({ source: reader(null) }).build(candidateAt("a/b.ts::b")))
    expect(err.refusal).toBe("source-unreadable")
    expect(err.message).toContain("a/b.ts::b")
  })

  it("an unreadable TEMPLATE is refused distinctly from an unreadable unit", () => {
    const err = refusalOf(() => createPromptFactory({ source: reader(CODE), templatePath: "/no/such/template.md" }))
    expect(err.refusal).toBe("template-unreadable")
  })
})

describe("createPromptFactory — the strip is NON-GREEDY and REPEATED", () => {
  // The shipped template has exactly ONE comment and no stray `-->`, so every other case here is blind to
  // the greediness the source comment claims: mutating `[\s\S]*?` to `[\s\S]*` survived the whole suite.
  // This fixture is the witness — two comments with a literal `-->` in the prose BETWEEN them.
  const TWO_COMMENTS = [
    "<!-- reason A -->",
    "Ask about {{UNIT}}. The arrow --> appears here in ordinary prose.",
    "<!-- reason B -->",
    "{{SOURCE}}",
    "",
  ].join("\n")

  it("strips BOTH comments and keeps the prose between them, `-->` and all", () => {
    // teeth (breaks-on "the strip becomes greedy"): `[\s\S]*` runs from the FIRST `<!--` to the LAST `-->`,
    // so the whole middle — the prose, the arrow and the `{{UNIT}}` slot — is swallowed and the model is
    // sent the source with no ask at all. Every assertion below distinguishes the two behaviours.
    const out = createPromptFactory({ source: reader(CODE), templatePath: templateAt(TWO_COMMENTS) }).build(
      candidateAt("a/b.ts::b"),
    )

    expect(out).toContain("The arrow --> appears here in ordinary prose.") // greedy: swallowed
    expect(out).toContain("Ask about b.") // greedy: swallowed with the slot
    expect(out).not.toContain("reason A") // non-greedy but UNREPEATED: reason B would survive
    expect(out).not.toContain("reason B")
    expect(out).not.toContain("<!--")
    expect(out).toContain(CODE)
  })
})

describe("createPromptFactory — the digest identifies the artifact as shipped", () => {
  const BODY = "<!-- reason A -->\nAsk about {{UNIT}}:\n{{SOURCE}}\n"

  it("the same template yields the same digest", () => {
    const a = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) })
    const b = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) })
    expect(a.digest).toBe(b.digest)
  })

  it("editing ONLY the justification changes the digest, though the sent text is identical", () => {
    // teeth (breaks-on "the digest is taken over the STRIPPED text"): the reasoning could then be rewritten
    // under a provenance record that claims the artifact is unchanged.
    const a = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) })
    const b = createPromptFactory({
      source: reader(CODE),
      templatePath: templateAt(BODY.replace("reason A", "reason B")),
    })
    expect(a.build(candidateAt("a/b.ts::b"))).toBe(b.build(candidateAt("a/b.ts::b"))) // same text sent
    expect(a.digest).not.toBe(b.digest) // different artifact
  })
})

describe("createPromptFactory — anchor naming", () => {
  it("splits `<file>::<symbol>` on the FIRST separator", () => {
    // The assertions are on the EXACT attribute, not on a substring of it. `toContain('src/a.ts')` cannot
    // tell `path="src/a.ts"` from `path="src/a.ts::ns"` — one is a prefix of the other — so a
    // `lastIndexOf` mutant survived it. That is the one-directional blindness of substring assertions,
    // already catalogued in this repo; the fix belongs in the assertion, not in the code.
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt("src/a.ts::ns::deep"))
    expect(out).toContain('path="src/a.ts"') // teeth: `lastIndexOf` yields `path="src/a.ts::ns"`
    expect(out).toContain('name="ns::deep"') // teeth: `lastIndexOf` yields `name="deep"`
  })

  it("a bare path (file / repo anchor) is its own name — never an empty unit", () => {
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt("src/a.ts"))
    expect(out).toContain('path="src/a.ts"')
    expect(out).toContain('name="src/a.ts"')
  })

  it("a TRAILING separator still names the unit — the model is never handed an anonymous anchor", () => {
    // `src/a.ts::` is malformed input from the index, and totality is the house rule: it must not throw and
    // must not degrade. teeth (breaks-on "the empty-name fallback is dropped"): the prompt would carry
    // `name=""`, asking the model to state a fact about a unit it cannot identify — an invitation to answer
    // about the file at large and call it a fact about a symbol.
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt("src/a.ts::"))
    expect(out).not.toContain('name=""')
    expect(out).toContain('name="src/a.ts::"')
  })
})

// ── createFileSourceReader ──────────────────────────────────────────────────────────────────────────────
// THIS FUNCTION HAD NO TESTS AT ALL until now, and a mutation deleting its entire repo-escape guard survived
// the whole suite. What it feeds is the operator's model endpoint, so anything it reads leaves the machine.
//
// The bytes it produced were decided by a purely textual `relative()` and a `readFileSync` that FOLLOWS
// symlinks — measured before the fix: a git-tracked `src/leak.ts → /etc/passwd` was READ and its contents
// interpolated into the prompt, because the NAME never left the repository while the READ did.
//
// Assertions are on EXACT values (`toBe`), never substrings: `toContain` cannot tell one file's bytes from
// another's when one is a prefix of the other, and that blindness has already let a mutant survive here.

describe("createFileSourceReader — only bytes that really live in the repository are read", () => {
  const repos: string[] = []
  afterEach(() => {
    while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
  })
  function repoDir(label: string): string {
    const d = mkdtempSync(join(tmpdir(), `atlas-reader-${label}-`))
    repos.push(d)
    return d
  }
  /** A `StructRef` built DIRECTLY, as the helpers above do — this suite tests the reader, not the producer. */
  const siteAt = (qualifiedPath: string): StructRef => candidateAt(qualifiedPath).site

  const BYTES = "export function charge(): void { /* the real unit */ }\n"

  it("a plain regular file inside the repo IS read, byte for byte", () => {
    // The control. Every refusal below is only meaningful because this one reads.
    const repo = repoDir("happy")
    mkdirSync(join(repo, "src"), { recursive: true })
    writeFileSync(join(repo, "src", "a.ts"), BYTES)
    expect(createFileSourceReader(repo).read(siteAt("src/a.ts::charge"))).toBe(BYTES)
  })

  it("a `../` escape is refused", () => {
    // teeth (breaks-on "both path guards are removed"): `../outside.txt` resolves to a real readable file
    // one level up, and the reader would ship it to the model. The textual test and the containment test
    // each refuse it independently, so removing EITHER alone leaves the other holding the door.
    const parent = repoDir("escape")
    const repo = join(parent, "repo")
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(parent, "outside.txt"), "not yours\n")
    expect(createFileSourceReader(repo).read(siteAt("../outside.txt"))).toBeNull()
  })

  it("an ABSOLUTE path is refused", () => {
    const repo = repoDir("abs")
    expect(createFileSourceReader(repo).read(siteAt("/etc/passwd"))).toBeNull()
  })

  it("the repo ROOT itself is refused — an empty relative path is not a source file", () => {
    // teeth (breaks-on "the `inside === ''` arm is dropped"): the root is a directory, and a reader that
    // accepted it would hand the caller whatever `readFileSync` does with a directory instead of refusing.
    const repo = repoDir("root")
    expect(createFileSourceReader(repo).read(siteAt(""))).toBeNull()
  })

  it("a SYMLINK to a file OUTSIDE the repo is refused — the name was inside, the bytes were not", () => {
    // The measured F2 defect, with a portable target standing in for `/etc/passwd`.
    // teeth (breaks-on "the fd read is replaced by readFileSync(abs)" AND on "the containment call is
    // dropped"): either alone still refuses this one; the point of the case is that the OUTCOME is a refusal.
    const outside = repoDir("leaktarget")
    const secret = join(outside, "passwd")
    writeFileSync(secret, "##\n# User Database\nroot:*:0:0\n")
    const repo = repoDir("leak")
    mkdirSync(join(repo, "src"), { recursive: true })
    symlinkSync(secret, join(repo, "src", "leak.ts"))
    expect(createFileSourceReader(repo).read(siteAt("src/leak.ts"))).toBeNull()
  })

  it("a SYMLINK to a file INSIDE the repo is ALSO refused — the documented behaviour change", () => {
    // teeth (breaks-on "the O_NOFOLLOW fd read is replaced by readFileSync(path)"): this link is contained by
    // every other check — its target is a repo file — so the fd door is the ONLY thing refusing it, and a
    // plain path read returns `real.ts`'s bytes. Refusing is deliberate: reading a link's target and
    // attributing the claim to the link's own path names a unit whose bytes live somewhere else.
    const repo = repoDir("inlink")
    mkdirSync(join(repo, "src"), { recursive: true })
    writeFileSync(join(repo, "src", "real.ts"), BYTES)
    symlinkSync(join(repo, "src", "real.ts"), join(repo, "src", "alias.ts"))
    expect(createFileSourceReader(repo).read(siteAt("src/alias.ts"))).toBeNull()
    expect(createFileSourceReader(repo).read(siteAt("src/real.ts"))).toBe(BYTES) // the target still reads
  })

  it("a symlinked INTERMEDIATE directory pointing out of the repo is refused", () => {
    // teeth (breaks-on "the isContainedIn call is dropped"): the final component here is an ORDINARY FILE,
    // so `O_NOFOLLOW` opens it happily, and the textual test sees `src/out/secret.txt` — no `..`, not
    // absolute. Kernel-identity containment is the ONLY check that refuses this one.
    const outside = repoDir("dirtarget")
    writeFileSync(join(outside, "secret.txt"), "not yours\n")
    const repo = repoDir("dirlink")
    mkdirSync(join(repo, "src"), { recursive: true })
    symlinkSync(outside, join(repo, "src", "out"))
    expect(createFileSourceReader(repo).read(siteAt("src/out/secret.txt"))).toBeNull()
  })

  it("a DIRECTORY and a MISSING file are refused, not thrown — the reader is total", () => {
    const repo = repoDir("total")
    mkdirSync(join(repo, "src"), { recursive: true })
    expect(createFileSourceReader(repo).read(siteAt("src"))).toBeNull()
    expect(createFileSourceReader(repo).read(siteAt("src/gone.ts"))).toBeNull()
  })
})

// ── evidenceSpan (the 2026-08-02 SPAN amendment) ────────────────────────────────────────────────────────
// The span is minted from the bytes ATLAS read, before any model is called. The hazard it must not
// reintroduce is the one ADR-0011 removed by withholding `Candidate.signals`: a proposer certifying its own
// grounding. So the assertions below are as much about what the prompt does NOT contain as about the span.

describe("createPromptFactory — evidenceSpan addresses the bytes, and never a self-report", () => {
  it("the span re-derives EXACTLY the source that was interpolated", () => {
    const factory = createPromptFactory({ source: reader(CODE) })
    const cand = candidateAt("src/a.ts::charge")
    const span = factory.evidenceSpan(cand)
    expect(span).not.toBeNull()
    const bytes = new TextEncoder().encode(CODE)
    const slice = bindSpan(defaultEncoder).readSpan(span!, bytes)
    expect(new TextDecoder().decode(slice)).toBe(CODE)
    // and those bytes really are what went to the model.
    expect(factory.build(cand)).toContain(CODE)
  })

  it("no bytes ⇒ NO span — absent is unknown, never a fabricated whole-unit citation", () => {
    // teeth (breaks-on "an unreadable source mints a zero-length or whole-repo span"): the reader refuses,
    // so there is nothing to address, and the entry must simply carry no span.
    expect(createPromptFactory({ source: reader(null) }).evidenceSpan(candidateAt("src/a.ts::charge"))).toBeNull()
  })

  it("the span moves with the BYTES, not with the site name", () => {
    const a = createPromptFactory({ source: reader(CODE) }).evidenceSpan(candidateAt("src/a.ts::charge"))
    const b = createPromptFactory({ source: reader(CODE) }).evidenceSpan(candidateAt("src/z.ts::other"))
    const c = createPromptFactory({ source: reader(`${CODE} // edited`) }).evidenceSpan(candidateAt("src/a.ts::charge"))
    expect(a).toEqual(b) //         same bytes ⇒ same address
    expect(a).not.toEqual(c) //     different bytes ⇒ different address
  })

  it("THE SHIPPED PROMPT NEVER ASKS FOR ONE — the span cannot be a proposer self-report", () => {
    // teeth (breaks-on "a {{SPAN}} slot / an 'output the lines you used' clause is added to propose.md"):
    // the model's whole channel is `CompletionResult.claim: string | null`, and the artifact must not grow a
    // second one. This also pins that the amendment left the prompt digest untouched.
    const shipped = readFileSync(shippedTemplatePath(), "utf8")
    for (const ask of ["{{SPAN}}", "span", "offset", "byte range", "quote"]) {
      expect(shipped.toLowerCase()).not.toContain(ask)
    }
  })

  it("#201/#202 COUPLING — both shipped prompts instruct the exact ABSTAIN_SENTINEL the gate reads", () => {
    // teeth (breaks-on "the prompt drops/renames the NO-FACT token while llm.ts keeps ABSTAIN_SENTINEL"):
    // the sentinel abstention only works if the model is TOLD the same word the gate matches. Prompt and gate
    // are two files; this pins them together, so a divergent edit to either goes red instead of silently
    // reopening the #201 prose-refusal-becomes-fact hole.
    const barePath = shippedTemplatePath()
    const enrichedPath = barePath.replace(/propose\.md$/, "propose-enriched.md")
    for (const p of [barePath, enrichedPath]) {
      expect(readFileSync(p, "utf8")).toContain(ABSTAIN_SENTINEL)
    }
  })
})
